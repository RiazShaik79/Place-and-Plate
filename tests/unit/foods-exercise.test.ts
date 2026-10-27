import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { findFood, FOODS, foodKey, searchFoods } from "@/lib/foods";
import { caloriesBurned, findExercise, formatMinutes, searchExercises } from "@/lib/exercises";

describe("foods", () => {
  test("foodKey: catalogue id as is; AI items by lower-cased name and portion", () => {
    assert.equal(foodKey("oatmeal", "Oatmeal (cooked)", "1 cup (234 g)"), "oatmeal");
    assert.equal(foodKey("ai:text", "Chicken Wrap", "1 wrap"), "ai:chicken wrap|1 wrap");
    assert.equal(foodKey("ai:photo", "Chicken Wrap", "1 wrap"), foodKey("ai:text", "chicken wrap", "1 wrap"));
    assert.notEqual(foodKey("ai:text", "Chicken wrap", "1 wrap"), foodKey("ai:text", "Chicken wrap", "2 wraps"));
  });

  test("searchFoods ignores case; an empty query returns the whole catalogue", () => {
    assert.equal(searchFoods("").length, FOODS.length);
    assert.equal(searchFoods("   ").length, FOODS.length);
    assert.ok(searchFoods("OAT").some((f) => f.id === "oatmeal"));
    assert.deepEqual(searchFoods("no such food"), []);
  });

  test("findFood and catalogue ids are unique", () => {
    assert.equal(findFood("banana")?.name, "Banana");
    assert.equal(findFood("nope"), undefined);
    assert.equal(new Set(FOODS.map((f) => f.id)).size, FOODS.length);
  });
});

describe("exercises", () => {
  test("caloriesBurned = MET x kg x hours, rounded", () => {
    assert.equal(caloriesBurned(4.3, 68, 30), 146);
    assert.equal(caloriesBurned(1, 70, 60), 70);
  });

  test("formatMinutes", () => {
    assert.equal(formatMinutes(45), "45 min");
    assert.equal(formatMinutes(60), "1 h");
    assert.equal(formatMinutes(95), "1 h 35 min");
  });

  test("exercise search and lookup", () => {
    assert.ok(findExercise("walk-outdoor-brisk"));
    assert.ok(searchExercises("RUN").length > 0);
  });
});
