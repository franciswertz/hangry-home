import { useEffect, useRef, useState } from 'react';
import { ApolloProvider, useQuery, useMutation, useApolloClient } from '@apollo/client/react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apolloClient } from './graphql/client';
import {
  completeOidcLogin,
  ensureValidAccessToken,
  getAccessToken,
  getUserProfile,
  logout,
  startOidcLogin,
} from './auth/auth';
import {
  GET_MEALS,
  GET_MEAL,
  CREATE_MEAL,
  UPDATE_MEAL_STATUS,
  CREATE_RECIPE,
  ADD_INGREDIENT,
  UPDATE_INGREDIENT,
  DELETE_INGREDIENT,
  DELETE_MEAL,
  ADD_RECIPES_TO_MEAL,
  GENERATE_RECIPE_CARD,
  GET_RECIPE,
  ADD_SHOPPING_ITEM,
  UPDATE_SHOPPING_ITEM,
  DELETE_SHOPPING_ITEM,
  START_SHOPPING_JOBS,
  GET_STAPLE_LISTS,
  CREATE_STAPLE_LIST,
  UPDATE_STAPLE_LIST,
  DELETE_STAPLE_LIST,
  ADD_STAPLE_INGREDIENT,
  UPDATE_STAPLE_INGREDIENT,
  DELETE_STAPLE_INGREDIENT,
  ADD_STAPLE_INGREDIENTS_TO_SHOPPING_LIST
} from './graphql/queries';

