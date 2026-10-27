/** A food in the built-in catalogue. Nutrition values are per one serving. */
export interface Food {
  id: string;
  name: string;
  servingSize: string;
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
}

/** Meal categories, in the order they're shown. */
export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

export function isMeal(v: unknown): v is Meal {
  return typeof v === "string" && (MEALS as readonly string[]).includes(v);
}

/** Per-user preferences, stored on the `users` row. */
export interface Settings {
  calorieGoal: number; // kcal per day
}

/** A signed-in account as the client sees it (never includes the password hash). */
export interface User {
  id: number;
  name: string;
  email: string;
  weightKg: number | null; // optional; used for exercise calorie estimates
  heightCm: number | null; // optional; with weight gives BMI
  stepsTarget: number | null; // optional daily step goal
  waterTargetMl: number | null; // optional daily water goal in ml (null = the 2,000 ml default)
  // Behind the suggested calorie goal (lib/goals.ts); all optional.
  birthYear: number | null;
  sex: "female" | "male" | null; // null = not given (the suggestion uses the midpoint formula)
  activity: "sedentary" | "light" | "moderate" | "active" | "very_active" | null;
  goalWeightKg: number | null;
  weeklyChangeKg: number | null; // kg a week: negative = lose, 0 = maintain, positive = gain
  sleepTargetMin: number | null; // minutes a night (null = the 8-hour default)
  address: Address | null;
  emailVerified: boolean; // the sign-in email has been confirmed by a link sent to it
  pendingEmail: string | null; // a new email waiting for confirmation (sign-in email unchanged until then)
  createdAt: string; // ISO timestamp
}

/** A food the user has logged on a given day. Nutrition is already multiplied by `servings`. */
export interface LogEntry {
  id: number;
  date: string; // YYYY-MM-DD (user's local date)
  meal: Meal;
  foodId: string;
  name: string;
  servingSize: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: string; // ISO timestamp
}

/** A food from the user's recent log, with one serving's nutrition (for adding it again). */
export interface RecentFood {
  key: string; // see foodKey()
  entryId: number; // the newest entry for this food (the source for "add again")
  foodId: string;
  name: string;
  servingSize: string;
  calories: number; // per serving
  protein: number;
  carbs: number;
  fat: number;
  lastServings: number;
  lastMeal: Meal;
  lastDate: string;
  uses: number; // times logged in the window
  favoriteId: number | null;
}

/** A starred food: one serving's nutrition, snapshotted when it was starred. */
export interface FavoriteFood {
  id: number;
  key: string;
  foodId: string;
  name: string;
  servingSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** One food item identified by the AI lookup. Values are for the estimated portion. */
export interface NutritionItem {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** How an AI estimate was produced. Logged entries get food_id `ai:<source>`. */
export type AiSource = "text" | "photo";

/** Response shape of the AI lookup routes (/api/ai/text and /api/ai/image). */
export interface NutritionEstimate {
  items: NutritionItem[];
  totals: Totals;
  notes: string;
}

// ---------------------------------------------------------------------------------------------
// Exercise
// ---------------------------------------------------------------------------------------------

export const EXERCISE_CATEGORIES = ["cardio", "strength", "flexibility", "sports"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  cardio: "Cardio",
  strength: "Strength",
  flexibility: "Flexibility",
  sports: "Sports",
};

export const INTENSITIES = ["light", "moderate", "vigorous"] as const;
export type Intensity = (typeof INTENSITIES)[number];

export const INTENSITY_LABELS: Record<Intensity, string> = { light: "Light", moderate: "Moderate", vigorous: "Vigorous" };

export function isCategory(v: unknown): v is ExerciseCategory {
  return typeof v === "string" && (EXERCISE_CATEGORIES as readonly string[]).includes(v);
}
export function isIntensity(v: unknown): v is Intensity {
  return typeof v === "string" && (INTENSITIES as readonly string[]).includes(v);
}

/** An activity in the built-in catalogue. MET values from the Compendium of Physical Activities. */
export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  intensity: Intensity;
  met: number;
  detail: string; // e.g. "about 5 km/h"
}

/** One exercise item estimated by AI, for the given duration. Calories use the user's weight. */
export interface ExerciseItem {
  name: string;
  category: ExerciseCategory;
  intensity: Intensity;
  minutes: number;
  met: number;
  calories: number;
}

/** Response shape of /api/ai/exercise/text and /api/ai/exercise/image. */
export interface ExerciseEstimate {
  items: ExerciseItem[];
  totals: { minutes: number; calories: number };
  notes: string;
  weightKg: number; // the weight the calories were computed with
  weightIsDefault: boolean; // true when the user hasn't saved a weight
}

/** A logged exercise session. `source` is the catalogue id or `ai:text` / `ai:photo`. */
export interface ExerciseEntry {
  id: number;
  date: string; // YYYY-MM-DD (user's local date)
  source: string;
  name: string;
  category: ExerciseCategory;
  intensity: Intensity;
  minutes: number;
  met: number;
  calories: number; // kcal burned
  createdAt: string;
}

/** Per-day totals for the weekly strip. */
export interface ExerciseDay {
  date: string;
  minutes: number;
  calories: number;
}

// ---------------------------------------------------------------------------------------------
// Profile extras, steps and history
// ---------------------------------------------------------------------------------------------

export interface Address {
  line1: string;
  line2: string;
  city: string;
  region: string; // state / county / province
  postalCode: string;
  country: string;
}

export type Period = "day" | "week" | "month";

/** One bar on the dashboard: a day, a Monday-start week, or a calendar month. */
export interface HistoryBucket {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (inclusive, never after the requested end)
  days: number; // days in the bucket up to `end`
  foodDays: number; // days with any food logged
  daysOnTarget: number; // logged days that stayed within the calorie goal
  eaten: number; // kcal, total
  protein: number; // g, total
  carbs: number;
  fat: number;
  burned: number; // kcal from exercise, total
  minutes: number; // active minutes, total
  steps: number; // total
  stepDays: number; // days with a step count
  water: number; // ml, total
  waterDays: number; // days with any water logged
  sleep: number; // minutes asleep, total (a night belongs to the day you woke up)
  sleepDays: number; // nights logged
}

export interface History {
  period: Period;
  buckets: HistoryBucket[];
  calorieGoal: number;
  stepsTarget: number | null;
  waterTarget: number; // ml (the account target or the default)
  sleepTarget: number; // minutes a night (the account target or the default)
  /** Today's food, steps and water so far. Kept out of the buckets: an unfinished day isn't judged
   *  against the goal or counted in averages. Exercise stays in (it only adds up). */
  today: { eaten: number | null; steps: number | null; water: number | null; protein: number; carbs: number; fat: number };
}
