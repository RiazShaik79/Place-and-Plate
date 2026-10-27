import type { NutritionEstimate, NutritionItem } from "./types";

/**
 * Models to try, in order. gemini-2.5-flash-lite is the requested model, but Google has closed it
 * to new API keys (404 "no longer available to new users"), so we fall back to its named
 * replacement and remember whichever model answered. GEMINI_MODEL overrides the list.
 */
const MODELS = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ["gemini-2.5-flash-lite", "gemini-3.5-flash-lite"];
const endpoint = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const TIMEOUT_MS = 30_000;

const globalForGemini = globalThis as unknown as { geminiModelIndex?: number };

/** Error with an HTTP status the route handler should return. */
export class GeminiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

/**
 * Call Gemini with a system prompt and a JSON response schema; return the parsed JSON.
 * Throws GeminiError (500 key missing, 429 rate limit, 502 anything else).
 */
export async function generateJson(systemPrompt: string, schema: object, parts: Part[]): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new GeminiError("GEMINI_API_KEY is not set in .env", 500);
  }
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: schema },
  });

  for (let i = globalForGemini.geminiModelIndex ?? 0; i < MODELS.length; i++) {
    let res: Response;
    try {
      res = await fetch(endpoint(MODELS[i]), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new GeminiError(timedOut ? "Gemini request timed out" : "Could not reach Gemini", 502);
    }

    // Model unavailable for this key: try the next one, and skip this one from now on.
    if (res.status === 404 && i < MODELS.length - 1) {
      console.warn(`Gemini model ${MODELS[i]} unavailable (404); falling back to ${MODELS[i + 1]}`);
      globalForGemini.geminiModelIndex = i + 1;
      continue;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Gemini API error ${res.status}: ${detail.slice(0, 500)}`);
      const status = res.status === 429 ? 429 : 502;
      throw new GeminiError(status === 429 ? "Gemini rate limit reached, try again shortly" : "Gemini request failed", status);
    }

    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const reason = data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason ?? "empty response";
      throw new GeminiError(`Gemini returned no result (${reason})`, 502);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new GeminiError("Gemini returned invalid JSON", 502);
    }
  }
  throw new GeminiError("No Gemini model is available for this API key", 502);
}

// ---------------------------------------------------------------------------------------------
// Food nutrition
// ---------------------------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a nutrition estimation assistant for a calorie tracking app.
Given a description or photo of a meal, identify each distinct food item and estimate its
nutrition for the portion described or shown.

Rules:
- Return one item per distinct food (e.g. "grilled chicken", "white rice", "side salad").
- If no quantity is given, assume a typical single adult portion and state it in "portion".
- Use realistic values based on standard nutrition data (e.g. USDA). Macros are in grams.
- Calories should roughly match 4*protein + 4*carbs + 9*fat.
- Put key assumptions (portion sizes, cooking method, dressings) in "notes", briefly.
- If the input contains no identifiable food, return an empty "items" array and explain in "notes".`;

// Gemini structured-output schema (OpenAPI subset).
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Food name, e.g. 'Grilled chicken breast'" },
          portion: { type: "STRING", description: "Estimated portion, e.g. '150 g' or '1 cup'" },
          calories: { type: "NUMBER" },
          protein: { type: "NUMBER", description: "grams" },
          carbs: { type: "NUMBER", description: "grams" },
          fat: { type: "NUMBER", description: "grams" },
        },
        required: ["name", "portion", "calories", "protein", "carbs", "fat"],
        propertyOrdering: ["name", "portion", "calories", "protein", "carbs", "fat"],
      },
    },
    notes: { type: "STRING" },
  },
  required: ["items", "notes"],
  propertyOrdering: ["items", "notes"],
};

async function generate(parts: Part[]): Promise<NutritionEstimate> {
  return normalize(await generateJson(SYSTEM_PROMPT, RESPONSE_SCHEMA, parts));
}

/** Validate the model output and recompute totals server-side. */
function normalize(raw: unknown): NutritionEstimate {
  const obj = (raw ?? {}) as { items?: unknown; notes?: unknown };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : 0);

  const items: NutritionItem[] = (Array.isArray(obj.items) ? obj.items : [])
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object" && typeof (i as { name?: unknown }).name === "string")
    .map((i) => ({
      name: String(i.name).trim(),
      portion: typeof i.portion === "string" ? i.portion.trim() : "",
      calories: num(i.calories),
      protein: num(i.protein),
      carbs: num(i.carbs),
      fat: num(i.fat),
    }));

  const sum = (k: keyof Omit<NutritionItem, "name" | "portion">) => Math.round(items.reduce((s, i) => s + i[k], 0) * 10) / 10;

  return {
    items,
    totals: { calories: sum("calories"), protein: sum("protein"), carbs: sum("carbs"), fat: sum("fat") },
    notes: typeof obj.notes === "string" ? obj.notes.trim() : "",
  };
}

export function estimateFromText(description: string): Promise<NutritionEstimate> {
  return generate([{ text: `Estimate the nutrition of this meal: ${description}` }]);
}

export function estimateFromImage(base64: string, mimeType: string, hint?: string): Promise<NutritionEstimate> {
  const prompt = hint
    ? `Identify the foods in this photo and estimate their nutrition. Additional context from the user: ${hint}`
    : "Identify the foods in this photo and estimate their nutrition.";
  return generate([{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }]);
}
