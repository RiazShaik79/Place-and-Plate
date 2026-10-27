"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  bmi,
  HEIGHT_ERROR,
  HEIGHT_MAX,
  HEIGHT_MIN,
  optionalNumber,
  STEPS_TARGET_ERROR,
  STEPS_TARGET_MAX,
  STEPS_TARGET_MIN,
  validateWeight,
  WATER_DEFAULT_ML,
  WATER_TARGET_ERROR,
  WATER_TARGET_MAX,
  WATER_TARGET_MIN,
  WEIGHT_MAX,
  WEIGHT_MIN,
} from "@/lib/account";
import { ACTIVITY, BIRTH_YEAR_MIN, floorFor, isActivity, isSex, MIN_AGE, missingFor, PACES, suggestedGoal, type MissingField } from "@/lib/goals";
import { SLEEP_TARGET_MAX, SLEEP_TARGET_MIN } from "@/lib/sleep";
import { apiFetch, readFieldError, toFriendlyMessage } from "@/lib/client";
import { fmt, fmtKcal, MAX_GOAL, MIN_GOAL, todayISO } from "@/lib/nutrition";
import type { User } from "@/lib/types";
import { SelectField, SubmitButton, TextField } from "./FormField";
import Notice from "./Notice";
import { SavedNote, Section, useFlash } from "./SettingsSection";

type Field =
  | "calorieGoal"
  | "stepsTarget"
  | "waterTargetMl"
  | "sleepTargetMin"
  | "birthYear"
  | "sex"
  | "heightCm"
  | "weightKg"
  | "activity"
  | "goalWeightKg"
  | "weeklyChangeKg";
const ORDER: Field[] = ["calorieGoal", "stepsTarget", "waterTargetMl", "sleepTargetMin", "birthYear", "sex", "heightCm", "weightKg", "activity", "goalWeightKg", "weeklyChangeKg"];
const str = (n: number | string | null) => (n === null ? "" : String(n));
const num = (v: string) => (v.trim() ? Number(v) : null);
const hoursOf = (minutes: number | null) => (minutes === null ? "" : String(minutes / 60));
const SLEEP_TARGET_ERROR = "Enter a sleep target from 4 to 12 hours, in half hours, or leave it empty.";

