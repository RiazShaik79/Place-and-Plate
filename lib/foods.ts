import type { Food } from "./types";

/**
 * Built-in food catalogue. Values are approximate, based on USDA FoodData Central,
 * and given per the listed serving size.
 */
export const FOODS: Food[] = [
  { id: "chicken-breast", name: "Chicken breast (grilled)", servingSize: "100 g", calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: "white-rice", name: "White rice (cooked)", servingSize: "1 cup (158 g)", calories: 205, protein: 4.3, carbs: 45, fat: 0.4 },
  { id: "brown-rice", name: "Brown rice (cooked)", servingSize: "1 cup (195 g)", calories: 216, protein: 5, carbs: 45, fat: 1.8 },
  { id: "egg", name: "Egg (large)", servingSize: "1 egg (50 g)", calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 },
  { id: "banana", name: "Banana", servingSize: "1 medium (118 g)", calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { id: "apple", name: "Apple", servingSize: "1 medium (182 g)", calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  { id: "orange", name: "Orange", servingSize: "1 medium (131 g)", calories: 62, protein: 1.2, carbs: 15, fat: 0.2 },
  { id: "strawberries", name: "Strawberries", servingSize: "1 cup (152 g)", calories: 49, protein: 1, carbs: 12, fat: 0.5 },
  { id: "oatmeal", name: "Oatmeal (cooked)", servingSize: "1 cup (234 g)", calories: 166, protein: 5.9, carbs: 28, fat: 3.6 },
  { id: "whole-wheat-bread", name: "Whole wheat bread", servingSize: "1 slice (32 g)", calories: 80, protein: 4, carbs: 14, fat: 1 },
  { id: "bagel", name: "Bagel (plain)", servingSize: "1 medium (105 g)", calories: 277, protein: 11, carbs: 55, fat: 1.4 },
  { id: "pasta", name: "Pasta (cooked)", servingSize: "1 cup (140 g)", calories: 221, protein: 8.1, carbs: 43, fat: 1.3 },
  { id: "potato", name: "Potato (baked)", servingSize: "1 medium (173 g)", calories: 161, protein: 4.3, carbs: 37, fat: 0.2 },
  { id: "sweet-potato", name: "Sweet potato (baked)", servingSize: "1 medium (114 g)", calories: 103, protein: 2.3, carbs: 24, fat: 0.2 },
  { id: "whole-milk", name: "Whole milk", servingSize: "1 cup (244 ml)", calories: 149, protein: 7.7, carbs: 12, fat: 8 },
  { id: "greek-yogurt", name: "Greek yogurt (plain, nonfat)", servingSize: "170 g", calories: 100, protein: 17, carbs: 6, fat: 0.7 },
  { id: "cottage-cheese", name: "Cottage cheese (2%)", servingSize: "1 cup (226 g)", calories: 183, protein: 24, carbs: 11, fat: 5 },
  { id: "cheddar", name: "Cheddar cheese", servingSize: "1 oz (28 g)", calories: 113, protein: 7, carbs: 0.4, fat: 9.3 },
  { id: "salmon", name: "Salmon (cooked)", servingSize: "100 g", calories: 206, protein: 22, carbs: 0, fat: 12 },
  { id: "tuna", name: "Tuna (canned in water)", servingSize: "100 g", calories: 116, protein: 26, carbs: 0, fat: 0.8 },
  { id: "ground-beef", name: "Ground beef (85% lean, cooked)", servingSize: "100 g", calories: 250, protein: 26, carbs: 0, fat: 15 },
  { id: "tofu", name: "Tofu (firm)", servingSize: "100 g", calories: 144, protein: 17, carbs: 3, fat: 9 },
  { id: "lentils", name: "Lentils (cooked)", servingSize: "1 cup (198 g)", calories: 230, protein: 18, carbs: 40, fat: 0.8 },
  { id: "black-beans", name: "Black beans (cooked)", servingSize: "1 cup (172 g)", calories: 227, protein: 15, carbs: 41, fat: 0.9 },
  { id: "broccoli", name: "Broccoli (cooked)", servingSize: "1 cup (156 g)", calories: 55, protein: 3.7, carbs: 11, fat: 0.6 },
  { id: "spinach", name: "Spinach (raw)", servingSize: "1 cup (30 g)", calories: 7, protein: 0.9, carbs: 1.1, fat: 0.1 },
  { id: "avocado", name: "Avocado", servingSize: "1/2 medium (100 g)", calories: 160, protein: 2, carbs: 8.5, fat: 14.7 },
  { id: "almonds", name: "Almonds", servingSize: "1 oz (28 g)", calories: 164, protein: 6, carbs: 6, fat: 14 },
  { id: "peanut-butter", name: "Peanut butter", servingSize: "2 tbsp (32 g)", calories: 190, protein: 7, carbs: 8, fat: 16 },
  { id: "olive-oil", name: "Olive oil", servingSize: "1 tbsp (14 g)", calories: 119, protein: 0, carbs: 0, fat: 13.5 },
];

export function findFood(id: string): Food | undefined {
  return FOODS.find((f) => f.id === id);
}

/**
 * Identifies "the same food" across entries: the catalogue id, or for AI items the lower-cased name
 * plus portion. FOOD_KEY_SQL must stay the same rule, for queries over log_entries.
 */
export function foodKey(foodId: string, name: string, servingSize: string): string {
  return foodId.startsWith("ai:") ? `ai:${name.toLowerCase()}|${servingSize}` : foodId;
}
export const FOOD_KEY_SQL = "CASE WHEN food_id LIKE 'ai:%' THEN CONCAT('ai:', LOWER(name), '|', serving_size) ELSE food_id END";

export const RECENT_DAYS = 60; // how far back "Recent" looks
export const RECENT_LIMIT = 20;
export const REPEAT_MAX_ITEMS = 30; // one "add again" request
export const MAX_SERVINGS = 100;

export function searchFoods(query: string): Food[] {
  const q = query.trim().toLowerCase();
  if (!q) return FOODS;
  return FOODS.filter((f) => f.name.toLowerCase().includes(q));
}
