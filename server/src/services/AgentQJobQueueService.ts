import { connect, type MqttClient } from 'mqtt';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/database.js';
import type { AgentQConfig } from '../config/agentq.js';
import { emitMealEvent } from '../events/mealEvents.js';
import type { Ingredient, JobQueueService, RecipeSummary, ShoppingItemJob } from './JobQueueService.js';

interface AgentQJobRequest {
  job_id: string;
  parent_job_id?: string;
  app_id: string;
  prompt: string;
  provider: string;
  model: string;
  params?: {
    temperature?: number;
  };
  tools?: unknown[];
  callback_topic?: string;
  metadata?: Record<string, unknown>;
}

interface AgentQJobResult {
  job_id: string;
  parent_job_id?: string;
  app_id: string;
  status: string;
  output?: {
    text?: string;
  };
  error?: string;
}

interface RecipeCardOutput {
  title: string;
  prep_time_minutes: number;
  cook_time_minutes: number;
  servings: number;
  kitchen_prep: {
    tools: string[];
    equipment_setup: string[];
    notes: string[];
  };
  ingredient_prep: Array<{
    ingredient: string;
    steps: string[];
  }>;
  cook_steps: string[];
  serve_steps: string[];
  safety_notes: string[];
}

interface MealPlanOutput {
  recipes: Array<{
    name: string;
    ingredients: Ingredient[];
  }>;
  shoppingItems: Ingredient[];
}

interface ShoppingListOutput {
  items: Ingredient[];
}

type ParsedJobId =
  | { scope: 'meal'; mealId: string; jobType: 'generate' | 'extend' | 'shopping' }
  | { scope: 'meal'; mealId: string; jobType: 'shopitem'; itemId: string }
  | { scope: 'recipe'; recipeId: string; jobType: 'card' };

const buildMealGenerationPrompt = (description: string) => `
You are @meal-planner and generating recipes for a meal plan.
Return JSON only in the following shape, and nothing else.

{"recipes":[{"name":"Recipe Name","ingredients":[{"name":"ingredient","quantity":1,"unit":"unit"}]}],"shoppingItems":[{"name":"item","quantity":1,"unit":"unit"}]}

Requirements:
- Build a distinct shopping list across all recipes in shoppingItems.
- Consolidate duplicates (same item name and unit) by summing quantities.
- Use numeric quantities and short units (g, ml, tbsp, tsp, cup, pcs).

Meal description:
${description}
`.trim();

const formatRecipeList = (recipes: RecipeSummary[]) => {
  if (recipes.length === 0) return 'None';
  return recipes
    .map((recipe) => {
      const ingredients = recipe.ingredients
        .map((ingredient) => `- ${ingredient.quantity} ${ingredient.unit} ${ingredient.name}`)
        .join('\n');
      return `${recipe.name}\n${ingredients}`;
    })
    .join('\n\n');
};

const buildAdditionalRecipesPrompt = (prompt: string, recipes: RecipeSummary[]) => `
You are @meal-planner. We already have these recipes:

${formatRecipeList(recipes)}

Add more recipes based on the request below. Do not repeat existing recipes.
Return JSON only in the following shape, and nothing else.

{"recipes":[{"name":"Recipe Name","ingredients":[{"name":"ingredient","quantity":1,"unit":"unit"}]}],"shoppingItems":[{"name":"item","quantity":1,"unit":"unit"}]}

Requirements:
- Only include NEW recipes in recipes.
- Build a distinct shopping list across ALL recipes (existing + new) in shoppingItems.
- Consolidate duplicates (same item name and unit) by summing quantities.
- Use numeric quantities and short units (g, ml, tbsp, tsp, cup, pcs).

Request:
${prompt}
`.trim();

const buildRecipeCardPrompt = (title: string, ingredients: Ingredient[]) => {
  const list = ingredients
    .map((ingredient) => `- ${ingredient.quantity} ${ingredient.unit} ${ingredient.name}`)
    .join('\n');

  return `
You are @meal-recipe-card. Create a step-by-step recipe card for the recipe below.
Return JSON only in the following shape, and nothing else.

{
  "title": "...",
  "prep_time_minutes": 0,
  "cook_time_minutes": 0,
  "servings": 0,
  "kitchen_prep": {
    "tools": ["..."],
    "equipment_setup": ["..."],
    "notes": ["..."]
  },
  "ingredient_prep": [
    { "ingredient": "...", "steps": ["..."] }
  ],
  "cook_steps": ["..."],
  "serve_steps": ["..."],
  "safety_notes": ["..."]
}

Recipe title:
${title}

Ingredients:
${list}
`.trim();
};

