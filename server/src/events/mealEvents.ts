import { EventEmitter } from 'events';

export type MealEvent =
  | {
      type: 'status';
      mealId: string;
      status: string;
    }
  | {
      type: 'shoppingItem';
      mealId: string;
      shoppingItemId: string;
      checked?: boolean;
    }
  | {
      type: 'shoppingItems';
      mealId: string;
    };

const emitter = new EventEmitter();

export const onMealEvent = (mealId: string, listener: (event: MealEvent) => void) => {
  const key = `meal:${mealId}`;
  emitter.on(key, listener);
  return () => emitter.off(key, listener);
};

export const onAllMealEvents = (listener: (event: MealEvent) => void) => {
  const key = 'meal:all';
  emitter.on(key, listener);
  return () => emitter.off(key, listener);
};

export const emitMealEvent = (event: MealEvent) => {
  emitter.emit(`meal:${event.mealId}`, event);
  emitter.emit('meal:all', event);
};
