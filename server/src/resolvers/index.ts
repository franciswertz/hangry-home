import { randomUUID } from 'crypto';
import { prisma } from '../db/database.js';
import { emitMealEvent } from '../events/mealEvents.js';
import { JobQueueService, Ingredient, ShoppingItemJob, RecipeSummary } from '../services/JobQueueService.js';

export interface Context {
  jobQueue: JobQueueService;
}

export const resolvers = {
  Query: {
    meals: async () => {
      return prisma.meal.findMany({
        include: { recipes: { include: { ingredients: true, recipeCard: true } }, shoppingItems: true },
        orderBy: { createdAt: 'desc' }
      });
    },
    meal: async (_: unknown, { id }: { id: string }) => {
      return prisma.meal.findUnique({
        where: { id },
        include: { recipes: { include: { ingredients: true, recipeCard: true } }, shoppingItems: true }
      });
    },
    recipe: async (_: unknown, { id }: { id: string }) => {
      return prisma.recipe.findUnique({
        where: { id },
        include: { ingredients: true, recipeCard: true }
      });
    },
    stapleLists: async () => {
      return prisma.stapleList.findMany({
        include: { ingredients: true },
        orderBy: { createdAt: 'desc' }
      });
    },
    stapleList: async (_: unknown, { id }: { id: string }) => {
      return prisma.stapleList.findUnique({
        where: { id },
        include: { ingredients: true }
      });
    }
  },

  Mutation: {
    createMeal: async (
      _: unknown,
      {
        description,
        groupId,
        startDate,
        endDate,
      }: {
        description: string;
        groupId?: string;
        startDate?: string;
        endDate?: string;
      },
      context: Context,
    ) => {
      const data: {
        description: string;
        status: string;
        groupId?: string;
        startDate?: Date;
        endDate?: Date;
      } = {
        description,
        status: 'PENDING',
      };

      if (groupId) data.groupId = groupId;
      if (startDate) data.startDate = new Date(startDate);
      if (endDate) data.endDate = new Date(endDate);

      const meal = await prisma.meal.create({
        data,
      });
      await context.jobQueue.enqueueMealGeneration(meal.id, description);
      return meal;
    },

    deleteMeal: async (_: unknown, { id }: { id: string }) => {
      await prisma.meal.delete({ where: { id } });
      return true;
    },

    addRecipesToMeal: async (_: unknown, { mealId, prompt }: { mealId: string; prompt: string }, context: Context) => {
      const meal = await prisma.meal.findUnique({
        where: { id: mealId },
        include: { recipes: { include: { ingredients: true } } },
      });

      if (!meal) throw new Error('Meal not found');

      const recipes: RecipeSummary[] = meal.recipes.map((recipe) => ({
        name: recipe.name,
        ingredients: recipe.ingredients.map((ingredient) => ({
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
        })),
      }));

      await prisma.meal.update({
        where: { id: mealId },
        data: { status: 'GENERATING_RECIPES' },
      });

      emitMealEvent({ type: 'status', mealId, status: 'GENERATING_RECIPES' });

      await context.jobQueue.enqueueAdditionalRecipes(mealId, prompt, recipes);

      return prisma.meal.findUnique({
        where: { id: mealId },
        include: { recipes: { include: { ingredients: true, recipeCard: true } }, shoppingItems: true }
      });
    },

    generateRecipeCard: async (_: unknown, { recipeId }: { recipeId: string }, context: Context) => {
      const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId },
        include: { ingredients: true, recipeCard: true, meal: true },
      });

      if (!recipe) throw new Error('Recipe not found');

      if (!recipe.recipeCard) {
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { recipeCardStatus: 'GENERATING' },
        });
        await context.jobQueue.enqueueRecipeCard(
          recipe.id,
          recipe.name,
          recipe.ingredients.map((ingredient) => ({
            name: ingredient.name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
          }))
        );
      }

      return prisma.recipe.findUnique({
        where: { id: recipeId },
        include: { ingredients: true, recipeCard: true }
      });
    },

    updateMealStatus: async (_: unknown, { id, status }: { id: string; status: string }) => {
      return prisma.meal.update({
        where: { id },
        data: { status }
      });
    },

    ingestMealPlan: async (
      _: unknown,
      {
        mealId,
        plan,
      }: {
        mealId: string;
        plan: {
          description?: string;
          startDate?: string;
          endDate?: string;
          recipes: Array<{
            name: string;
            ingredients: Array<{ name: string; quantity: number; unit: string }>;
          }>;
          shoppingItems?: Array<{ name: string; quantity: number; unit: string }>;
        };
      }
    ) => {
      const existingMeal = await prisma.meal.findUnique({ where: { id: mealId } });
      if (!existingMeal) throw new Error('Meal not found');

      const updatedMeal = await prisma.$transaction(async (tx) => {
        const meal = await tx.meal.update({
          where: { id: mealId },
          data: {
            description: plan.description ?? existingMeal.description,
            startDate: plan.startDate ? new Date(plan.startDate) : existingMeal.startDate,
            endDate: plan.endDate ? new Date(plan.endDate) : existingMeal.endDate,
            status: 'PLANNED',
          },
        });

        await tx.shoppingItem.deleteMany({ where: { mealId } });
        await tx.recipe.deleteMany({ where: { mealId } });

        for (const recipe of plan.recipes) {
          await tx.recipe.create({
            data: {
              name: recipe.name,
              mealId,
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

        if (plan.shoppingItems?.length) {
          await tx.shoppingItem.createMany({
            data: plan.shoppingItems.map((item) => ({
              mealId,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
            })),
          });
        }

        return meal;
      });

      return updatedMeal;
    },

    ingestShoppingResults: async (
      _: unknown,
      {
        mealId,
        results,
      }: {
        mealId: string;
        results: {
          items: Array<{ name: string; quantity: number; unit: string; cost?: number; grocer?: string }>;
        };
      }
    ) => {
      const existingMeal = await prisma.meal.findUnique({ where: { id: mealId } });
      if (!existingMeal) throw new Error('Meal not found');

      const updatedMeal = await prisma.$transaction(async (tx) => {
        for (const item of results.items) {
          const existingItem = await tx.shoppingItem.findFirst({
            where: {
              mealId,
              name: item.name,
              unit: item.unit,
            },
          });

          if (!existingItem) {
            throw new Error(`Shopping item not found: ${item.name} (${item.unit})`);
          }

          await tx.shoppingItem.update({
            where: { id: existingItem.id },
            data: {
              inCart: true,
              inCartQuantity: item.quantity,
              inCartCost: item.cost,
              inCartGrocer: item.grocer,
            },
          });
        }

        return tx.meal.update({
          where: { id: mealId },
          data: { status: 'SHOPPED' },
        });
      });

      return updatedMeal;
    },

    createRecipe: async (_: unknown, { mealId, name }: { mealId: string; name: string }) => {
      return prisma.recipe.create({
        data: { name, mealId }
      });
    },

    addIngredient: async (_: unknown, args: { recipeId: string; name: string; quantity: number; unit: string; addToShoppingList?: boolean }) => {
      const { addToShoppingList, ...ingredientData } = args;
      
      const ingredient = await prisma.ingredient.create({
        data: ingredientData
      });

      if (addToShoppingList) {
        const recipe = await prisma.recipe.findUnique({
          where: { id: args.recipeId },
          select: { mealId: true }
        });
        if (recipe) {
          await prisma.shoppingItem.create({
            data: {
              mealId: recipe.mealId,
              name: args.name,
              quantity: args.quantity,
              unit: args.unit,
              checked: false
            }
          });
        }
      }

      return ingredient;
    },

    updateIngredient: async (_: unknown, { id, ...data }: { id: string; name?: string; quantity?: number; unit?: string }) => {
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.quantity !== undefined) updateData.quantity = data.quantity;
      if (data.unit !== undefined) updateData.unit = data.unit;
      
      return prisma.ingredient.update({
        where: { id },
        data: updateData
      });
    },

    deleteIngredient: async (_: unknown, { id }: { id: string }) => {
      await prisma.ingredient.delete({ where: { id } });
      return true;
    },

    submitToShop: async (_: unknown, { mealId }: { mealId: string }, context: Context) => {
      const meal = await prisma.meal.findUnique({
        where: { id: mealId },
        include: { recipes: { include: { ingredients: true } } }
      });
      
      if (!meal) throw new Error('Meal not found');

      const allIngredients: Ingredient[] = meal.recipes.flatMap(r => 
        r.ingredients.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit }))
      );

      await context.jobQueue.enqueueShopping(mealId, allIngredients);

      return prisma.meal.update({
        where: { id: mealId },
        data: { status: 'SHOPPING' }
      });
    },

    startShoppingJobs: async (_: unknown, { mealId }: { mealId: string }, context: Context) => {
      const meal = await prisma.meal.findUnique({
        where: { id: mealId },
        include: { shoppingItems: true }
      });

      if (!meal) throw new Error('Meal not found');

      if (meal.shoppingItems.length === 0) {
        throw new Error('No shopping items to process');
      }

      const parentJobId = `shop:${randomUUID()}`;
      const items: ShoppingItemJob[] = meal.shoppingItems
        .filter((item) => !item.checked)
        .map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        }));

      if (items.length === 0) {
        throw new Error('All shopping items are already checked off');
      }

      await prisma.$transaction(async (tx) => {
        await tx.meal.update({
          where: { id: mealId },
          data: { status: 'SHOPPING', shoppingJobParentId: parentJobId },
        });

        await Promise.all(
          items.map((item) =>
            tx.shoppingItem.update({
              where: { id: item.id },
              data: {
                shoppingJobParentId: parentJobId,
                shoppingJobCompleted: false,
                shoppingJobId: `meal:${mealId}:shopitem:${item.id}`,
              },
            })
          )
        );
      });

      await context.jobQueue.enqueueShoppingItems(mealId, parentJobId, items);

      emitMealEvent({ type: 'status', mealId, status: 'SHOPPING' });

      return prisma.meal.findUnique({
        where: { id: mealId },
        include: { recipes: { include: { ingredients: true } }, shoppingItems: true }
      });
    },

    addShoppingItem: async (_: unknown, args: { mealId: string; name: string; quantity: number; unit: string }) => {
      return prisma.shoppingItem.create({
        data: args
      });
    },

    updateShoppingItem: async (
      _: unknown,
      {
        id,
        ...data
      }: {
        id: string;
        name?: string;
        quantity?: number;
        unit?: string;
        checked?: boolean;
        inCart?: boolean;
        inCartQuantity?: number;
        inCartCost?: number;
        inCartGrocer?: string;
      }
    ) => {
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.quantity !== undefined) updateData.quantity = data.quantity;
      if (data.unit !== undefined) updateData.unit = data.unit;
      if (data.checked !== undefined) updateData.checked = data.checked;
      if (data.inCart !== undefined) updateData.inCart = data.inCart;
      if (data.inCartQuantity !== undefined) updateData.inCartQuantity = data.inCartQuantity;
      if (data.inCartCost !== undefined) updateData.inCartCost = data.inCartCost;
      if (data.inCartGrocer !== undefined) updateData.inCartGrocer = data.inCartGrocer;
      
      return prisma.shoppingItem.update({
        where: { id },
        data: updateData
      });
    },

    deleteShoppingItem: async (_: unknown, { id }: { id: string }) => {
      await prisma.shoppingItem.delete({ where: { id } });
      return true;
    },

    createStapleList: async (_: unknown, { name }: { name: string }) => {
      return prisma.stapleList.create({
        data: { name }
      });
    },

    updateStapleList: async (_: unknown, { id, name }: { id: string; name: string }) => {
      return prisma.stapleList.update({
        where: { id },
        data: { name }
      });
    },

    deleteStapleList: async (_: unknown, { id }: { id: string }) => {
      await prisma.stapleList.delete({ where: { id } });
      return true;
    },

    addStapleIngredient: async (
      _: unknown,
      args: { listId: string; name: string; quantity: number; unit: string }
    ) => {
      return prisma.stapleIngredient.create({
        data: {
          listId: args.listId,
          name: args.name,
          quantity: args.quantity,
          unit: args.unit
        }
      });
    },

    updateStapleIngredient: async (
      _: unknown,
      { id, ...data }: { id: string; name?: string; quantity?: number; unit?: string }
    ) => {
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.quantity !== undefined) updateData.quantity = data.quantity;
      if (data.unit !== undefined) updateData.unit = data.unit;

      return prisma.stapleIngredient.update({
        where: { id },
        data: updateData
      });
    },

    deleteStapleIngredient: async (_: unknown, { id }: { id: string }) => {
      await prisma.stapleIngredient.delete({ where: { id } });
      return true;
    },

    addStapleIngredientsToShoppingList: async (
      _: unknown,
      {
        mealId,
        stapleListId,
        ingredientIds
      }: { mealId: string; stapleListId: string; ingredientIds?: string[] }
    ) => {
      const meal = await prisma.meal.findUnique({ where: { id: mealId } });
      if (!meal) throw new Error('Meal not found');

      const ingredients = await prisma.stapleIngredient.findMany({
        where: {
          listId: stapleListId,
          ...(ingredientIds?.length ? { id: { in: ingredientIds } } : {})
        }
      });

      if (ingredients.length === 0) {
        throw new Error('No staple ingredients found');
      }

      const existingItems = await prisma.shoppingItem.findMany({
        where: { mealId },
        select: { id: true, name: true, unit: true, quantity: true }
      });

      const existingMap = new Map(
        existingItems.map((item) => [
          `${item.name.toLowerCase()}::${item.unit.toLowerCase()}`,
          item
        ])
      );

      const aggregated = new Map<string, { name: string; unit: string; quantity: number }>();
      for (const ingredient of ingredients) {
        const key = `${ingredient.name.toLowerCase()}::${ingredient.unit.toLowerCase()}`;
        const current = aggregated.get(key);
        if (current) {
          current.quantity += ingredient.quantity;
        } else {
          aggregated.set(key, {
            name: ingredient.name,
            unit: ingredient.unit,
            quantity: ingredient.quantity
          });
        }
      }

      await prisma.$transaction(async (tx) => {
        for (const [key, entry] of aggregated) {
          const existing = existingMap.get(key);
          if (existing) {
            await tx.shoppingItem.update({
              where: { id: existing.id },
              data: { quantity: existing.quantity + entry.quantity }
            });
          } else {
            await tx.shoppingItem.create({
              data: {
                mealId,
                name: entry.name,
                quantity: entry.quantity,
                unit: entry.unit,
                checked: false
              }
            });
          }
        }
      });

      emitMealEvent({ type: 'shoppingItems', mealId });

      return prisma.meal.findUnique({
        where: { id: mealId },
        include: { recipes: { include: { ingredients: true, recipeCard: true } }, shoppingItems: true }
      });
    }
  },

  Meal: {
    groupId: (parent: { groupId: string | null }) => parent.groupId ?? null,
    startDate: (parent: { startDate: Date | null }) => parent.startDate?.toISOString() ?? null,
    endDate: (parent: { endDate: Date | null }) => parent.endDate?.toISOString() ?? null,
    recipes: async (parent: { id: string }) => {
      return prisma.recipe.findMany({
        where: { mealId: parent.id },
        include: { ingredients: true }
      });
    },
    shoppingItems: async (parent: { id: string }) => {
      return prisma.shoppingItem.findMany({
        where: { mealId: parent.id }
      });
    },
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString()
  },

  Recipe: {
    ingredients: async (parent: { id: string }) => {
      return prisma.ingredient.findMany({
        where: { recipeId: parent.id }
      });
    },
    recipeCard: async (parent: { id: string }) => {
      return prisma.recipeCard.findUnique({
        where: { recipeId: parent.id }
      });
    },
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString()
  },

  RecipeCard: {
    data: (parent: { data: unknown }) => JSON.stringify(parent.data),
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString()
  },

  ShoppingItem: {
    inCart: (parent: { inCart: boolean | null }) => parent.inCart ?? false,
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString()
  },

  StapleList: {
    ingredients: async (parent: { id: string }) => {
      return prisma.stapleIngredient.findMany({
        where: { listId: parent.id }
      });
    },
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString()
  },

  StapleIngredient: {
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString()
  }
};