const buildShoppingPrompt = (ingredients: Ingredient[]) => {
  const lines = ingredients.map((item) => `- ${item.quantity} ${item.unit} ${item.name}`).join('\n');
  return `
You are building a shopping list.
Return JSON only in the following shape, and nothing else.

{"items":[{"name":"item","quantity":1,"unit":"unit"}]}

Requirements:
- Consolidate duplicates (same item name and unit) by summing quantities.
- Keep units short (g, ml, tbsp, tsp, cup, pcs).

Ingredients:
${lines}
`.trim();
};

const parseJsonOutput = <T>(result: AgentQJobResult): T => {
  const text = result.output?.text?.trim();
  if (!text) {
    throw new Error('AgentQ completion missing output.text');
  }
  return JSON.parse(text) as T;
};

const parseJobId = (jobId: string): ParsedJobId | null => {
  const [prefix, id, jobType, itemId] = jobId.split(':');
  if (prefix === 'meal') {
    if (!id || !jobType) return null;
    if (jobType === 'shopitem') {
      if (!itemId) return null;
      return { scope: 'meal', mealId: id, jobType, itemId };
    }
    if (jobType !== 'generate' && jobType !== 'extend' && jobType !== 'shopping') return null;
    return { scope: 'meal', mealId: id, jobType };
  }

  if (prefix === 'recipe') {
    if (!id || jobType !== 'card') return null;
    return { scope: 'recipe', recipeId: id, jobType };
  }

  return null;
};

export class AgentQJobQueueService implements JobQueueService {
  private client: MqttClient;
  private config: AgentQConfig;

  constructor(config: AgentQConfig) {
    this.config = config;
    this.client = connect(config.brokerUrl, {
      username: config.username,
      password: config.password,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      this.client.subscribe(config.completeTopic, { qos: config.qos }, (error) => {
        if (error) {
          console.error('[AgentQ] Failed to subscribe to completion topic', error);
        } else {
          console.log(`[AgentQ] Subscribed to ${config.completeTopic}`);
        }
      });
    });

    this.client.on('message', (topic, payload) => {
      if (topic !== this.config.completeTopic) return;
      const raw = payload.toString();
      try {
        const result = JSON.parse(raw) as AgentQJobResult;
        void this.handleCompletion(result);
      } catch (error) {
        console.error('[AgentQ] Failed to parse completion payload', error);
      }
    });

    this.client.on('error', (error) => {
      console.error('[AgentQ] MQTT error', error);
    });
  }

  async enqueueMealGeneration(mealId: string, description: string): Promise<void> {
    await prisma.meal.update({
      where: { id: mealId },
      data: { status: 'GENERATING_RECIPES' },
    });

    emitMealEvent({ type: 'status', mealId, status: 'GENERATING_RECIPES' });

    const job: AgentQJobRequest = {
      job_id: `meal:${mealId}:generate`,
      app_id: this.config.appId,
      prompt: buildMealGenerationPrompt(description),
      provider: this.config.provider,
      model: this.config.model,
      params: this.config.temperature !== undefined ? { temperature: this.config.temperature } : undefined,
      tools: [],
      callback_topic: this.config.completeTopic,
      metadata: { meal_id: mealId, job_type: 'meal_generation' },
    };

    await this.publish(job);
  }

  async enqueueAdditionalRecipes(mealId: string, prompt: string, recipes: RecipeSummary[]): Promise<void> {
    await prisma.meal.update({
      where: { id: mealId },
      data: { status: 'GENERATING_RECIPES' },
    });

    emitMealEvent({ type: 'status', mealId, status: 'GENERATING_RECIPES' });

    const job: AgentQJobRequest = {
      job_id: `meal:${mealId}:extend:${randomUUID()}`,
      app_id: this.config.appId,
      prompt: buildAdditionalRecipesPrompt(prompt, recipes),
      provider: this.config.provider,
      model: this.config.model,
      params: this.config.temperature !== undefined ? { temperature: this.config.temperature } : undefined,
      tools: [],
      callback_topic: this.config.completeTopic,
      metadata: { meal_id: mealId, job_type: 'meal_extend' },
    };

    await this.publish(job);
  }

