import assert from "node:assert/strict";
import test from "node:test";
import { calculateMathFitScale, normalizeInlineFractionStyle } from "../src/shared/ui/mathFit";

test("keeps display math at its natural size when it fits", () => {
  assert.equal(calculateMathFitScale(640, 520), 1);
  assert.equal(calculateMathFitScale(640, 640), 1);
});

test("scales overflowing display math to the available width", () => {
  assert.equal(calculateMathFitScale(480, 640), 0.75);
});

test("ignores unavailable layout measurements", () => {
  assert.equal(calculateMathFitScale(0, 640), 1);
  assert.equal(calculateMathFitScale(480, Number.NaN), 1);
});

test("uses display-sized fractions in inline formulas", () => {
  assert.equal(
    normalizeInlineFractionStyle("AC = \\frac {1 + 57}{2} = 29", true),
    "AC = \\dfrac {1 + 57}{2} = 29",
  );
  assert.equal(normalizeInlineFractionStyle("\\frac{1}{2}", false), "\\frac{1}{2}");
  assert.equal(normalizeInlineFractionStyle("\\dfrac{1}{2} + \\tfrac{1}{3}", true), "\\dfrac{1}{2} + \\tfrac{1}{3}");
});
