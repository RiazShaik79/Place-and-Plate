import type { Exercise, ExerciseEntry } from "./types";

/**
 * Built-in activity catalogue. MET values follow the 2024 Adult Compendium of Physical
 * Activities (rounded). Calories burned = MET × body weight (kg) × hours.
 */
export const EXERCISES: Exercise[] = [
  { id: "walk-outdoor-easy", name: "Walking outdoors, easy pace", category: "cardio", intensity: "light", met: 3.0, detail: "about 4 km/h" },
  { id: "walk-outdoor-brisk", name: "Walking outdoors, brisk", category: "cardio", intensity: "moderate", met: 4.3, detail: "about 5.5 km/h" },
  { id: "walk-treadmill", name: "Walking on a treadmill", category: "cardio", intensity: "moderate", met: 3.8, detail: "about 5 km/h, flat" },
  { id: "walk-treadmill-incline", name: "Incline treadmill walk", category: "cardio", intensity: "vigorous", met: 6.5, detail: "5 km/h at 10% incline" },
  { id: "hiking", name: "Hiking", category: "cardio", intensity: "vigorous", met: 6.0, detail: "hills, light pack" },
  { id: "run-easy", name: "Running, easy pace", category: "cardio", intensity: "vigorous", met: 8.3, detail: "about 8 km/h" },
  { id: "run-steady", name: "Running, steady pace", category: "cardio", intensity: "vigorous", met: 9.8, detail: "about 10 km/h" },
  { id: "run-fast", name: "Running, fast pace", category: "cardio", intensity: "vigorous", met: 11.5, detail: "about 12 km/h" },
  { id: "cycle-leisure", name: "Cycling, leisurely", category: "cardio", intensity: "moderate", met: 4.0, detail: "under 16 km/h" },
  { id: "cycle-moderate", name: "Cycling, moderate", category: "cardio", intensity: "vigorous", met: 6.8, detail: "19 to 22 km/h" },
  { id: "cycle-stationary", name: "Stationary bike", category: "cardio", intensity: "moderate", met: 5.5, detail: "moderate effort" },
  { id: "swim-laps", name: "Swimming laps", category: "cardio", intensity: "vigorous", met: 7.0, detail: "freestyle, moderate effort" },
  { id: "elliptical", name: "Elliptical trainer", category: "cardio", intensity: "moderate", met: 5.0, detail: "moderate effort" },
  { id: "rowing-machine", name: "Rowing machine", category: "cardio", intensity: "vigorous", met: 7.0, detail: "moderate effort" },
  { id: "jump-rope", name: "Jumping rope", category: "cardio", intensity: "vigorous", met: 11.0, detail: "moderate pace" },
  { id: "dancing", name: "Dancing", category: "cardio", intensity: "moderate", met: 5.0, detail: "general, social" },
  { id: "hiit", name: "HIIT circuit", category: "cardio", intensity: "vigorous", met: 8.0, detail: "intervals with short rests" },
  { id: "weights-moderate", name: "Weight training", category: "strength", intensity: "moderate", met: 3.5, detail: "machines or free weights" },
  { id: "weights-vigorous", name: "Weight training, heavy", category: "strength", intensity: "vigorous", met: 6.0, detail: "compound lifts, short rests" },
  { id: "bodyweight", name: "Bodyweight exercises", category: "strength", intensity: "moderate", met: 3.8, detail: "push-ups, squats, lunges" },
  { id: "yoga", name: "Yoga", category: "flexibility", intensity: "light", met: 2.5, detail: "hatha, general" },
  { id: "pilates", name: "Pilates", category: "flexibility", intensity: "light", met: 3.0, detail: "mat, general" },
  { id: "stretching", name: "Stretching", category: "flexibility", intensity: "light", met: 2.3, detail: "general" },
  { id: "football", name: "Football (soccer)", category: "sports", intensity: "vigorous", met: 7.0, detail: "casual game" },
  { id: "basketball", name: "Basketball", category: "sports", intensity: "vigorous", met: 6.5, detail: "casual game" },
  { id: "tennis", name: "Tennis", category: "sports", intensity: "vigorous", met: 7.3, detail: "singles" },
  { id: "badminton", name: "Badminton", category: "sports", intensity: "moderate", met: 5.5, detail: "social play" },
];

/** Used when the user hasn't saved a body weight. */
export const DEFAULT_WEIGHT_KG = 70;
export const MAX_MINUTES = 600;
export const MIN_MET = 1;
export const MAX_MET = 23;

/** The WHO guideline for adults: at least 150 minutes of moderate activity a week. */
export const WEEKLY_MINUTES_TARGET = 150;

export function findExercise(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}

export function searchExercises(query: string): Exercise[] {
  const q = query.trim().toLowerCase();
  if (!q) return EXERCISES;
  return EXERCISES.filter((e) => `${e.name} ${e.detail} ${e.category}`.toLowerCase().includes(q));
}

/** kcal burned, rounded to a whole number. */
export function caloriesBurned(met: number, weightKg: number, minutes: number): number {
  return Math.round(met * weightKg * (minutes / 60));
}

export function sumExercise(entries: Pick<ExerciseEntry, "minutes" | "calories">[]) {
  return entries.reduce((t, e) => ({ minutes: t.minutes + e.minutes, calories: t.calories + e.calories }), { minutes: 0, calories: 0 });
}

/** e.g. "45 min", "1 h 30 min". */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
