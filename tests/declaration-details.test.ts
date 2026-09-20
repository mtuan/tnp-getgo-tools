import assert from "node:assert/strict";
import test from "node:test";
import { declarationDetailsAt } from "../src/features/quiz-editor/domain/declaration-details";

test("declaration details collect overload signatures and their documentation", () => {
  const source = `export declare class MathsHelper {
  /** Create from parameters. */
  sequence(params: SequenceParams): NumberSequence;
  /** Create a named sequence. */
  sequence(name: KnownSequenceName): NumberSequence;
}`;
  const details = declarationDetailsAt("file:///MathsHelper.d.ts", source, 5);
  assert.equal(details.symbol, "sequence");
  assert.equal(details.fileName, "MathsHelper.d.ts");
  assert.deepEqual(details.sections, [
    {
      documentation: "Create from parameters.",
      signature: "sequence(params: SequenceParams): NumberSequence;",
    },
    {
      documentation: "Create a named sequence.",
      signature: "sequence(name: KnownSequenceName): NumberSequence;",
    },
  ]);
});
