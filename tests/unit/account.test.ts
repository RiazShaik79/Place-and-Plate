import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bmi, firstName, HOME_PATH, initials, normalizeEmail, optionalNumber, safeNextPath, validateEmail, validateName, validateNewPassword, validateWeight } from "@/lib/account";

describe("account", () => {
  test("safeNextPath only allows same-site paths", () => {
    assert.equal(safeNextPath("/exercise?date=2026-10-17"), "/exercise?date=2026-10-17");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "", null, undefined]) {
      assert.equal(safeNextPath(bad), HOME_PATH, String(bad));
    }
    assert.equal(HOME_PATH, "/dashboard");
  });

  test("optionalNumber: empty → null, out of range or not a number → undefined", () => {
    assert.equal(optionalNumber("", 1, 10), null);
    assert.equal(optionalNumber(null, 1, 10), null);
    assert.equal(optionalNumber(" 5 ", 1, 10), 5);
    assert.equal(optionalNumber(11, 1, 10), undefined);
    assert.equal(optionalNumber("lots", 1, 10), undefined);
  });

  test("field validators", () => {
    assert.equal(validateName("  "), "Enter your name.");
    assert.equal(validateName("Sam"), null);
    assert.equal(validateEmail("sam@example.com"), null);
    assert.ok(validateEmail("sam@"));
    assert.ok(validateNewPassword("short"));
    assert.equal(validateNewPassword("a good password"), null);
    assert.equal(validateWeight(70), null);
    assert.ok(validateWeight(5));
    assert.equal(normalizeEmail("  Sam@Example.COM "), "sam@example.com");
  });

  test("bmi value and WHO band", () => {
    assert.deepEqual(bmi(170, 68), { value: 23.5, band: "healthy weight" });
    assert.equal(bmi(170, 50).band, "underweight");
    assert.equal(bmi(170, 80).band, "overweight");
    assert.equal(bmi(170, 95).band, "obese");
  });

  test("initials and first name", () => {
    assert.equal(initials("Sam Rivera"), "SR");
    assert.equal(initials("cher"), "C");
    assert.equal(initials("  "), "?");
    assert.equal(firstName("Sam Rivera"), "Sam");
  });
});
