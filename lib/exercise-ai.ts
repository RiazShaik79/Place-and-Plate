// Server only: Gemini estimates for exercise (text or photo). Never trusted as-is: enums are
// checked, numbers clamped, and calories computed here from MET × weight × time.
import { generateJson } from "./gemini";
import { caloriesBurned, MAX_MET, MAX_MINUTES, MIN_MET } from "./exercises";
import { isCategory, isIntensity, type ExerciseEstimate, type ExerciseItem } from "./types";

const SYSTEM_PROMPT = `You are an exercise estimation assistant for a fitness and calorie tracking app.
Given a description of physical activity, or a photo (of a workout, a fitness tracker or watch
summary, or a gym machine display), identify each distinct activity and estimate it.

For each activity return:
- name: short and specific, e.g. "Brisk walk outdoors", "Treadmill walk, 5% incline", "Weight training".
- category: cardio, strength, flexibility or sports.
- intensity: light (under 3 MET), moderate (3 to 6 MET) or vigorous (over 6 MET).
- minutes: the duration. If none is given, assume a typical session (30 minutes) and say so in notes.
- met: the MET value from the Compendium of Physical Activities that best matches the activity,
  pace, incline and setting (indoor vs outdoor matters, e.g. treadmill vs outdoor walking).
- reportedCalories: ONLY if the user states, or the photo shows, a calories-burned number for this
  activity; otherwise 0. Do not invent it.

Put key assumptions (pace, incline, effort, assumed duration) in "notes", briefly.
If the input contains no identifiable physical activity, return an empty "items" array and explain in "notes".`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          category: { type: "STRING", enum: ["cardio", "strength", "flexibility", "sports"] },
          intensity: { type: "STRING", enum: ["light", "moderate", "vigorous"] },
          minutes: { type: "NUMBER" },
          met: { type: "NUMBER" },
          reportedCalories: { type: "NUMBER", description: "kcal stated by the user or shown on a device; 0 if none" },
        },
        required: ["name", "category", "intensity", "minutes", "met", "reportedCalories"],
        propertyOrdering: ["name", "category", "intensity", "minutes", "met", "reportedCalories"],
      },
    },
    notes: { type: "STRING" },
  },
  required: ["items", "notes"],
  propertyOrdering: ["items", "notes"],
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Validate model output; compute calories from the user's weight unless a number was reported. */
export function normalizeExercise(raw: unknown, weightKg: number, weightIsDefault: boolean): ExerciseEstimate {
  const obj = (raw ?? {}) as { items?: unknown; notes?: unknown };
  const items: ExerciseItem[] = (Array.isArray(obj.items) ? obj.items : [])
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object" && typeof (i as { name?: unknown }).name === "string")
    .map((i) => {
      const minutes = Math.round(clamp(Number(i.minutes) || 30, 1, MAX_MINUTES));
      const met = Math.round(clamp(Number(i.met) || 4, MIN_MET, MAX_MET) * 10) / 10;
      const reported = Number(i.reportedCalories);
      const calories = Number.isFinite(reported) && reported > 0 && reported <= 5000 ? Math.round(reported) : caloriesBurned(met, weightKg, minutes);
      return {
        name: String(i.name).trim().slice(0, 100),
        category: isCategory(i.category) ? i.category : "cardio",
        intensity: isIntensity(i.intensity) ? i.intensity : met > 6 ? "vigorous" : met >= 3 ? "moderate" : "light",
        minutes,
        met,
        calories,
      };
    })
    .filter((i) => i.name);

  return {
    items,
    totals: {
      minutes: items.reduce((s, i) => s + i.minutes, 0),
      calories: items.reduce((s, i) => s + i.calories, 0),
    },
    notes: typeof obj.notes === "string" ? obj.notes.trim() : "",
    weightKg,
    weightIsDefault,
  };
}

export async function estimateExerciseFromText(description: string, weightKg: number, weightIsDefault: boolean) {
  const raw = await generateJson(SYSTEM_PROMPT, RESPONSE_SCHEMA, [{ text: `Estimate this exercise: ${description}` }]);
  return normalizeExercise(raw, weightKg, weightIsDefault);
}

export async function estimateExerciseFromImage(base64: string, mimeType: string, hint: string | undefined, weightKg: number, weightIsDefault: boolean) {
  const prompt = hint
    ? `Identify the exercise in this photo and estimate it. Additional context from the user: ${hint}`
    : "Identify the exercise in this photo and estimate it.";
  const raw = await generateJson(SYSTEM_PROMPT, RESPONSE_SCHEMA, [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }]);
  return normalizeExercise(raw, weightKg, weightIsDefault);
}
