import { gql } from '@apollo/client';

export const GET_MEALS = gql`
  query GetMeals {
    meals {
      id
      description
      status
      groupId
      startDate
      endDate
      createdAt
      recipes {
        id
        name
        recipeCard {
          id
          data
        }
        recipeCardStatus
        ingredients {
          id
          name
          quantity
          unit
        }
      }
      shoppingItems {
        id
        name
        quantity
        unit
        checked
        inCart
        inCartQuantity
        inCartCost
        inCartGrocer
      }
    }
  }
`;

export const GET_MEAL = gql`
  query GetMeal($id: ID!) {
    meal(id: $id) {
      id
      description
      status
      groupId
      startDate
      endDate
      createdAt
      recipes {
        id
        name
        recipeCard {
          id
          data
        }
        recipeCardStatus
        ingredients {
          id
          name
          quantity
          unit
        }
      }
      shoppingItems {
        id
        name
        quantity
        unit
        checked
        inCart
        inCartQuantity
        inCartCost
        inCartGrocer
      }
    }
  }
`;

export const GET_RECIPE = gql`
  query GetRecipe($id: ID!) {
    recipe(id: $id) {
      id
      name
      recipeCard {
        id
        data
      }
      recipeCardStatus
      ingredients {
        id
        name
        quantity
        unit
      }
    }
  }
`;

export const CREATE_MEAL = gql`
  mutation CreateMeal($description: String!) {
    createMeal(description: $description) {
      id
      description
      status
    }
  }
`;

export const ADD_RECIPES_TO_MEAL = gql`
  mutation AddRecipesToMeal($mealId: ID!, $prompt: String!) {
    addRecipesToMeal(mealId: $mealId, prompt: $prompt) {
      id
      status
      recipes {
        id
        name
        recipeCard {
          id
          data
        }
        recipeCardStatus
        ingredients {
          id
          name
          quantity
          unit
        }
      }
      shoppingItems {
        id
        name
        quantity
        unit
        checked
      }
    }
  }
`;

export const DELETE_MEAL = gql`
  mutation DeleteMeal($id: ID!) {
    deleteMeal(id: $id)
  }
`;

export const GENERATE_RECIPE_CARD = gql`
  mutation GenerateRecipeCard($recipeId: ID!) {
    generateRecipeCard(recipeId: $recipeId) {
      id
      recipeCard {
        id
        data
      }
    }
  }
`;

export const UPDATE_MEAL_STATUS = gql`
  mutation UpdateMealStatus($id: ID!, $status: MealStatus!) {
    updateMealStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

export const CREATE_RECIPE = gql`
  mutation CreateRecipe($mealId: String!, $name: String!) {
    createRecipe(mealId: $mealId, name: $name) {
      id
      name
      ingredients {
        id
        name
        quantity
        unit
      }
    }
  }
`;

export const ADD_INGREDIENT = gql`
  mutation AddIngredient($recipeId: String!, $name: String!, $quantity: Float!, $unit: String!, $addToShoppingList: Boolean) {
    addIngredient(recipeId: $recipeId, name: $name, quantity: $quantity, unit: $unit, addToShoppingList: $addToShoppingList) {
      id
      name
      quantity
      unit
    }
  }
`;

export const UPDATE_INGREDIENT = gql`
  mutation UpdateIngredient($id: ID!, $name: String, $quantity: Float, $unit: String) {
    updateIngredient(id: $id, name: $name, quantity: $quantity, unit: $unit) {
      id
      name
      quantity
      unit
    }
  }
`;

export const DELETE_INGREDIENT = gql`
  mutation DeleteIngredient($id: ID!) {
    deleteIngredient(id: $id)
  }
`;

export const SUBMIT_TO_SHOP = gql`
  mutation SubmitToShop($mealId: String!) {
    submitToShop(mealId: $mealId) {
      id
      status
      shoppingItems {
        id
        name
        quantity
        unit
        checked
      }
    }
  }
`;

export const START_SHOPPING_JOBS = gql`
  mutation StartShoppingJobs($mealId: String!) {
    startShoppingJobs(mealId: $mealId) {
      id
      status
      shoppingItems {
        id
        name
        quantity
        unit
        checked
      }
    }
  }
`;

export const ADD_SHOPPING_ITEM = gql`
  mutation AddShoppingItem($mealId: String!, $name: String!, $quantity: Float!, $unit: String!) {
    addShoppingItem(mealId: $mealId, name: $name, quantity: $quantity, unit: $unit) {
      id
      name
      quantity
      unit
      checked
    }
  }
`;

export const UPDATE_SHOPPING_ITEM = gql`
  mutation UpdateShoppingItem($id: ID!, $name: String, $quantity: Float, $unit: String, $checked: Boolean) {
    updateShoppingItem(id: $id, name: $name, quantity: $quantity, unit: $unit, checked: $checked) {
      id
      name
      quantity
      unit
      checked
    }
  }
`;

export const DELETE_SHOPPING_ITEM = gql`
  mutation DeleteShoppingItem($id: ID!) {
    deleteShoppingItem(id: $id)
  }
`;

export const GET_STAPLE_LISTS = gql`
  query GetStapleLists {
    stapleLists {
      id
      name
      ingredients {
        id
        name
        quantity
        unit
      }
    }
  }
`;

export const CREATE_STAPLE_LIST = gql`
  mutation CreateStapleList($name: String!) {
    createStapleList(name: $name) {
      id
      name
    }
  }
`;

export const UPDATE_STAPLE_LIST = gql`
  mutation UpdateStapleList($id: ID!, $name: String!) {
    updateStapleList(id: $id, name: $name) {
      id
      name
    }
  }
`;

export const DELETE_STAPLE_LIST = gql`
  mutation DeleteStapleList($id: ID!) {
    deleteStapleList(id: $id)
  }
`;

export const ADD_STAPLE_INGREDIENT = gql`
  mutation AddStapleIngredient($listId: ID!, $name: String!, $quantity: Float!, $unit: String!) {
    addStapleIngredient(listId: $listId, name: $name, quantity: $quantity, unit: $unit) {
      id
      name
      quantity
      unit
    }
  }
`;

export const UPDATE_STAPLE_INGREDIENT = gql`
  mutation UpdateStapleIngredient($id: ID!, $name: String, $quantity: Float, $unit: String) {
    updateStapleIngredient(id: $id, name: $name, quantity: $quantity, unit: $unit) {
      id
      name
      quantity
      unit
    }
  }
`;

export const DELETE_STAPLE_INGREDIENT = gql`
  mutation DeleteStapleIngredient($id: ID!) {
    deleteStapleIngredient(id: $id)
  }
`;

export const ADD_STAPLE_INGREDIENTS_TO_SHOPPING_LIST = gql`
  mutation AddStapleIngredientsToShoppingList($mealId: ID!, $stapleListId: ID!, $ingredientIds: [ID!]) {
    addStapleIngredientsToShoppingList(mealId: $mealId, stapleListId: $stapleListId, ingredientIds: $ingredientIds) {
      id
      status
      shoppingItems {
        id
        name
        quantity
        unit
        checked
      }
    }
  }
`;