  async enqueueRecipeCard(recipeId: string, title: string, ingredients: Ingredient[]): Promise<void> {
    const job: AgentQJobRequest = {
      job_id: `recipe:${recipeId}:card`,
      app_id: this.config.appId,
      prompt: buildRecipeCardPrompt(title, ingredients),
      provider: this.config.provider,
      model: this.config.model,
      params: this.config.temperature !== undefined ? { temperature: this.config.temperature } : undefined,
      tools: [],
      callback_topic: this.config.completeTopic,
      metadata: { recipe_id: recipeId, job_type: 'recipe_card' },
    };

    await this.publish(job);
  }

  async enqueueShopping(mealId: string, ingredients: Ingredient[]): Promise<void> {
    await prisma.meal.update({
      where: { id: mealId },
      data: { status: 'SHOPPING' },
    });

    const job: AgentQJobRequest = {
      job_id: `meal:${mealId}:shopping`,
      app_id: this.config.appId,
      prompt: buildShoppingPrompt(ingredients),
      provider: this.config.provider,
      model: this.config.model,
      params: this.config.temperature !== undefined ? { temperature: this.config.temperature } : undefined,
      tools: [],
      callback_topic: this.config.completeTopic,
      metadata: { meal_id: mealId, job_type: 'shopping_list' },
    };

    await this.publish(job);
  }

  async enqueueShoppingItems(mealId: string, parentJobId: string, items: ShoppingItemJob[]): Promise<void> {
    await prisma.meal.update({
      where: { id: mealId },
      data: { status: 'SHOPPING' },
    });

    await Promise.all(
      items.map((item) => {
        const job: AgentQJobRequest = {
          job_id: `meal:${mealId}:shopitem:${item.id}`,
          parent_job_id: parentJobId,
          app_id: this.config.appId,
          prompt: `@instacart-shopper please shop for ${item.quantity} ${item.unit} ${item.name}`,
          provider: this.config.provider,
          model: this.config.model,
          params: this.config.temperature !== undefined ? { temperature: this.config.temperature } : undefined,
          tools: [],
          callback_topic: this.config.completeTopic,
          metadata: {
            meal_id: mealId,
            job_type: 'shopping_item',
            shopping_item_id: item.id,
          },
        };

        return this.publish(job);
      })
    );
  }

  shutdown() {
    this.client.end(true);
  }

