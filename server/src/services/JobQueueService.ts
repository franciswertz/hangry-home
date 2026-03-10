export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface RecipeSummary {
  name: string;
  ingredients: Ingredient[];
}

export interface ShoppingItemJob extends Ingredient {
  id: string;
}

export interface JobQueueService {
  enqueueMealGeneration(mealId: string, description: string): Promise<void>;
  enqueueAdditionalRecipes(mealId: string, prompt: string, recipes: RecipeSummary[]): Promise<void>;
  enqueueRecipeCard(recipeId: string, title: string, ingredients: Ingredient[]): Promise<void>;
  enqueueShopping(mealId: string, ingredients: Ingredient[]): Promise<void>;
  enqueueShoppingItems(mealId: string, parentJobId: string, items: ShoppingItemJob[]): Promise<void>;
}

export class NoOpJobQueueService implements JobQueueService {
  async enqueueMealGeneration(_mealId: string, _description: string): Promise<void> {
    console.log('[NoOpJobQueue] Meal generation job enqueued (no-op)');
  }

  async enqueueAdditionalRecipes(_mealId: string, _prompt: string, _recipes: RecipeSummary[]): Promise<void> {
    console.log('[NoOpJobQueue] Additional recipes job enqueued (no-op)');
  }

  async enqueueRecipeCard(_recipeId: string, _title: string, _ingredients: Ingredient[]): Promise<void> {
    console.log('[NoOpJobQueue] Recipe card job enqueued (no-op)');
  }

  async enqueueShopping(_mealId: string, _ingredients: Ingredient[]): Promise<void> {
    console.log('[NoOpJobQueue] Shopping job enqueued (no-op)');
  }

  async enqueueShoppingItems(_mealId: string, _parentJobId: string, _items: ShoppingItemJob[]): Promise<void> {
    console.log('[NoOpJobQueue] Shopping item jobs enqueued (no-op)');
  }
}