const sseBaseUrl = import.meta.env.VITE_SSE_URL ?? 'http://localhost:4001';
const normalizedSseBase = sseBaseUrl.endsWith('/') ? sseBaseUrl.slice(0, -1) : sseBaseUrl;
const buildSseUrl = (path: string, accessToken?: string) => {
  if (!normalizedSseBase) return path;
  if (normalizedSseBase.endsWith('/events') && path.startsWith('/events')) {
    const url = `${normalizedSseBase}${path.slice('/events'.length)}`;
    return accessToken ? `${url}?access_token=${encodeURIComponent(accessToken)}` : url;
  }
  const url = `${normalizedSseBase}${path}`;
  return accessToken ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}` : url;
};

type MealStatus =
  | 'PENDING'
  | 'GENERATING_RECIPES'
  | 'RECIPES_READY'
  | 'GENERATING'
  | 'READY'
  | 'PLANNED'
  | 'SHOPPING'
  | 'SHOPPING_READY'
  | 'SHOPPED';

interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

interface Recipe {
  id: string;
  name: string;
  ingredients: Ingredient[];
  recipeCardStatus?: string | null;
  recipeCard?: {
    id: string;
    data?: string;
  } | null;
}

interface RecipeCardData {
  title: string;
  prep_time_minutes: number;
  cook_time_minutes: number;
  servings: number;
  kitchen_prep: {
    tools: string[];
    equipment_setup: string[];
    notes: string[];
  };
  ingredient_prep: Array<{ ingredient: string; steps: string[] }>;
  cook_steps: string[];
  serve_steps: string[];
  safety_notes: string[];
}

interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  inCart?: boolean;
  inCartQuantity?: number | null;
  inCartCost?: number | null;
  inCartGrocer?: string | null;
}

interface StapleIngredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

interface StapleList {
  id: string;
  name: string;
  ingredients: StapleIngredient[];
}

interface Meal {
  id: string;
  description: string;
  status: MealStatus;
  groupId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  recipes: Recipe[];
  shoppingItems: ShoppingItem[];
}

function MealInputForm({ onMealCreated }: { onMealCreated?: () => void }) {
  const [description, setDescription] = useState('');
  const [createMeal, { loading }] = useMutation(CREATE_MEAL);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    await createMeal({ variables: { description } });
    setDescription('');
    onMealCreated?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Chicken recipes with lots of veggies..."
        className="hh-input w-full text-base md:text-lg"
      />
      <button
        type="submit"
        disabled={loading || !description.trim()}
        className="hh-btn hh-btn--primary w-full text-base md:text-lg"
      >
        {loading ? 'Creating...' : 'Create meals'}
      </button>
    </form>
  );
}

function RecipePanel({ 
  recipe,
  onUpdate 
}: { 
  recipe: Recipe; 
  onUpdate: () => void;
}) {
  const [isAddingIngredient, setIsAddingIngredient] = useState(false);
  const [newIngredient, setNewIngredient] = useState({
    name: '',
    quantity: '',
    unit: '',
    addToShoppingList: true,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', quantity: '', unit: '' });

  const [addIngredient] = useMutation(ADD_INGREDIENT);
  const [updateIngredient] = useMutation(UPDATE_INGREDIENT);
  const [deleteIngredient] = useMutation(DELETE_INGREDIENT);
  const [generateRecipeCard, { loading: isGeneratingCard }] = useMutation(GENERATE_RECIPE_CARD);

  const hasRecipeCard = Boolean(recipe.recipeCard?.id);
  const isCardGenerating = recipe.recipeCardStatus === 'GENERATING';

  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngredient.name.trim() || !newIngredient.quantity) return;

    await addIngredient({
      variables: {
        recipeId: recipe.id,
        name: newIngredient.name,
        quantity: parseFloat(newIngredient.quantity),
        unit: newIngredient.unit || 'unit',
        addToShoppingList: newIngredient.addToShoppingList,
      }
    });
    setNewIngredient({ name: '', quantity: '', unit: '', addToShoppingList: true });
    setIsAddingIngredient(false);
    onUpdate();
  };

  const handleUpdateIngredient = async (id: string) => {
    await updateIngredient({
      variables: {
        id,
        name: editForm.name,
        quantity: parseFloat(editForm.quantity) || undefined,
        unit: editForm.unit
      }
    });
    setEditingId(null);
    onUpdate();
  };

  const handleDeleteIngredient = async (id: string) => {
    await deleteIngredient({ variables: { id } });
    onUpdate();
  };

  const handleRecipeCardClick = async () => {
    if (hasRecipeCard) {
      window.open(`/recipes/${recipe.id}/card`, '_blank', 'noopener,noreferrer');
      return;
    }

    await generateRecipeCard({ variables: { recipeId: recipe.id } });
    onUpdate();
  };

  return (
    <div className="hh-card p-5 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h4 className="text-lg font-semibold">{recipe.name}</h4>
        <div className="flex items-center gap-2">
          {isCardGenerating && !hasRecipeCard && (
            <span className="text-xs hh-faint">Card requested...</span>
          )}
          <button
            onClick={handleRecipeCardClick}
            disabled={isGeneratingCard || isCardGenerating}
            className="hh-btn hh-btn--ghost text-xs"
          >
            {isGeneratingCard ? 'Generating...' : hasRecipeCard ? 'View Recipe Card' : 'Create Recipe Card'}
          </button>
        </div>
      </div>
      
      {recipe.ingredients.length > 0 && (
        <ul className="space-y-2 mb-3">
          {recipe.ingredients.map((ing) => (
            <li key={ing.id} className="flex items-center gap-2 text-sm">
              {editingId === ing.id ? (
                <div className="flex gap-2 items-center flex-1">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Name"
                    className="hh-input text-sm w-28"
                  />
                  <input
                    type="number"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    placeholder="Qty"
                    className="hh-input text-sm w-20"
                  />
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    placeholder="Unit"
                    className="hh-input text-sm w-20"
                  />
                  <button
                    onClick={() => handleUpdateIngredient(ing.id)}
                    className="text-xs font-semibold text-[color:var(--hh-kiwi-hover)]"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs hh-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1">
                    {ing.quantity} {ing.unit} {ing.name}
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(ing.id);
                      setEditForm({ name: ing.name, quantity: String(ing.quantity), unit: ing.unit });
                    }}
                    className="text-xs font-semibold text-[color:var(--hh-kiwi-hover)]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteIngredient(ing.id)}
                    className="text-xs font-semibold text-[color:var(--hh-hangry)]"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAddingIngredient ? (
        <form onSubmit={handleAddIngredient} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs hh-muted">Name</label>
            <input
              type="text"
              value={newIngredient.name}
              onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
              placeholder="Ingredient name"
              className="hh-input text-sm w-36"
            />
          </div>
          <div>
            <label className="text-xs hh-muted">Quantity</label>
            <input
              type="number"
              value={newIngredient.quantity}
              onChange={(e) => setNewIngredient({ ...newIngredient, quantity: e.target.value })}
              placeholder="1"
              className="hh-input text-sm w-20"
            />
          </div>
          <div>
            <label className="text-xs hh-muted">Unit</label>
            <input
              type="text"
              value={newIngredient.unit}
              onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })}
              placeholder="cups"
              className="hh-input text-sm w-24"
            />
          </div>
          <label className="flex items-center gap-2 text-xs hh-muted">
            <input
              type="checkbox"
              checked={newIngredient.addToShoppingList}
              onChange={(e) => setNewIngredient({ ...newIngredient, addToShoppingList: e.target.checked })}
            />
            Add to shopping list
          </label>
          <button type="submit" className="hh-btn hh-btn--primary text-sm">
            Add
          </button>
          <button
            type="button"
            onClick={() => setIsAddingIngredient(false)}
            className="hh-btn hh-btn--ghost text-sm"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setIsAddingIngredient(true)}
          className="text-sm font-semibold text-[color:var(--hh-kiwi-hover)]"
        >
          + Add Ingredient
        </button>
      )}
    </div>
  );
}

function ShoppingListPanel({ 
  mealId, 
  items,
  onUpdate 
}: { 
  mealId: string; 
  items: ShoppingItem[];
  onUpdate: () => void;
}) {
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', quantity: '', unit: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', quantity: '', unit: '' });

  const [addShoppingItem] = useMutation(ADD_SHOPPING_ITEM);
  const [updateShoppingItem] = useMutation(UPDATE_SHOPPING_ITEM);
  const [deleteShoppingItem] = useMutation(DELETE_SHOPPING_ITEM);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    await addShoppingItem({
      variables: {
        mealId,
        name: newItem.name,
        quantity: parseFloat(newItem.quantity) || 1,
        unit: newItem.unit || 'unit'
      }
    });
    setNewItem({ name: '', quantity: '', unit: '' });
    setIsAddingItem(false);
    onUpdate();
  };

  const handleToggle = async (item: ShoppingItem) => {
    await updateShoppingItem({
      variables: {
        id: item.id,
        checked: !item.checked
      }
    });
    onUpdate();
  };

  const handleUpdateItem = async (id: string) => {
    await updateShoppingItem({
      variables: {
        id,
        name: editForm.name,
        quantity: parseFloat(editForm.quantity) || undefined,
        unit: editForm.unit
      }
    });
    setEditingId(null);
    onUpdate();
  };

  const handleDeleteItem = async (id: string) => {
    await deleteShoppingItem({ variables: { id } });
    onUpdate();
  };

  return (
    <div>
      {items.length > 0 && (
        <ul className="space-y-2 mb-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              {editingId === item.id ? (
                <div className="flex gap-2 items-center flex-1">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => handleToggle(item)}
                    className="h-4 w-4"
                  />
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Name"
                    className="hh-input text-sm w-28"
                  />
                  <input
                    type="number"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    placeholder="Qty"
                    className="hh-input text-sm w-20"
                  />
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    placeholder="Unit"
                    className="hh-input text-sm w-20"
                  />
                  <button
                    onClick={() => handleUpdateItem(item.id)}
                    className="text-xs font-semibold text-[color:var(--hh-kiwi-hover)]"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs hh-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => handleToggle(item)}
                    className="h-4 w-4"
                  />
                  <span className={`flex-1 ${item.checked ? 'line-through text-[color:var(--hh-text-faint)]' : ''}`}>
                    {item.quantity} {item.unit} {item.name}
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(item.id);
                      setEditForm({ name: item.name, quantity: String(item.quantity), unit: item.unit });
                    }}
                    className="text-xs font-semibold text-[color:var(--hh-kiwi-hover)]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="text-xs font-semibold text-[color:var(--hh-hangry)]"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAddingItem ? (
        <form onSubmit={handleAddItem} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs hh-muted">Name</label>
            <input
              type="text"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="Item name"
              className="hh-input text-sm w-36"
            />
          </div>
          <div>
            <label className="text-xs hh-muted">Quantity</label>
            <input
              type="number"
              value={newItem.quantity}
              onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
              placeholder="1"
              className="hh-input text-sm w-20"
            />
          </div>
          <div>
            <label className="text-xs hh-muted">Unit</label>
            <input
              type="text"
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              placeholder="pcs"
              className="hh-input text-sm w-24"
            />
          </div>
          <button type="submit" className="hh-btn hh-btn--primary text-sm">
            Add
          </button>
          <button
            type="button"
            onClick={() => setIsAddingItem(false)}
            className="hh-btn hh-btn--ghost text-sm"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setIsAddingItem(true)}
          className="text-sm font-semibold text-[color:var(--hh-kiwi-hover)]"
        >
          + Add Item
        </button>
      )}
    </div>
  );
}

function StapleListManager({
  list,
  onUpdate
}: {
  list: StapleList;
  onUpdate: () => void;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [listName, setListName] = useState(list.name);
  const [isAddingIngredient, setIsAddingIngredient] = useState(false);
  const [newIngredient, setNewIngredient] = useState({ name: '', quantity: '', unit: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', quantity: '', unit: '' });

  const [updateStapleList, { loading: isUpdatingList }] = useMutation(UPDATE_STAPLE_LIST);
  const [deleteStapleList, { loading: isDeletingList }] = useMutation(DELETE_STAPLE_LIST);
  const [addStapleIngredient] = useMutation(ADD_STAPLE_INGREDIENT);
  const [updateStapleIngredient] = useMutation(UPDATE_STAPLE_INGREDIENT);
  const [deleteStapleIngredient] = useMutation(DELETE_STAPLE_INGREDIENT);

  const handleSaveListName = async () => {
    if (!listName.trim()) return;
    await updateStapleList({ variables: { id: list.id, name: listName.trim() } });
    setIsEditingName(false);
    onUpdate();
  };

  const handleDeleteList = async () => {
    if (!window.confirm('Delete this staples list and all its ingredients?')) return;
    await deleteStapleList({ variables: { id: list.id } });
    onUpdate();
  };

  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngredient.name.trim() || !newIngredient.quantity) return;
    await addStapleIngredient({
      variables: {
        listId: list.id,
        name: newIngredient.name.trim(),
        quantity: parseFloat(newIngredient.quantity),
        unit: newIngredient.unit || 'unit'
      }
    });
    setNewIngredient({ name: '', quantity: '', unit: '' });
    setIsAddingIngredient(false);
    onUpdate();
  };

  const handleUpdateIngredient = async (id: string) => {
    await updateStapleIngredient({
      variables: {
        id,
        name: editForm.name,
        quantity: parseFloat(editForm.quantity) || undefined,
        unit: editForm.unit
      }
    });
    setEditingId(null);
    onUpdate();
  };

  const handleDeleteIngredient = async (id: string) => {
    await deleteStapleIngredient({ variables: { id } });
    onUpdate();
  };

  return (
    <div className="hh-card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        {isEditingName ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              className="hh-input flex-1 text-sm"
            />
            <button
              onClick={handleSaveListName}
              disabled={isUpdatingList || !listName.trim()}
              className="text-xs font-semibold text-[color:var(--hh-kiwi-hover)] disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsEditingName(false);
                setListName(list.name);
              }}
              className="text-xs hh-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <h4 className="text-lg font-semibold">{list.name}</h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditingName(true)}
                className="text-xs font-semibold text-[color:var(--hh-kiwi-hover)]"
              >
                Rename
              </button>
              <button
                onClick={handleDeleteList}
                disabled={isDeletingList}
                className="text-xs font-semibold text-[color:var(--hh-hangry)] disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {list.ingredients.length > 0 && (
        <ul className="space-y-2 mb-3">
          {list.ingredients.map((ingredient) => (
            <li key={ingredient.id} className="flex items-center gap-2 text-sm">
              {editingId === ingredient.id ? (
                <div className="flex gap-2 items-center flex-1">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Name"
                    className="hh-input text-sm w-28"
                  />
                  <input
                    type="number"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    placeholder="Qty"
                    className="hh-input text-sm w-20"
                  />
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    placeholder="Unit"
                    className="hh-input text-sm w-20"
                  />
                  <button
                    onClick={() => handleUpdateIngredient(ingredient.id)}
                    className="text-xs font-semibold text-[color:var(--hh-kiwi-hover)]"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs hh-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1">
                    {ingredient.quantity} {ingredient.unit} {ingredient.name}
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(ingredient.id);
                      setEditForm({
                        name: ingredient.name,
                        quantity: String(ingredient.quantity),
                        unit: ingredient.unit
                      });
                    }}
                    className="text-xs font-semibold text-[color:var(--hh-kiwi-hover)]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteIngredient(ingredient.id)}
                    className="text-xs font-semibold text-[color:var(--hh-hangry)]"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAddingIngredient ? (
        <form onSubmit={handleAddIngredient} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs hh-muted">Name</label>
            <input
              type="text"
              value={newIngredient.name}
              onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
              placeholder="Ingredient name"
              className="hh-input text-sm w-36"
            />
          </div>
          <div>
            <label className="text-xs hh-muted">Quantity</label>
            <input
              type="number"
              value={newIngredient.quantity}
              onChange={(e) => setNewIngredient({ ...newIngredient, quantity: e.target.value })}
              placeholder="1"
              className="hh-input text-sm w-20"
            />
          </div>
          <div>
            <label className="text-xs hh-muted">Unit</label>
            <input
              type="text"
              value={newIngredient.unit}
              onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })}
              placeholder="cups"
              className="hh-input text-sm w-24"
            />
          </div>
          <button type="submit" className="hh-btn hh-btn--primary text-sm">
            Add
          </button>
          <button
            type="button"
            onClick={() => setIsAddingIngredient(false)}
            className="hh-btn hh-btn--ghost text-sm"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setIsAddingIngredient(true)}
          className="text-sm font-semibold text-[color:var(--hh-kiwi-hover)]"
        >
          + Add Ingredient
        </button>
      )}
    </div>
  );
}

function StapleListPicker({
  mealId,
  list,
  shoppingItems,
  onAdded
}: {
  mealId: string;
  list: StapleList;
  shoppingItems: ShoppingItem[];
  onAdded: () => void;
}) {
  const [addingAll, setAddingAll] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [addStaples] = useMutation(ADD_STAPLE_INGREDIENTS_TO_SHOPPING_LIST);
  const [updateShoppingItem] = useMutation(UPDATE_SHOPPING_ITEM);
  const [deleteShoppingItem] = useMutation(DELETE_SHOPPING_ITEM);

  const findMatchingItem = (ingredient: StapleIngredient) => {
    const nameKey = ingredient.name.toLowerCase();
    const unitKey = ingredient.unit.toLowerCase();
    return shoppingItems.find(
      (item) => item.name.toLowerCase() === nameKey && item.unit.toLowerCase() === unitKey
    );
  };

  const handleAddAll = async () => {
    setAddingAll(true);
    await addStaples({ variables: { mealId, stapleListId: list.id } });
    setAddingAll(false);
    onAdded();
  };

  const handleAddOne = async (ingredientId: string) => {
    setPendingId(ingredientId);
    await addStaples({
      variables: { mealId, stapleListId: list.id, ingredientIds: [ingredientId] }
    });
    setPendingId(null);
    onAdded();
  };

  const handleDecrement = async (ingredient: StapleIngredient) => {
    const matchingItem = findMatchingItem(ingredient);
    if (!matchingItem) return;
    setPendingId(ingredient.id);
    const nextQuantity = matchingItem.quantity - ingredient.quantity;
    if (nextQuantity <= 0) {
      await deleteShoppingItem({ variables: { id: matchingItem.id } });
    } else {
      await updateShoppingItem({ variables: { id: matchingItem.id, quantity: nextQuantity } });
    }
    setPendingId(null);
    onAdded();
  };

  return (
    <div className="hh-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h4 className="font-semibold">{list.name}</h4>
        <button
          onClick={handleAddAll}
          disabled={addingAll || list.ingredients.length === 0}
          className="hh-btn hh-btn--secondary text-xs"
        >
          {addingAll ? 'Adding...' : 'Add All'}
        </button>
      </div>
      {list.ingredients.length === 0 ? (
        <p className="text-sm hh-muted">No staples added yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.ingredients.map((ingredient) => {
            const matchingItem = findMatchingItem(ingredient);
            return (
              <li key={ingredient.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {ingredient.quantity} {ingredient.unit} {ingredient.name}
                </span>
                {matchingItem ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDecrement(ingredient)}
                      disabled={pendingId === ingredient.id}
                      className="hh-btn hh-btn--ghost h-7 w-7 p-0 text-xs"
                    >
                      -
                    </button>
                    <span className="text-xs hh-muted">
                      {matchingItem.quantity} {matchingItem.unit}
                    </span>
                    <button
                      onClick={() => handleAddOne(ingredient.id)}
                      disabled={pendingId === ingredient.id}
                      className="hh-btn hh-btn--ghost h-7 w-7 p-0 text-xs"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleAddOne(ingredient.id)}
                    disabled={pendingId === ingredient.id}
                    className="text-xs font-semibold text-[color:var(--hh-kiwi-hover)] disabled:opacity-50"
                  >
                    {pendingId === ingredient.id ? 'Adding...' : 'Add'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MealDetailView() {
  const { mealId } = useParams<{ mealId: string }>();
  const navigate = useNavigate();
  const apolloClient = useApolloClient();
  const { data, loading, error, refetch } = useQuery<{ meal: Meal }>(GET_MEAL, {
    variables: { id: mealId ?? '' },
    skip: !mealId,
  });
  const {
    data: staplesData,
    loading: staplesLoading,
    error: staplesError,
    refetch: refetchStaples
  } = useQuery<{ stapleLists: StapleList[] }>(GET_STAPLE_LISTS);
  const meal = data?.meal as Meal | undefined;
  const [updateStatus] = useMutation(UPDATE_MEAL_STATUS);
  const [createRecipe] = useMutation(CREATE_RECIPE);
  const [deleteMeal, { loading: isDeletingMeal }] = useMutation(DELETE_MEAL);
  const [addRecipesToMeal, { loading: isAddingRecipes }] = useMutation(ADD_RECIPES_TO_MEAL);
  const [startShoppingJobs, { loading: isStartingShopping }] = useMutation(START_SHOPPING_JOBS);
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [isStaplesOpen, setIsStaplesOpen] = useState(false);

  const refetchRef = useRef(refetch);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!mealId) return;

    let isClosed = false;

    const clearRetry = () => {
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (isClosed) return;
      clearRetry();
      const attempt = retryCountRef.current;
      const delay = Math.min(1000 * 2 ** attempt, 30000);
      retryTimeoutRef.current = window.setTimeout(() => {
        retryCountRef.current = Math.min(attempt + 1, 5);
        openEventSource();
      }, delay);
    };

    const openEventSource = async () => {
      if (isClosed) return;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const accessToken = await ensureValidAccessToken();
      if (!accessToken) {
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return;
      }

      const eventSource = new EventSource(buildSseUrl(`/events/meals/${mealId}`, accessToken));
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        retryCountRef.current = 0;
        clearRetry();
      };

      eventSource.onmessage = () => {
        refetchRef.current();
      };

      eventSource.onerror = () => {
        eventSource.close();
        scheduleReconnect();
      };
    };

    void openEventSource();

    return () => {
      isClosed = true;
      clearRetry();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [mealId]);

  const handleGenerateRecipes = async () => {
    if (!meal) return;
    await updateStatus({ variables: { id: meal.id, status: 'GENERATING_RECIPES' } });
    await createRecipe({ variables: { mealId: meal.id, name: 'Sample Recipe' } });
    await updateStatus({ variables: { id: meal.id, status: 'RECIPES_READY' } });
    refetch();
  };

  const getStatusLabel = (status: MealStatus) => {
    const labels: Record<MealStatus, string> = {
      PENDING: 'Pending',
      GENERATING_RECIPES: 'Generating Recipes',
      RECIPES_READY: 'Recipes Ready',
      GENERATING: 'Generating Recipes',
      READY: 'Recipes Ready',
      PLANNED: 'Planned',
      SHOPPING: 'Shopping',
      SHOPPING_READY: 'Shopping Ready',
      SHOPPED: 'Shopped',
    };
    return labels[status];
  };

  const getStatusTone = (status: MealStatus) => {
    const tones: Record<MealStatus, string> = {
      PENDING: 'bg-[#F1E9E1] text-[#7A5A3A]',
      GENERATING_RECIPES: 'bg-[#FDF1D7] text-[#8A6B2F]',
      RECIPES_READY: 'bg-[#EAF7E5] text-[#356B25]',
      GENERATING: 'bg-[#FDF1D7] text-[#8A6B2F]',
      READY: 'bg-[#EAF7E5] text-[#356B25]',
      PLANNED: 'bg-[#EAF7E5] text-[#356B25]',
      SHOPPING: 'bg-[#E8F1FE] text-[#2A5D9F]',
      SHOPPING_READY: 'bg-[#EFE6F7] text-[#6B3B8A]',
      SHOPPED: 'bg-[#EFE6F7] text-[#6B3B8A]',
    };
    return tones[status];
  };

  const handleStartShopping = async () => {
    if (!meal) return;
    await startShoppingJobs({ variables: { mealId: meal.id } });
    refetch();
  };

  const handleAddRecipes = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!meal || !additionalPrompt.trim()) return;
    await addRecipesToMeal({ variables: { mealId: meal.id, prompt: additionalPrompt.trim() } });
    setAdditionalPrompt('');
    refetch();
  };

  const handleDeleteMeal = async () => {
    if (!meal) return;
    if (!window.confirm('Delete this meal and all of its recipes?')) return;
    await deleteMeal({ variables: { id: meal.id } });
    await apolloClient.resetStore();
    navigate('/');
  };

  if (!mealId) {
    return (
      <div className="hh-card p-6">
        <p className="text-sm hh-muted">Missing meal id.</p>
        <button
          onClick={() => navigate('/')}
          className="hh-btn hh-btn--secondary mt-4"
        >
          Back to meals
        </button>
      </div>
    );
  }

  if (loading && !meal) {
    return <div className="text-sm hh-muted">Loading meal...</div>;
  }

  if (error) {
    return (
      <div className="hh-alert text-sm">
        Failed to load meal: {error.message}
      </div>
    );
  }

  if (!meal) {
    return (
      <div className="hh-card p-6">
        <p className="text-sm hh-muted">Meal not found.</p>
        <button
          onClick={() => navigate('/')}
          className="hh-btn hh-btn--secondary mt-4"
        >
          Back to meals
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => navigate('/')}
        className="mb-5 text-sm font-semibold text-[color:var(--hh-kiwi-hover)]"
      >
        Back to meals
      </button>

      <div className="hh-card p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] hh-faint">Meal</p>
            <h2 className="hh-display text-2xl md:text-3xl font-semibold">{meal.description}</h2>
            <p className="text-sm hh-muted">Single meal detail page</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-4 py-1 rounded-full text-xs font-semibold ${getStatusTone(meal.status)}`}>
              {getStatusLabel(meal.status)}
            </span>
            <button
              onClick={handleDeleteMeal}
              disabled={isDeletingMeal}
              className="hh-btn hh-btn--ghost text-sm text-[color:var(--hh-hangry)]"
            >
              {isDeletingMeal ? 'Deleting...' : 'Delete Meal'}
            </button>
          </div>
        </div>

        {meal.status === 'PENDING' && (
          <button
            onClick={handleGenerateRecipes}
            className="hh-btn hh-btn--primary"
          >
            Generate Recipes
          </button>
        )}

        {meal.status === 'RECIPES_READY' && (
          <form onSubmit={handleAddRecipes} className="hh-panel p-5 space-y-3">
            <label className="block text-sm font-semibold">
              Add more recipes to this meal
            </label>
            <textarea
              value={additionalPrompt}
              onChange={(event) => setAdditionalPrompt(event.target.value)}
              placeholder="Add two lighter sides, keep it vegetarian"
              className="hh-textarea w-full text-sm"
              rows={3}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isAddingRecipes || !additionalPrompt.trim()}
                className="hh-btn hh-btn--primary"
              >
                {isAddingRecipes ? 'Requesting...' : 'Generate More Recipes'}
              </button>
              <span className="text-xs hh-muted">
                New recipes will be added and the shopping list refreshed.
              </span>
            </div>
          </form>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Recipes</h3>
              <span className="text-xs hh-muted">{meal.recipes.length} recipes</span>
            </div>
            {meal.recipes.length === 0 ? (
              <p className="text-sm hh-muted">No recipes yet. Click "Generate Recipes" to create one.</p>
            ) : (
              meal.recipes.map((recipe) => (
                <RecipePanel
                  key={recipe.id}
                  recipe={recipe}
                  onUpdate={() => refetch()}
                />
              ))
            )}
          </section>

          <aside className="space-y-4">
            <div className="hh-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Shopping List</h3>
                <span className="text-xs hh-muted">{meal.shoppingItems.length} items</span>
              </div>
              <ShoppingListPanel
                mealId={meal.id}
                items={meal.shoppingItems}
                onUpdate={() => refetch()}
              />
              {meal.status === 'RECIPES_READY' && meal.shoppingItems.some((item) => !item.checked) && (
                <button
                  onClick={handleStartShopping}
                  disabled={isStartingShopping}
                  className="hh-btn hh-btn--primary mt-4 w-full"
                >
                  {isStartingShopping ? 'Starting Shopping...' : 'Shop These Items'}
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>

      <button
        onClick={() => setIsStaplesOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-[color:var(--hh-kiwi)] px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[color:var(--hh-kiwi-hover)]"
      >
        + Staples
      </button>

      {isStaplesOpen && (
        <aside className="fixed bottom-20 right-6 z-40 h-[650px] w-[350px] rounded-xl bg-[color:var(--hh-card)] shadow-2xl ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-[color:var(--hh-border)] px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold">Staples</h3>
              <p className="text-xs hh-muted">Add extras to this shopping list</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/staples"
                className="text-xs font-semibold text-[color:var(--hh-kiwi-hover)]"
              >
                Manage
              </Link>
              <button
                onClick={() => setIsStaplesOpen(false)}
                className="text-xs hh-muted"
              >
                Close
              </button>
            </div>
          </div>
          <div className="h-[calc(650px-4rem)] overflow-y-auto px-5 py-4">
            {staplesError ? (
              <div className="hh-alert text-sm">Failed to load staples: {staplesError.message}</div>
            ) : staplesLoading && !staplesData?.stapleLists ? (
              <p className="text-sm hh-muted">Loading staples...</p>
            ) : (staplesData?.stapleLists?.length ?? 0) === 0 ? (
              <p className="text-sm hh-muted">No staple lists yet. Create one to quickly add extras.</p>
            ) : (
              <div className="space-y-4">
                {staplesData?.stapleLists.map((list) => (
                  <StapleListPicker
                    key={list.id}
                    mealId={meal.id}
                    list={list}
                    shoppingItems={meal.shoppingItems}
                    onAdded={() => {
                      refetch();
                      refetchStaples();
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function MealList({ meals, searchTerm }: { meals: Meal[]; searchTerm: string }) {
  const navigate = useNavigate();
  const apolloClient = useApolloClient();
  const [deleteMeal, { loading: isDeletingMeal }] = useMutation(DELETE_MEAL);

  const handleDeleteMeal = async (id: string) => {
    if (!window.confirm('Delete this meal and all of its recipes?')) return;
    await deleteMeal({ variables: { id } });
    await apolloClient.resetStore();
  };
  const getStatusLabel = (status: MealStatus) => {
    const labels: Record<MealStatus, string> = {
      PENDING: 'Pending',
      GENERATING_RECIPES: 'Generating Recipes',
      RECIPES_READY: 'Recipes Ready',
      GENERATING: 'Generating Recipes',
      READY: 'Recipes Ready',
      PLANNED: 'Planned',
      SHOPPING: 'Shopping',
      SHOPPING_READY: 'Shopping Ready',
      SHOPPED: 'Shopped',
    };
    return labels[status];
  };

  const getStatusColor = (status: MealStatus) => {
    const colors: Record<MealStatus, string> = {
      PENDING: 'bg-[#F1E9E1] text-[#7A5A3A]',
      GENERATING_RECIPES: 'bg-[#FDF1D7] text-[#8A6B2F]',
      RECIPES_READY: 'bg-[#EAF7E5] text-[#356B25]',
      GENERATING: 'bg-[#FDF1D7] text-[#8A6B2F]',
      READY: 'bg-[#EAF7E5] text-[#356B25]',
      PLANNED: 'bg-[#EAF7E5] text-[#356B25]',
      SHOPPING: 'bg-[#E8F1FE] text-[#2A5D9F]',
      SHOPPING_READY: 'bg-[#EFE6F7] text-[#6B3B8A]',
      SHOPPED: 'bg-[#EFE6F7] text-[#6B3B8A]',
    };
    return colors[status];
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredMeals = normalizedSearch
    ? meals.filter((meal) => meal.description.toLowerCase().includes(normalizedSearch))
    : meals;

  if (filteredMeals.length === 0) {
    return (
      <div className="text-center py-12 text-sm hh-muted">
        {normalizedSearch
          ? 'No meals match your search yet.'
          : 'No meals planned yet. Describe what you would like to eat above.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredMeals.map((meal) => (
        <div key={meal.id} className="hh-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">{meal.description}</h3>
              <div className="flex items-center gap-2 text-sm hh-muted">
                <span>{meal.recipes.length} recipes</span>
                <span>•</span>
                <span>{meal.shoppingItems.length} shopping items</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`px-4 py-1 rounded-full text-xs font-semibold ${getStatusColor(meal.status)}`}>
                {getStatusLabel(meal.status)}
              </span>
              <button
                onClick={() => navigate(`/meals/${meal.id}`)}
                className="hh-btn hh-btn--secondary text-sm"
              >
                View Details
              </button>
              <button
                onClick={() => handleDeleteMeal(meal.id)}
                disabled={isDeletingMeal}
                className="hh-btn hh-btn--ghost text-sm text-[color:var(--hh-hangry)]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecipeCardView() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const { data, loading, error } = useQuery<{ recipe: Recipe }>(GET_RECIPE, {
    variables: { id: recipeId ?? '' },
    skip: !recipeId,
  });

  if (!recipeId) {
    return <div className="text-sm hh-muted">Missing recipe id.</div>;
  }

  if (loading) {
    return <div className="text-sm hh-muted">Loading recipe card...</div>;
  }

  if (error) {
    return (
      <div className="hh-alert text-sm">
        Failed to load recipe card: {error.message}
      </div>
    );
  }

  const recipe = data?.recipe as Recipe | undefined;
  let cardData: RecipeCardData | null = null;
  if (recipe?.recipeCard?.data) {
    try {
      cardData = JSON.parse(recipe.recipeCard.data) as RecipeCardData;
    } catch {
      cardData = null;
    }
  }

  if (!recipe || !cardData) {
    return <div className="text-sm hh-muted">Recipe card not ready yet.</div>;
  }

  return (
    <div className="hh-card p-8 print:shadow-none print:p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="hh-display text-2xl font-semibold print:text-lg">{cardData.title}</h1>
          <div className="mt-2 text-sm hh-muted print:text-xs">
            <span>Prep: {cardData.prep_time_minutes} min</span>
            <span className="mx-2">•</span>
            <span>Cook: {cardData.cook_time_minutes} min</span>
            <span className="mx-2">•</span>
            <span>Servings: {cardData.servings}</span>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="hh-btn hh-btn--ghost text-sm print:hidden"
        >
          Print
        </button>
      </div>

      <div className="space-y-6 print:space-y-3">
        <section className="mt-6 border-t border-[color:var(--hh-border)] pt-6 print:mt-3 print:pt-3">
          <h2 className="text-lg font-medium print:text-base">Kitchen Prep</h2>
          <div className="mt-2 space-y-4 text-sm print:text-xs">
            <div>
              <h3 className="font-medium">Tools</h3>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs hh-muted">
                {cardData.kitchen_prep.tools.map((tool: string) => (
                  <li key={tool} className="flex items-center gap-1">
                    <span className="hh-faint">•</span>
                    <span>{tool}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">Equipment Setup</h3>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs hh-muted">
                {cardData.kitchen_prep.equipment_setup.map((item: string) => (
                  <li key={item} className="flex items-center gap-1">
                    <span className="hh-faint">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">Notes</h3>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs hh-muted">
                {cardData.kitchen_prep.notes.map((note: string) => (
                  <li key={note} className="flex items-center gap-1">
                    <span className="hh-faint">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-6 border-t border-[color:var(--hh-border)] pt-6 print:mt-3 print:pt-3">
          <h2 className="text-lg font-medium print:text-base">Ingredient Prep</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2 print:text-xs">
            {cardData.ingredient_prep.map((prep: { ingredient: string; steps: string[] }) => (
              <div key={prep.ingredient} className="rounded border border-[color:var(--hh-border)] p-3">
                <h3 className="font-medium">{prep.ingredient}</h3>
                <ul className="mt-2 space-y-1 list-disc list-inside text-xs hh-muted">
                  {prep.steps.map((step: string) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 border-t border-[color:var(--hh-border)] pt-6 print:mt-3 print:pt-3 print:break-before-page">
          <h2 className="text-lg font-medium print:text-base">Cook Steps</h2>
          <ol className="mt-2 space-y-2 list-decimal list-inside text-sm print:text-xs">
            {cardData.cook_steps.map((step: string) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="mt-6 border-t border-[color:var(--hh-border)] pt-6 print:mt-3 print:pt-3">
          <h2 className="text-lg font-medium print:text-base">Serve</h2>
          <ol className="mt-2 space-y-2 list-decimal list-inside text-sm print:text-xs">
            {cardData.serve_steps.map((step: string) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="mt-6 border-t border-[color:var(--hh-border)] pt-6 print:mt-3 print:pt-3">
          <h2 className="text-lg font-medium print:text-base">Safety Notes</h2>
          <ul className="mt-2 space-y-1 list-disc list-inside text-sm print:text-xs">
            {cardData.safety_notes.map((note: string) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StaplesPage() {
  const { data, loading, error, refetch } = useQuery<{ stapleLists: StapleList[] }>(GET_STAPLE_LISTS);
  const [createStapleList, { loading: isCreating }] = useMutation(CREATE_STAPLE_LIST);
  const [newListName, setNewListName] = useState('');

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    await createStapleList({ variables: { name: newListName.trim() } });
    setNewListName('');
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Staples</h2>
          <p className="text-sm hh-muted">Keep reusable ingredient lists for quick shopping adds.</p>
        </div>
        <Link to="/" className="text-sm font-semibold text-[color:var(--hh-kiwi-hover)]">
          Back to meals
        </Link>
      </div>

      <form onSubmit={handleCreateList} className="hh-card p-5 flex flex-col gap-3 md:flex-row md:items-center">
        <input
          type="text"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="Create a staples list (e.g., Weekly Basics)"
          className="hh-input w-full"
        />
        <button
          type="submit"
          disabled={isCreating || !newListName.trim()}
          className="hh-btn hh-btn--primary"
        >
          {isCreating ? 'Creating...' : 'Create List'}
        </button>
      </form>

      {error ? (
        <div className="hh-alert text-sm">Failed to load staples: {error.message}</div>
      ) : loading && !data?.stapleLists ? (
        <div className="text-sm hh-muted">Loading staples...</div>
      ) : (data?.stapleLists?.length ?? 0) === 0 ? (
        <div className="text-center py-12 text-sm hh-muted">
          No staples yet. Create a list to add common items.
        </div>
      ) : (
        <div className="space-y-4">
          {data?.stapleLists.map((list) => (
            <StapleListManager key={list.id} list={list} onUpdate={() => refetch()} />
          ))}
        </div>
      )}
    </div>
  );
}

function MealsPage({ searchTerm }: { searchTerm: string }) {
  const { data, loading, error, refetch } = useQuery<{ meals: Meal[] }>(GET_MEALS);

  const listRefetchRef = useRef(refetch);
  const listEventSourceRef = useRef<EventSource | null>(null);
  const listRetryTimeoutRef = useRef<number | null>(null);
  const listRetryCountRef = useRef(0);

  useEffect(() => {
    listRefetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    let isClosed = false;

    const clearRetry = () => {
      if (listRetryTimeoutRef.current !== null) {
        window.clearTimeout(listRetryTimeoutRef.current);
        listRetryTimeoutRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (isClosed) return;
      clearRetry();
      const attempt = listRetryCountRef.current;
      const delay = Math.min(1000 * 2 ** attempt, 30000);
      listRetryTimeoutRef.current = window.setTimeout(() => {
        listRetryCountRef.current = Math.min(attempt + 1, 5);
        openEventSource();
      }, delay);
    };

    const openEventSource = async () => {
      if (isClosed) return;
      if (listEventSourceRef.current) {
        listEventSourceRef.current.close();
      }

      const accessToken = await ensureValidAccessToken();
      if (!accessToken) {
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return;
      }

      const eventSource = new EventSource(buildSseUrl('/events/meals', accessToken));
      listEventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        listRetryCountRef.current = 0;
        clearRetry();
      };

      eventSource.onmessage = () => {
        listRefetchRef.current();
      };

      eventSource.onerror = () => {
        eventSource.close();
        scheduleReconnect();
      };
    };

    void openEventSource();

    return () => {
      isClosed = true;
      clearRetry();
      if (listEventSourceRef.current) {
        listEventSourceRef.current.close();
        listEventSourceRef.current = null;
      }
    };
  }, []);

  if (loading && !data?.meals) {
    return <div className="text-sm hh-muted">Loading meals...</div>;
  }

  if (error) {
    return (
      <div>
        <div className="hh-alert text-sm">Failed to load meals: {error.message}</div>
        <button
          onClick={() => refetch()}
          className="hh-btn hh-btn--secondary mt-4"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="hh-card px-6 py-8 md:px-12 md:py-12 text-center">
        <div className="mx-auto max-w-2xl space-y-4">
          <h2 className="hh-display text-2xl md:text-3xl font-semibold">
            What kind of meals would you like to create?
          </h2>
          <p className="text-sm md:text-base hh-muted">
            Describe your cravings, goals, or what is in the pantry.
          </p>
          <div className="mt-6">
            <MealInputForm onMealCreated={() => refetch()} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Meals</h3>
          <span className="text-xs hh-muted">{data?.meals.length ?? 0} total</span>
        </div>
        <MealList meals={data?.meals ?? []} searchTerm={searchTerm} />
      </section>
    </div>
  );
}

function useAuthStatus() {
  const [status, setStatus] = useState<'checking' | 'authed' | 'anon'>('checking');

  useEffect(() => {
    let isActive = true;

    const checkAuth = async () => {
      const token = await ensureValidAccessToken();
      if (!isActive) return;
      setStatus(token ? 'authed' : 'anon');
    };

    checkAuth();

    const handleLogin = () => setStatus('authed');
    const handleLogout = () => setStatus('anon');

    window.addEventListener('auth:login', handleLogin);
    window.addEventListener('auth:logout', handleLogout);

    return () => {
      isActive = false;
      window.removeEventListener('auth:login', handleLogin);
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  return status;
}

function LoginPage() {
  const [status, setStatus] = useState<'idle' | 'working'>('idle');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    setStatus('working');
    try {
      await startOidcLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-[color:var(--hh-background)] flex items-center justify-center px-4">
      <div className="w-full max-w-md hh-card p-6 md:p-8 space-y-5">
        <div className="space-y-2 text-center">
          <h1 className="hh-display text-2xl font-semibold">Hangry Home</h1>
          <p className="text-sm hh-muted">
            Sign in with your passkey to continue.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleLogin}
              disabled={status === 'working'}
              className="hh-btn hh-btn--primary"
            >
              {status === 'working' ? 'Working...' : 'Sign in'}
            </button>
          </div>
          <p className="text-xs hh-muted">
            You will be redirected to authenticate and then return here.
          </p>
        </div>

        {error && <div className="hh-alert text-sm">{error}</div>}
      </div>
    </div>
  );
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const EXCHANGE_KEY = 'hangry.oidc.exchange';
  const EXCHANGE_ERROR_KEY = 'hangry.oidc.exchange.error';

  useEffect(() => {
    let isActive = true;
    let pollTimer: number | undefined;

    const startPollingForToken = () => {
      const startedAt = Date.now();
      pollTimer = window.setInterval(() => {
        if (!isActive) return;
        if (getAccessToken()) {
          window.location.replace('/');
          return;
        }
        if (Date.now() - startedAt > 5000) {
          window.clearInterval(pollTimer);
          pollTimer = undefined;
          sessionStorage.removeItem(EXCHANGE_KEY);
          setError('Login is taking too long. Please try again.');
        }
      }, 250);
    };

    const finish = async () => {
      const code = new URLSearchParams(location.search).get('code');
      if (!code) {
        setError('Missing authorization code.');
        return;
      }
      if (getAccessToken()) {
        window.location.replace('/');
        return;
      }
      const storedError = sessionStorage.getItem(EXCHANGE_ERROR_KEY);
      if (storedError) {
        sessionStorage.removeItem(EXCHANGE_ERROR_KEY);
        sessionStorage.removeItem(EXCHANGE_KEY);
        setError(storedError);
        return;
      }
      if (sessionStorage.getItem(EXCHANGE_KEY) === 'pending') {
        startPollingForToken();
        return;
      }
      sessionStorage.setItem(EXCHANGE_KEY, 'pending');
      try {
        await completeOidcLogin(location.search);
        if (!isActive) return;
        sessionStorage.setItem(EXCHANGE_KEY, 'done');
        window.location.replace('/');
        return;
      } catch (err) {
        if (!isActive) return;
        const message = err instanceof Error ? err.message : 'Login failed.';
        sessionStorage.setItem(EXCHANGE_ERROR_KEY, message);
        sessionStorage.removeItem(EXCHANGE_KEY);
        setError(message);
      }
    };
    finish();
    return () => {
      isActive = false;
      if (pollTimer) {
        window.clearInterval(pollTimer);
      }
    };
  }, [location.search, navigate]);

  return (
    <div className="min-h-screen bg-[color:var(--hh-background)] flex items-center justify-center px-4">
      <div className="w-full max-w-md hh-card p-6 md:p-8 space-y-5 text-center">
        <h1 className="hh-display text-2xl font-semibold">Signing you in</h1>
        <p className="text-sm hh-muted">Finishing authentication...</p>
        {error && <div className="hh-alert text-sm text-left">{error}</div>}
      </div>
    </div>
  );
}

function AppContent() {
  const authStatus = useAuthStatus();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  if (location.pathname === '/auth/callback') {
    return <AuthCallbackPage />;
  }

  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm hh-muted">
        Checking session...
      </div>
    );
  }

  if (authStatus === 'anon') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  const { displayName, username } = getUserProfile();
  const profileLabel = displayName || username || 'User';
  const initials = profileLabel
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="border-b border-[color:var(--hh-border)] bg-[color:var(--hh-card)]/95 backdrop-blur print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--hh-kiwi-soft)] shadow">
                <img src="/pwa-192.png" alt="Hangry Home" />
              </span>
              <div>
                <p className="hh-display text-lg font-semibold">Hangry Home</p>
                <p className="text-xs hh-muted">Meal planner</p>
              </div>
            </Link>
          </div>

          <nav className="flex items-center gap-4 text-sm ml-auto order-2">
            <Link to="/" className="font-semibold text-[color:var(--hh-text)]">
              Meals
            </Link>
            <Link to="/staples" className="text-[color:var(--hh-text-muted)] hover:text-[color:var(--hh-text)]">
              Staples
            </Link>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProfileOpen((prev) => !prev)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--hh-kiwi-soft)] text-xs font-semibold text-[color:var(--hh-text)]"
                aria-label="Open profile menu"
              >
                {initials || 'HH'}
              </button>
              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-[color:var(--hh-border)] bg-[color:var(--hh-card)] shadow-lg">
                  <div className="px-4 py-3 text-xs">
                    <p className="font-semibold text-[color:var(--hh-text)]">{profileLabel}</p>
                    {displayName && username && displayName !== username && (
                      <p className="hh-muted">{username}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      logout();
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-[color:var(--hh-hangry)] hover:bg-[color:var(--hh-panel)]"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </nav>
          <div className="w-full order-3 md:w-80">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search meals..."
              className="hh-input w-full text-sm"
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<MealsPage searchTerm={searchTerm} />} />
          <Route path="/meals/:mealId" element={<MealDetailView />} />
          <Route path="/staples" element={<StaplesPage />} />
          <Route path="/recipes/:recipeId/card" element={<RecipeCardView />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <AppContent />
    </ApolloProvider>
  );
}

export default App;
