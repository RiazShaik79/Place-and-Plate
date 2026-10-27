// Account field rules shared by the auth forms (client) and the auth routes (server).

export const NAME_MAX = 60;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AccountField =
  | "name"
  | "email"
  | "password"
  | "currentPassword"
  | "newPassword"
  | "weightKg"
  | "heightCm"
  | "stepsTarget"
  | "waterTargetMl"
  | "birthYear"
  | "sex"
  | "activity"
  | "goalWeightKg"
  | "weeklyChangeKg"
  | "sleepTargetMin"
  | "calorieGoal"
  | "line1"
  | "line2"
  | "city"
  | "region"
  | "postalCode"
  | "country";

/** A validation problem tied to one form field, so the form can show it inline. */
export interface FieldError {
  field: AccountField;
  message: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return "Enter your name.";
  if (n.length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`;
  return null;
}

export function validateEmail(email: string): string | null {
  const e = email.trim();
  if (!e) return "Enter your email address.";
  if (e.length > EMAIL_MAX || !EMAIL_RE.test(e)) return "Enter an email address like name@example.com.";
  return null;
}

export function validateNewPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  return null;
}

export const WEIGHT_MIN = 30;
export const WEIGHT_MAX = 300;

/** Body weight in kg (optional; used for exercise calories). Accepts a number or numeric string. */
export function validateWeight(v: unknown): string | null {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < WEIGHT_MIN || n > WEIGHT_MAX) {
    return `Enter a weight from ${WEIGHT_MIN} to ${WEIGHT_MAX} kg, or leave it empty.`;
  }
  return null;
}

export const HEIGHT_MIN = 100;
export const HEIGHT_MAX = 250;
export const STEPS_TARGET_MIN = 1000;
export const STEPS_TARGET_MAX = 50000;
export const DAILY_STEPS_MAX = 100000;
export const ADDRESS_FIELD_MAX = 100;
export const WATER_TARGET_MIN = 500; // ml
export const WATER_TARGET_MAX = 6000;
export const WATER_DEFAULT_ML = 2000; // used when no target is set
export const DAILY_WATER_MAX = 10000;
export const WATER_ADD_MAX = 2000; // one quick add (or undo) at most
export const WATER_GLASS = 250;
export const WATER_BOTTLE = 500;

/** Number in [min, max] from a number or numeric string; null for empty. undefined = invalid. */
export function optionalNumber(v: unknown, min: number, max: number): number | null | undefined {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null;
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

export const HEIGHT_ERROR = `Enter a height from ${HEIGHT_MIN} to ${HEIGHT_MAX} cm, or leave it empty.`;
export const STEPS_TARGET_ERROR = `Enter a step target from ${STEPS_TARGET_MIN.toLocaleString("en-US")} to ${STEPS_TARGET_MAX.toLocaleString("en-US")}, or leave it empty.`;
export const WATER_TARGET_ERROR = `Enter a water target from ${WATER_TARGET_MIN} to ${WATER_TARGET_MAX.toLocaleString("en-US")} ml, or leave it empty.`;

/** Body mass index from height (cm) and weight (kg), one decimal, with the WHO band. */
export function bmi(heightCm: number, weightKg: number): { value: number; band: string } {
  const value = Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
  const band = value < 18.5 ? "underweight" : value < 25 ? "healthy weight" : value < 30 ? "overweight" : "obese";
  return { value, band };
}

/** Why a password reset link can't be used, in the app's voice. */
export const RESET_LINK_PROBLEMS = {
  expired: "This reset link has expired. Links work for 30 minutes, so request a new one.",
  used: "This reset link has already been used. Request a new one if you still need to change your password.",
  invalid: "This reset link isn't valid. It may be incomplete, so request a new one.",
} as const;

/** Where a signed-in person lands by default: the dashboard is the app's home screen. */
export const HOME_PATH = "/dashboard";

/** Only same-site paths are allowed as a post-sign-in destination (no open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = HOME_PATH): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

/** First letters of the first and last word, for the avatar. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
