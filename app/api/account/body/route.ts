import { NextResponse } from "next/server";
import { updateBodyGoals } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  HEIGHT_ERROR,
  HEIGHT_MAX,
  HEIGHT_MIN,
  optionalNumber,
  STEPS_TARGET_ERROR,
  STEPS_TARGET_MAX,
  STEPS_TARGET_MIN,
  validateWeight,
  WATER_TARGET_ERROR,
  WATER_TARGET_MAX,
  WATER_TARGET_MIN,
  WEIGHT_MAX,
  WEIGHT_MIN,
} from "@/lib/account";
import { BIRTH_YEAR_MIN, isActivity, isPace, isSex, MIN_AGE } from "@/lib/goals";
import { SLEEP_TARGET_MAX, SLEEP_TARGET_MIN } from "@/lib/sleep";
import { ISO_DATE_RE, MAX_GOAL, MIN_GOAL, toISODate } from "@/lib/nutrition";
import { fieldError, readJson } from "@/lib/http";

/**
 * Body: { calorieGoal, stepsTarget, heightCm, weightKg, waterTargetMl, birthYear, sex, activity,
 * goalWeightKg, weeklyChangeKg, sleepTargetMin, today? } → { user }. Everything but the goal may be null; a field
 * that's left out keeps its saved value. A changed weight is logged as a weigh-in for `today`.
 */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const has = (k: string) => k in body;

  const goal = body.calorieGoal;
  if (typeof goal !== "number" || !Number.isInteger(goal) || goal < MIN_GOAL || goal > MAX_GOAL) {
    return fieldError("calorieGoal", `Enter a whole number from ${MIN_GOAL.toLocaleString("en-US")} to ${MAX_GOAL.toLocaleString("en-US")}.`);
  }
  const steps = optionalNumber(body.stepsTarget, STEPS_TARGET_MIN, STEPS_TARGET_MAX);
  if (steps === undefined || (steps !== null && !Number.isInteger(steps))) return fieldError("stepsTarget", STEPS_TARGET_ERROR);
  const height = optionalNumber(body.heightCm, HEIGHT_MIN, HEIGHT_MAX);
  if (height === undefined) return fieldError("heightCm", HEIGHT_ERROR);
  const weight = optionalNumber(body.weightKg, WEIGHT_MIN, WEIGHT_MAX);
  if (weight === undefined) return fieldError("weightKg", validateWeight(body.weightKg) ?? "Enter a valid weight.");
  const water = has("waterTargetMl") ? optionalNumber(body.waterTargetMl, WATER_TARGET_MIN, WATER_TARGET_MAX) : user.waterTargetMl;
  if (water === undefined || (water !== null && !Number.isInteger(water))) return fieldError("waterTargetMl", WATER_TARGET_ERROR);

  const thisYear = new Date().getFullYear();
  const latestBirthYear = thisYear - MIN_AGE;
  const birthYear = has("birthYear") ? optionalNumber(body.birthYear, BIRTH_YEAR_MIN, latestBirthYear) : user.birthYear;
  if (birthYear === undefined || (birthYear !== null && !Number.isInteger(birthYear))) {
    return fieldError("birthYear", `Enter a year from ${BIRTH_YEAR_MIN} to ${latestBirthYear}, or leave it empty.`);
  }
  const sex = has("sex") ? body.sex : user.sex;
  if (sex !== null && sex !== "" && !isSex(sex)) return fieldError("sex", "Choose female, male or prefer not to say.");
  const activity = has("activity") ? body.activity : user.activity;
  if (activity !== null && activity !== "" && !isActivity(activity)) return fieldError("activity", "Choose an activity level.");
  const goalWeight = has("goalWeightKg") ? optionalNumber(body.goalWeightKg, WEIGHT_MIN, WEIGHT_MAX) : user.goalWeightKg;
  if (goalWeight === undefined) return fieldError("goalWeightKg", `Enter a goal weight from ${WEIGHT_MIN} to ${WEIGHT_MAX} kg, or leave it empty.`);
  const pace = has("weeklyChangeKg") ? body.weeklyChangeKg : user.weeklyChangeKg;
  if (pace !== null && !isPace(pace)) return fieldError("weeklyChangeKg", "Choose a pace from the list.");
  const sleepTarget = has("sleepTargetMin") ? optionalNumber(body.sleepTargetMin, SLEEP_TARGET_MIN, SLEEP_TARGET_MAX) : user.sleepTargetMin;
  if (sleepTarget === undefined || (sleepTarget !== null && !Number.isInteger(sleepTarget))) {
    return fieldError("sleepTargetMin", "Enter a sleep target from 4 to 12 hours, or leave it empty.");
  }

  const today = typeof body.today === "string" && ISO_DATE_RE.test(body.today) ? body.today : toISODate(new Date());
  const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return NextResponse.json({
    user: await updateBodyGoals(
      user.id,
      {
        calorieGoal: goal,
        stepsTarget: steps,
        heightCm: round1(height),
        weightKg: round1(weight),
        waterTargetMl: water,
        birthYear,
        sex: isSex(sex) ? sex : null,
        activity: isActivity(activity) ? activity : null,
        goalWeightKg: round1(goalWeight),
        weeklyChangeKg: pace as number | null,
        sleepTargetMin: sleepTarget,
      },
      today,
    ),
  });
}