  private async publish(job: AgentQJobRequest): Promise<void> {
    const payload = JSON.stringify(job);
    await new Promise<void>((resolve, reject) => {
      this.client.publish(this.config.enqueueTopic, payload, { qos: this.config.qos }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private async handleCompletion(result: AgentQJobResult): Promise<void> {
    if (result.status !== 'completed') {
      console.error(`[AgentQ] Job ${result.job_id} failed`, result.error ?? 'unknown error');
      return;
    }

    const parsed = parseJobId(result.job_id);
    if (!parsed) {
      console.warn(`[AgentQ] Unknown job id format: ${result.job_id}`);
      return;
    }

    if (parsed.scope === 'meal') {
      if (parsed.jobType === 'generate') {
        await this.applyMealGeneration(parsed.mealId, result, { replaceExisting: true });
        return;
      }

      if (parsed.jobType === 'extend') {
        await this.applyMealGeneration(parsed.mealId, result, { replaceExisting: false });
        return;
      }

      if (parsed.jobType === 'shopping') {
        await this.applyShoppingList(parsed.mealId, result);
        return;
      }

      if (parsed.jobType === 'shopitem') {
        await this.applyShoppingItemCompletion(parsed.mealId, parsed.itemId, result);
        return;
      }
    }

    if (parsed.scope === 'recipe') {
      await this.applyRecipeCard(parsed.recipeId, result);
      return;
    }

    console.warn(`[AgentQ] Unhandled job type: ${parsed.jobType}`);
  }

  private async applyRecipeCard(recipeId: string, result: AgentQJobResult): Promise<void> {
    const output = parseJsonOutput<RecipeCardOutput>(result);
    const outputJson = output as unknown as Prisma.JsonObject;

    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: { mealId: true }
    });

    await prisma.recipeCard.upsert({
      where: { recipeId },
      create: {
        recipeId,
        data: outputJson,
      },
      update: {
        data: outputJson,
      },
    });

    await prisma.recipe.update({
      where: { id: recipeId },
      data: { recipeCardStatus: 'READY' },
    });

    if (recipe?.mealId) {
      emitMealEvent({ type: 'shoppingItems', mealId: recipe.mealId });
    }
  }

  private async applyMealGeneration(mealId: string, result: AgentQJobResult, options: { replaceExisting: boolean }): Promise<void> {
    const output = parseJsonOutput<MealPlanOutput>(result);
    const recipes = output.recipes ?? [];
    const shoppingItems = output.shoppingItems ?? [];

    await prisma.$transaction(async (tx) => {
      if (options.replaceExisting) {
        const existingRecipes = await tx.recipe.findMany({
          where: { mealId },
          select: { id: true }
        });
        const recipeIds = existingRecipes.map((recipe) => recipe.id);

        if (recipeIds.length > 0) {
          await tx.ingredient.deleteMany({ where: { recipeId: { in: recipeIds } } });
          await tx.recipe.deleteMany({ where: { id: { in: recipeIds } } });
        }
      }

      await tx.shoppingItem.deleteMany({ where: { mealId } });

      for (const recipe of recipes) {
        await tx.recipe.create({
          data: {
            mealId,
            name: recipe.name,
            ingredients: {
              create: recipe.ingredients.map((ingredient) => ({
                name: ingredient.name,
                quantity: ingredient.quantity,
                unit: ingredient.unit,
              })),
            },
          },
        });
      }

      if (shoppingItems.length > 0) {
        await tx.shoppingItem.createMany({
          data: shoppingItems.map((item) => ({
            mealId,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            checked: false,
            shoppingJobParentId: null,
            shoppingJobId: null,
            shoppingJobCompleted: false,
          })),
        });
      }

      await tx.meal.update({
        where: { id: mealId },
        data: { status: 'RECIPES_READY', shoppingJobParentId: null },
      });
    });

    emitMealEvent({ type: 'status', mealId, status: 'RECIPES_READY' });
    emitMealEvent({ type: 'shoppingItems', mealId });
  }

  private async applyShoppingList(mealId: string, result: AgentQJobResult): Promise<void> {
    const output = parseJsonOutput<ShoppingListOutput>(result);
    const items = output.items ?? [];

    await prisma.$transaction(async (tx) => {
      await tx.shoppingItem.deleteMany({ where: { mealId } });

      if (items.length > 0) {
        await tx.shoppingItem.createMany({
          data: items.map((item) => ({
            mealId,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            checked: false,
          })),
        });
      }

      await tx.meal.update({
        where: { id: mealId },
        data: { status: 'SHOPPING_READY' },
      });
    });

    emitMealEvent({ type: 'status', mealId, status: 'SHOPPING_READY' });
    emitMealEvent({ type: 'shoppingItems', mealId });
  }

  private async applyShoppingItemCompletion(mealId: string, itemId: string, result: AgentQJobResult): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const shoppingItem = await tx.shoppingItem.findUnique({
        where: { id: itemId },
        select: { shoppingJobCompleted: true, shoppingJobParentId: true, shoppingJobId: true }
      });

      if (!shoppingItem || shoppingItem.shoppingJobCompleted) return;

      if (shoppingItem.shoppingJobId && shoppingItem.shoppingJobId !== result.job_id) {
        return;
      }

      await tx.shoppingItem.update({
        where: { id: itemId },
        data: { shoppingJobCompleted: true, checked: true }
      });

      emitMealEvent({
        type: 'shoppingItem',
        mealId,
        shoppingItemId: itemId,
        checked: true,
      });

      if (!result.parent_job_id && !shoppingItem.shoppingJobParentId) return;

      const parentJobId = result.parent_job_id ?? shoppingItem.shoppingJobParentId;
      const remaining = await tx.shoppingItem.count({
        where: {
          mealId,
          shoppingJobParentId: parentJobId,
          shoppingJobCompleted: false,
        },
      });

      if (remaining === 0) {
        await tx.meal.update({
          where: { id: mealId },
          data: { status: 'SHOPPED' },
        });

        emitMealEvent({ type: 'status', mealId, status: 'SHOPPED' });
      }
    });
  }
}