const SEX_OPTIONS = [
  { value: "", label: "Prefer not to say" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];
const ACTIVITY_OPTIONS = [{ value: "", label: "Choose one" }, ...Object.entries(ACTIVITY).map(([value, a]) => ({ value, label: `${a.label}: ${a.hint.toLowerCase()}` }))];
const paceLabel = (kg: number) => (kg === 0 ? "Keep my weight" : `${kg < 0 ? "Lose" : "Gain"} ${fmt(Math.abs(kg))} kg a week`);
// Empty = keep my weight (nothing chosen yet); 0 isn't listed separately.
const PACE_OPTIONS = [{ value: "", label: "Keep my weight" }, ...PACES.filter((p) => p !== 0).map((p) => ({ value: String(p), label: paceLabel(p) }))];
const MISSING_LABEL: Record<MissingField, string> = { birthYear: "year of birth", heightCm: "height", weightKg: "weight", activity: "activity level" };
const listOf = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** Daily targets, the details behind a suggested calorie goal, and a weight goal. */
export default function BodyGoalsSection({ user, goal }: { user: User; goal: number }) {
  const router = useRouter();
  const initial: Record<Field, string> = {
    calorieGoal: String(goal),
    stepsTarget: str(user.stepsTarget),
    waterTargetMl: str(user.waterTargetMl),
    sleepTargetMin: hoursOf(user.sleepTargetMin), // shown in hours
    birthYear: str(user.birthYear),
    sex: user.sex ?? "",
    heightCm: str(user.heightCm),
    weightKg: str(user.weightKg),
    activity: user.activity ?? "",
    goalWeightKg: str(user.goalWeightKg),
    weeklyChangeKg: user.weeklyChangeKg ? String(user.weeklyChangeKg) : "",
  };
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, showFlash, clearFlash] = useFlash();
  const refs = {
    calorieGoal: useRef<HTMLInputElement>(null),
    stepsTarget: useRef<HTMLInputElement>(null),
    waterTargetMl: useRef<HTMLInputElement>(null),
    sleepTargetMin: useRef<HTMLInputElement>(null),
    birthYear: useRef<HTMLInputElement>(null),
    sex: useRef<HTMLSelectElement>(null),
    heightCm: useRef<HTMLInputElement>(null),
    weightKg: useRef<HTMLInputElement>(null),
    activity: useRef<HTMLSelectElement>(null),
    goalWeightKg: useRef<HTMLInputElement>(null),
    weeklyChangeKg: useRef<HTMLSelectElement>(null),
  };
  const dirty = ORDER.some((f) => values[f].trim() !== saved[f]);
  const thisYear = new Date().getFullYear();
  const latestBirthYear = thisYear - MIN_AGE;

  const set = (f: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    setErrors((p) => ({ ...p, [f]: undefined }));
  };

  function validate() {
    const found: Partial<Record<Field, string>> = {};
    const g = Number(values.calorieGoal);
    if (!Number.isInteger(g) || g < MIN_GOAL || g > MAX_GOAL) found.calorieGoal = `Enter a whole number from ${fmtKcal(MIN_GOAL)} to ${fmtKcal(MAX_GOAL)}.`;
    const s = optionalNumber(values.stepsTarget, STEPS_TARGET_MIN, STEPS_TARGET_MAX);
    if (s === undefined || (s !== null && !Number.isInteger(s))) found.stepsTarget = STEPS_TARGET_ERROR;
    const wt = optionalNumber(values.waterTargetMl, WATER_TARGET_MIN, WATER_TARGET_MAX);
    if (wt === undefined || (wt !== null && !Number.isInteger(wt))) found.waterTargetMl = WATER_TARGET_ERROR;
    const sh = optionalNumber(values.sleepTargetMin, SLEEP_TARGET_MIN / 60, SLEEP_TARGET_MAX / 60);
    if (sh === undefined || (sh !== null && !Number.isInteger(sh * 2))) found.sleepTargetMin = SLEEP_TARGET_ERROR;
    const by = optionalNumber(values.birthYear, BIRTH_YEAR_MIN, latestBirthYear);
    if (by === undefined || (by !== null && !Number.isInteger(by))) found.birthYear = `Enter a year from ${BIRTH_YEAR_MIN} to ${latestBirthYear}, or leave it empty.`;
    if (optionalNumber(values.heightCm, HEIGHT_MIN, HEIGHT_MAX) === undefined) found.heightCm = HEIGHT_ERROR;
    if (values.weightKg.trim()) {
      const w = validateWeight(values.weightKg);
      if (w) found.weightKg = w;
    }
    if (optionalNumber(values.goalWeightKg, WEIGHT_MIN, WEIGHT_MAX) === undefined) found.goalWeightKg = `Enter a goal weight from ${WEIGHT_MIN} to ${WEIGHT_MAX} kg, or leave it empty.`;
    return found;
  }

  function showErrors(found: Partial<Record<Field, string>>) {
    setErrors(found);
    const first = ORDER.find((f) => found[f]);
    if (first) refs[first].current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !dirty) return;
    clearFlash();
    setFormError(null);
    const found = validate();
    if (Object.keys(found).length > 0) return showErrors(found);
    setBusy(true);
    try {
      const res = await apiFetch("/api/account/body", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calorieGoal: Number(values.calorieGoal),
          stepsTarget: num(values.stepsTarget),
          waterTargetMl: num(values.waterTargetMl),
          sleepTargetMin: values.sleepTargetMin.trim() ? Math.round(Number(values.sleepTargetMin) * 60) : null,
          birthYear: num(values.birthYear),
          sex: values.sex || null,
          heightCm: num(values.heightCm),
          weightKg: num(values.weightKg),
          activity: values.activity || null,
          goalWeightKg: num(values.goalWeightKg),
          weeklyChangeKg: num(values.weeklyChangeKg),
          today: todayISO(), // a changed weight is logged as today's weigh-in
        }),
      });
      if (!res.ok) {
        const { message, field } = await readFieldError(res);
        if (ORDER.includes(field as Field)) showErrors({ [field as Field]: message });
        else setFormError(message);
        return;
      }
      const { user: u } = (await res.json()) as { user: User };
      const next: Record<Field, string> = {
        calorieGoal: values.calorieGoal.trim(),
        stepsTarget: str(u.stepsTarget),
        waterTargetMl: str(u.waterTargetMl),
        sleepTargetMin: hoursOf(u.sleepTargetMin),
        birthYear: str(u.birthYear),
        sex: u.sex ?? "",
        heightCm: str(u.heightCm),
        weightKg: str(u.weightKg),
        activity: u.activity ?? "",
        goalWeightKg: str(u.goalWeightKg),
        weeklyChangeKg: u.weeklyChangeKg ? String(u.weeklyChangeKg) : "",
      };
      setValues(next);
      setSaved(next);
      showFlash("Changes saved");
      router.refresh();
    } catch (err) {
      setFormError(err instanceof TypeError ? "Couldn't reach the app. Check that it's still running, then try again." : toFriendlyMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Live readouts while typing, from whichever values are currently valid.
  const valid = (v: string, min: number, max: number) => {
    const n = optionalNumber(v, min, max);
    return typeof n === "number" ? n : null;
  };
  const h = valid(values.heightCm, HEIGHT_MIN, HEIGHT_MAX);
  const w = valid(values.weightKg, WEIGHT_MIN, WEIGHT_MAX);
  const index = h !== null && w !== null ? bmi(h, w) : null;
  const profile = {
    birthYear: valid(values.birthYear, BIRTH_YEAR_MIN, latestBirthYear),
    sex: isSex(values.sex) ? values.sex : null,
    heightCm: h,
    weightKg: w,
    activity: isActivity(values.activity) ? values.activity : null,
    weeklyChangeKg: num(values.weeklyChangeKg),
  };
  const suggestion = suggestedGoal(profile, thisYear);
  const missing = missingFor(profile).map((m) => MISSING_LABEL[m]);

  function applySuggestion() {
    if (!suggestion) return;
    setValues((v) => ({ ...v, calorieGoal: String(suggestion.kcal) }));
    setErrors((p) => ({ ...p, calorieGoal: undefined }));
    refs.calorieGoal.current?.focus();
  }

  return (
    <Section title="Body and goals" description="Your daily targets, and the details used for a suggested calorie goal, exercise calories and BMI.">
      <form onSubmit={submit} noValidate className="space-y-6">
        <fieldset className="grid items-start gap-5 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-semibold text-muted">Daily targets</legend>
          <TextField
            ref={refs.calorieGoal}
            id="body-goal"
            label="Daily calorie goal"
            type="number"
            inputMode="numeric"
            hint={`In kcal, ${fmtKcal(MIN_GOAL)} to ${fmtKcal(MAX_GOAL)}. See the suggestion below.`}
            inputClassName="tabular-nums"
            value={values.calorieGoal}
            onChange={set("calorieGoal")}
            error={errors.calorieGoal}
          />
          <TextField
            ref={refs.stepsTarget}
            id="body-steps"
            label="Daily step target"
            type="number"
            inputMode="numeric"
            placeholder="e.g. 8000"
            hint="Optional. Shown on your exercise page and dashboard."
            inputClassName="tabular-nums"
            value={values.stepsTarget}
            onChange={set("stepsTarget")}
            error={errors.stepsTarget}
          />
          <TextField
            ref={refs.waterTargetMl}
            id="body-water"
            label="Daily water target"
            type="number"
            inputMode="numeric"
            placeholder={`e.g. ${WATER_DEFAULT_ML}`}
            hint={`Optional, in ml. ${fmtKcal(WATER_DEFAULT_ML)} if empty. Shown on your food page.`}
            inputClassName="tabular-nums"
            value={values.waterTargetMl}
            onChange={set("waterTargetMl")}
            error={errors.waterTargetMl}
          />
          <TextField
            ref={refs.sleepTargetMin}
            id="body-sleep"
            label="Sleep target"
            type="number"
            inputMode="decimal"
            step="0.5"
            placeholder="e.g. 8"
            hint="Optional, in hours a night. 8 if empty. Shown on your dashboard."
            inputClassName="tabular-nums"
            value={values.sleepTargetMin}
            onChange={set("sleepTargetMin")}
            error={errors.sleepTargetMin}
          />
        </fieldset>

        <fieldset className="grid items-start gap-5 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-semibold text-muted">About you</legend>
          <TextField
            ref={refs.birthYear}
            id="body-birth-year"
            label="Year of birth"
            type="number"
            inputMode="numeric"
            placeholder="e.g. 1990"
            hint="Optional. For the suggested goal."
            inputClassName="tabular-nums"
            value={values.birthYear}
            onChange={set("birthYear")}
            error={errors.birthYear}
          />
          <SelectField
            ref={refs.sex}
            id="body-sex"
            label="Sex"
            options={SEX_OPTIONS}
            hint="Optional. Makes the suggestion more precise."
            value={values.sex}
            onChange={set("sex")}
            error={errors.sex}
          />
          <TextField
            ref={refs.heightCm}
            id="body-height"
            label="Height"
            type="number"
            inputMode="decimal"
            placeholder="cm"
            hint="Optional, in cm."
            inputClassName="tabular-nums"
            value={values.heightCm}
            onChange={set("heightCm")}
            error={errors.heightCm}
          />
          <TextField
            ref={refs.weightKg}
            id="body-weight"
            label="Current weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="kg"
            hint="Optional, in kg. A new value is logged as today's weigh-in."
            inputClassName="tabular-nums"
            value={values.weightKg}
            onChange={set("weightKg")}
            error={errors.weightKg}
          />
          <SelectField
            ref={refs.activity}
            id="body-activity"
            label="Activity level"
            className="sm:col-span-2"
            options={ACTIVITY_OPTIONS}
            hint="Your usual week, including work."
            value={values.activity}
            onChange={set("activity")}
            error={errors.activity}
          />
        </fieldset>

        <fieldset className="grid items-start gap-5 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-semibold text-muted">Weight goal</legend>
          <TextField
            ref={refs.goalWeightKg}
            id="body-goal-weight"
            label="Goal weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="kg"
            hint="Optional. Shown on your dashboard."
            inputClassName="tabular-nums"
            value={values.goalWeightKg}
            onChange={set("goalWeightKg")}
            error={errors.goalWeightKg}
          />
          <SelectField
            ref={refs.weeklyChangeKg}
            id="body-pace"
            label="Pace"
            options={PACE_OPTIONS}
            hint="0.5 kg a week or less is easier to keep up."
            value={values.weeklyChangeKg}
            onChange={set("weeklyChangeKg")}
            error={errors.weeklyChangeKg}
          />
        </fieldset>

        <div className="space-y-3 rounded-card bg-sunken px-4 py-3.5 text-sm" aria-live="polite">
          {suggestion ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="text-muted">
                  Suggested goal <span className="text-base font-bold text-ink tabular-nums">{fmtKcal(suggestion.kcal)} kcal</span>
                </p>
                {String(suggestion.kcal) === values.calorieGoal.trim() ? (
                  <span className="rounded-full bg-basil-soft px-3 py-1 text-[13px] font-semibold text-basil">This is your goal</span>
                ) : (
                  <button
                    type="button"
                    onClick={applySuggestion}
                    className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-basil transition-colors hover:bg-basil-soft"
                  >
                    Use {fmtKcal(suggestion.kcal)} kcal
                  </button>
                )}
              </div>
              <p className="text-muted">
                About {fmtKcal(suggestion.maintenance)} kcal a day keeps your weight steady
                {suggestion.change !== 0 && (
                  <>
                    ; {suggestion.change < 0 ? "losing" : "gaining"} {fmt(Math.abs(profile.weeklyChangeKg ?? 0))} kg a week{" "}
                    {suggestion.change < 0 ? "takes" : "adds"} about {fmtKcal(Math.abs(suggestion.change))}
                  </>
                )}
                .
                {suggestion.floorApplied && <> That pace would go below {fmtKcal(floorFor(profile.sex))} kcal, so the suggestion stops there. A slower pace is safer.</>}
                {suggestion.estimated && <> Without sex this is a rougher estimate, give or take about 80 kcal.</>}
              </p>
            </>
          ) : (
            <p className="text-muted">Add your {listOf(missing)} to get a suggested calorie goal.</p>
          )}
          <p className="border-t border-line pt-3 text-muted">
            {index ? (
              <>
                BMI <span className="font-semibold text-ink">{index.value}</span>, in the {index.band} range. It&apos;s a rough
                guide that doesn&apos;t account for muscle or build.
              </>
            ) : (
              "Add your height and weight to see your BMI."
            )}
          </p>
        </div>

        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SubmitButton busy={busy} disabled={!dirty}>
            {busy ? "Saving…" : "Save changes"}
          </SubmitButton>
          {flash && <SavedNote text={flash} />}
        </div>
      </form>
    </Section>
  );
}
