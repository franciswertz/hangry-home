export const typeDefs = `#graphql
  type Meal {
    id: ID!
    description: String!
    status: MealStatus!
    groupId: String
    startDate: String
    endDate: String
    recipes: [Recipe!]!
    shoppingItems: [ShoppingItem!]!
    createdAt: String!
    updatedAt: String!
  }

  type Recipe {
    id: ID!
    name: String!
    ingredients: [Ingredient!]!
    recipeCard: RecipeCard
    recipeCardStatus: String
    createdAt: String!
    updatedAt: String!
  }

  type RecipeCard {
    id: ID!
    data: String!
    createdAt: String!
    updatedAt: String!
  }

  type Ingredient {
    id: ID!
    name: String!
    quantity: Float!
    unit: String!
  }

  type ShoppingItem {
    id: ID!
    name: String!
    quantity: Float!
    unit: String!
    checked: Boolean!
    inCart: Boolean!
    inCartQuantity: Float
    inCartCost: Float
    inCartGrocer: String
    createdAt: String!
    updatedAt: String!
  }

  type StapleList {
    id: ID!
    name: String!
    ingredients: [StapleIngredient!]!
    createdAt: String!
    updatedAt: String!
  }

  type StapleIngredient {
    id: ID!
    name: String!
    quantity: Float!
    unit: String!
    createdAt: String!
    updatedAt: String!
  }

  enum MealStatus {
    PENDING
    GENERATING_RECIPES
    RECIPES_READY
    GENERATING
    READY
    PLANNED
    SHOPPING
    SHOPPING_READY
    SHOPPED
  }

  input IngredientInput {
    name: String!
    quantity: Float!
    unit: String!
  }

  input ShoppingItemInput {
    name: String!
    quantity: Float!
    unit: String!
  }

  input MealPlanRecipeInput {
    name: String!
    ingredients: [IngredientInput!]!
  }

  input MealPlanInput {
    description: String
    startDate: String
    endDate: String
    recipes: [MealPlanRecipeInput!]!
    shoppingItems: [ShoppingItemInput!]
  }

  input ShoppingResultItemInput {
    name: String!
    quantity: Float!
    unit: String!
    cost: Float
    grocer: String
  }

  input ShoppingResultsInput {
    items: [ShoppingResultItemInput!]!
  }

  type Query {
    meals: [Meal!]!
    meal(id: ID!): Meal
    recipe(id: ID!): Recipe
    stapleLists: [StapleList!]!
    stapleList(id: ID!): StapleList
  }

  type Mutation {
    createMeal(description: String!, groupId: String, startDate: String, endDate: String): Meal!
    deleteMeal(id: ID!): Boolean!
    addRecipesToMeal(mealId: ID!, prompt: String!): Meal!
    generateRecipeCard(recipeId: ID!): Recipe!
    updateMealStatus(id: ID!, status: MealStatus!): Meal!
    ingestMealPlan(mealId: ID!, plan: MealPlanInput!): Meal!
    ingestShoppingResults(mealId: ID!, results: ShoppingResultsInput!): Meal!
    createRecipe(mealId: String!, name: String!): Recipe!
    addIngredient(recipeId: String!, name: String!, quantity: Float!, unit: String!, addToShoppingList: Boolean): Ingredient!
    updateIngredient(id: ID!, name: String, quantity: Float, unit: String): Ingredient!
    deleteIngredient(id: ID!): Boolean!
    submitToShop(mealId: String!): Meal!
    startShoppingJobs(mealId: String!): Meal!
    addShoppingItem(mealId: String!, name: String!, quantity: Float!, unit: String!): ShoppingItem!
    updateShoppingItem(id: ID!, name: String, quantity: Float, unit: String, checked: Boolean, inCart: Boolean, inCartQuantity: Float, inCartCost: Float, inCartGrocer: String): ShoppingItem!
    deleteShoppingItem(id: ID!): Boolean!
    createStapleList(name: String!): StapleList!
    updateStapleList(id: ID!, name: String!): StapleList!
    deleteStapleList(id: ID!): Boolean!
    addStapleIngredient(listId: ID!, name: String!, quantity: Float!, unit: String!): StapleIngredient!
    updateStapleIngredient(id: ID!, name: String, quantity: Float, unit: String): StapleIngredient!
    deleteStapleIngredient(id: ID!): Boolean!
    addStapleIngredientsToShoppingList(mealId: ID!, stapleListId: ID!, ingredientIds: [ID!]): Meal!
  }
`;
