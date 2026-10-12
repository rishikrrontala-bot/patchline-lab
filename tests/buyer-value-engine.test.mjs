import test from "node:test";
import assert from "node:assert/strict";
import { calculateBuyerValue, serializeBuyerValue } from "../buyer-value-engine.js";

const assumptions = (changes = {}) => ({
  runsPerMonth: 8, baselineMinutes: 45, toolMinutes: 35, hourlyRate: 30,
  monthlyPrice: 99, pilotPrice: 300, setupMinutes: 60, setupCost: 0,
  sameTask: true, evidenceType: "estimate", note: "", ...changes,
});
const numericKeys = ["runsPerMonth", "baselineMinutes", "toolMinutes", "hourlyRate",
  "monthlyPrice", "pilotPrice", "setupMinutes", "setupCost"];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < Math.max(1, Math.abs(expected)) * 1e-12,
  `Expected ${expected}, received ${actual}`);
const finiteTree = (value) => {
  if (typeof value === "number") assert.ok(Number.isFinite(value), `Non-finite number ${value}`);
  else if (value && typeof value === "object") Object.values(value).forEach(finiteTree);
};

test("eight monthly runs do not justify the proposed price and include pilot plus setup labor", () => {
  const result = calculateBuyerValue(assumptions());
  assert.equal(result.schema, "patchline-buyer-value-v1");
  assert.equal(result.minutesSavedPerRun, 10);
  near(result.timeSavedHoursPerMonth, 4 / 3);
  assert.equal(result.timeValuePerRun, 5);
  assert.equal(result.monthlyTimeValue, 40);
  assert.equal(result.netMonthlyValue, -59);
  assert.equal(result.upfrontCost, 330);
  assert.equal(result.firstMonthNetValue, -389);
  assert.equal(result.breakEvenRuns, 20);
  assert.equal(result.paybackMonths, null);
  assert.equal(result.decision, "nonpositive-estimate");
  assert.match(result.scope, /Only user-supplied/i);
  assert.match(result.scope, /SAME complete correct task/i);
  finiteTree(result);
});

test("a one-dollar monthly surplus takes 330 months to repay setup rather than claiming rapid payback", () => {
  const result = calculateBuyerValue(assumptions({ runsPerMonth: 20 }));
  assert.equal(result.monthlyTimeValue, 100);
  assert.equal(result.netMonthlyValue, 1);
  assert.equal(result.firstMonthNetValue, -329);
  assert.equal(result.paybackMonths, 330);
  assert.equal(result.decision, "positive-estimate");
  assert.match(result.scope, /no .*financial promise/i);
});

test("fractional per-run time value retains precision before multiplying monthly runs", () => {
  const result = calculateBuyerValue(assumptions({
    runsPerMonth: 4, baselineMinutes: 30, toolMinutes: 20, hourlyRate: 25,
  }));
  near(result.timeValuePerRun, 25 / 6);
  near(result.monthlyTimeValue, 50 / 3);
  assert.notEqual(result.monthlyTimeValue, 16.75);
  assert.equal(result.breakEvenRuns, 24);
});

test("slower tool completion preserves signed losses rather than clamping time saved to zero", () => {
  const result = calculateBuyerValue(assumptions({ baselineMinutes: 35, toolMinutes: 45 }));
  assert.equal(result.minutesSavedPerRun, -10);
  near(result.timeSavedHoursPerMonth, -4 / 3);
  assert.equal(result.timeValuePerRun, -5);
  assert.equal(result.monthlyTimeValue, -40);
  assert.equal(result.netMonthlyValue, -139);
  assert.equal(result.firstMonthNetValue, -469);
  assert.equal(result.breakEvenRuns, null);
  assert.equal(result.paybackMonths, null);
  assert.equal(result.decision, "nonpositive-estimate");
});

test("equal task times and zero hourly value have no achievable savings-based break-even", () => {
  for (const changes of [{ toolMinutes: 45 }, { hourlyRate: 0 }]) {
    const result = calculateBuyerValue(assumptions(changes));
    assert.equal(result.monthlyTimeValue, 0);
    assert.equal(result.netMonthlyValue, -99);
    assert.equal(result.breakEvenRuns, null);
    assert.equal(result.paybackMonths, null);
    finiteTree(result);
  }
});

test("no current runs produce no customer value while a hypothetical minimum-run threshold remains visible", () => {
  const result = calculateBuyerValue(assumptions({ runsPerMonth: 0 }));
  assert.equal(result.timeSavedHoursPerMonth, 0);
  assert.equal(result.monthlyTimeValue, 0);
  assert.equal(result.netMonthlyValue, -99);
  assert.equal(result.breakEvenRuns, 20);
  assert.equal(result.paybackMonths, null);
});

test("exact monthly break-even has no positive decision or repayment claim", () => {
  const result = calculateBuyerValue(assumptions({ runsPerMonth: 20, monthlyPrice: 100 }));
  assert.equal(result.netMonthlyValue, 0);
  assert.equal(result.breakEvenRuns, 20);
  assert.equal(result.paybackMonths, null);
  assert.equal(result.firstMonthNetValue, -330);
  assert.equal(result.decision, "nonpositive-estimate");
});

test("floating-point conversion does not add a whole run to mathematically exact break-even", () => {
  const result = calculateBuyerValue(assumptions({
    runsPerMonth: 60, baselineMinutes: 20, toolMinutes: 10, hourlyRate: 10,
    monthlyPrice: 100, pilotPrice: 0, setupMinutes: 0,
  }));
  near(result.timeValuePerRun, 5 / 3);
  assert.equal(result.monthlyTimeValue, 100);
  assert.equal(result.netMonthlyValue, 0);
  assert.equal(result.breakEvenRuns, 60);
  assert.equal(result.paybackMonths, null);
  assert.equal(result.decision, "nonpositive-estimate");
  const below = calculateBuyerValue(assumptions({
    runsPerMonth: 59, baselineMinutes: 20, toolMinutes: 10, hourlyRate: 10,
    monthlyPrice: 100, pilotPrice: 0, setupMinutes: 0,
  }));
  assert.ok(below.netMonthlyValue < 0);
  assert.equal(below.breakEvenRuns, 60);
});

test("free subscription and free setup preserve zero thresholds without division by zero", () => {
  const result = calculateBuyerValue(assumptions({ monthlyPrice: 0, pilotPrice: 0, setupMinutes: 0 }));
  assert.equal(result.netMonthlyValue, 40);
  assert.equal(result.upfrontCost, 0);
  assert.equal(result.firstMonthNetValue, 40);
  assert.equal(result.breakEvenRuns, 0);
  assert.equal(result.paybackMonths, 0);
  finiteTree(result);
  const zero = calculateBuyerValue(assumptions(Object.fromEntries(numericKeys.map((key) => [key, 0]))));
  assert.equal(zero.netMonthlyValue, 0);
  assert.equal(zero.breakEvenRuns, null);
  assert.equal(zero.paybackMonths, null);
  assert.equal(zero.decision, "nonpositive-estimate");
});

test("fixed setup charge, setup labor, and pilot price each contribute once to upfront cost", () => {
  const result = calculateBuyerValue(assumptions({
    runsPerMonth: 100, pilotPrice: 75, setupMinutes: 90, setupCost: 20, hourlyRate: 40,
  }));
  assert.equal(result.upfrontCost, 155);
  near(result.netMonthlyValue, 1703 / 3);
  near(result.firstMonthNetValue, 1238 / 3);
  near(result.paybackMonths, 465 / 1703);
});

test("self-reported measured timings remain explicitly unverified and require a substantive note", () => {
  const result = calculateBuyerValue(assumptions({
    evidenceType: "user-measured", note: "Same 3,000-row recording; checks and report included.",
    runsPerMonth: 100,
  }));
  assert.match(result.scope, /self-reported unverified; not verified validation/i);
  assert.equal(result.inputs.evidenceType, "user-measured");
  assert.match(result.decision, /estimate$/);
  for (const note of ["", " ", "\n\t"]) {
    assert.throws(() => calculateBuyerValue(assumptions({ evidenceType: "user-measured", note })));
  }
});

test("comparison must cover the same complete task and evidence labels cannot imply independent validation", () => {
  for (const sameTask of [false, "true", 1, null, undefined]) {
    assert.throws(() => calculateBuyerValue(assumptions({ sameTask })));
  }
  for (const evidenceType of ["verified", "measured", "clinical", "", null, 1, undefined]) {
    assert.throws(() => calculateBuyerValue(assumptions({ evidenceType })));
  }
});

test("required numeric inputs reject coercion, non-finite values, negatives, and excessive bounds", () => {
  for (const key of numericKeys) {
    for (const value of ["30", "", false, null, undefined, NaN, Infinity, -Infinity, -1, 1000001]) {
      assert.throws(() => calculateBuyerValue(assumptions({ [key]: value })), `${key}: ${String(value)}`);
    }
  }
  assert.throws(() => calculateBuyerValue(assumptions({ runsPerMonth: 0.5 })));
  assert.throws(() => calculateBuyerValue(assumptions({ runsPerMonth: Number.MIN_VALUE })));
});

test("every contract key must be an own property instead of inherited or silently defaulted", () => {
  for (const key of Object.keys(assumptions())) {
    const missing = assumptions();
    delete missing[key];
    assert.throws(() => calculateBuyerValue(missing), `Missing ${key}`);
    assert.throws(() => calculateBuyerValue(Object.create(assumptions())), `Inherited ${key}`);
  }
  for (const invalid of [null, undefined, [], 1, "input", new Date(), new Map()]) {
    assert.throws(() => calculateBuyerValue(invalid));
  }
  const nullPrototype = Object.assign(Object.create(null), assumptions());
  assert.equal(calculateBuyerValue(nullPrototype).netMonthlyValue, -59);
});

test("enumerable, hidden, symbol, and prototype-pollution extra keys all fail closed", () => {
  assert.throws(() => calculateBuyerValue(assumptions({ errorReductionValue: 1000 })));
  const hidden = assumptions();
  Object.defineProperty(hidden, "hidden", { value: 1 });
  assert.throws(() => calculateBuyerValue(hidden));
  const symbol = assumptions();
  symbol[Symbol("unknown")] = 1;
  assert.throws(() => calculateBuyerValue(symbol));
  const polluted = JSON.parse(JSON.stringify(assumptions()).slice(0, -1) + ',"__proto__":{"polluted":true}}');
  assert.throws(() => calculateBuyerValue(polluted));
  assert.equal({}.polluted, undefined);
});

test("accessors cannot change validated assumptions during snapshot copying or execute untrusted getters", () => {
  for (const key of Object.keys(assumptions())) {
    const input = assumptions();
    const valid = input[key];
    let calls = 0;
    Object.defineProperty(input, key, {
      configurable: true, enumerable: true,
      get() { calls++; return valid; },
    });
    assert.throws(() => calculateBuyerValue(input), `Getter-backed ${key}`);
    assert.equal(calls, 0, `Untrusted ${key} getter executed before rejection`);
  }
  const switched = assumptions();
  let calls = 0;
  Object.defineProperty(switched, "sameTask", {
    enumerable: true, get() { return ++calls < 3; },
  });
  assert.throws(() => calculateBuyerValue(switched));
  assert.equal(calls, 0);
});

test("note accepts the declared limit and rejects non-strings or overlong text", () => {
  assert.equal(calculateBuyerValue(assumptions({ note: "x".repeat(512) })).inputs.note.length, 512);
  for (const note of ["x".repeat(513), null, 123, {}, undefined]) {
    assert.throws(() => calculateBuyerValue(assumptions({ note })));
  }
});

test("maximum accepted finite assumptions do not create non-finite arithmetic", () => {
  const changes = Object.fromEntries(numericKeys.map((key) => [key, 1000000]));
  changes.toolMinutes = 0;
  const result = calculateBuyerValue(assumptions(changes));
  assert.equal(result.minutesSavedPerRun, 1000000);
  near(result.timeValuePerRun, 1000000000000 / 60);
  finiteTree(result);
});

test("subnormal ratios export null when break-even or payback would overflow", () => {
  const breakEven = calculateBuyerValue(assumptions({
    baselineMinutes: 60 * Number.MIN_VALUE, toolMinutes: 0, hourlyRate: 1,
    monthlyPrice: 1, runsPerMonth: 1,
  }));
  assert.equal(breakEven.timeValuePerRun, Number.MIN_VALUE);
  assert.equal(breakEven.breakEvenRuns, null);
  const payback = calculateBuyerValue(assumptions({
    baselineMinutes: 60 * Number.MIN_VALUE, toolMinutes: 0, hourlyRate: 1,
    monthlyPrice: 0, runsPerMonth: 1, pilotPrice: 1, setupMinutes: 0,
  }));
  assert.equal(payback.netMonthlyValue, Number.MIN_VALUE);
  assert.equal(payback.paybackMonths, null);
  for (const result of [breakEven, payback]) {
    finiteTree(result);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    assert.doesNotMatch(JSON.stringify(result), /Infinity|NaN/);
  }
});

test("calculation snapshots are independent of input mutations and recursively frozen", () => {
  const input = assumptions();
  const before = structuredClone(input);
  const result = calculateBuyerValue(input);
  assert.deepEqual(input, before);
  assert.notEqual(result.inputs, input);
  input.runsPerMonth = 1000;
  input.note = "Changed later";
  assert.equal(result.inputs.runsPerMonth, 8);
  assert.equal(result.inputs.note, "");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.inputs));
  assert.throws(() => { result.inputs.runsPerMonth = 1000; }, TypeError);
  assert.throws(() => { result.netMonthlyValue = 1000000; }, TypeError);
});

test("export recomputes verified formulas from actual assumptions and includes no invented benefits", () => {
  const input = assumptions({ toolMinutes: 55, setupCost: 25, note: "Hypothetical complete-task comparison" });
  const exported = JSON.parse(serializeBuyerValue(input));
  assert.deepEqual(exported, calculateBuyerValue(input));
  assert.equal(exported.minutesSavedPerRun, -10);
  assert.equal(exported.netMonthlyValue, -139);
  assert.equal(exported.upfrontCost, 355);
  assert.equal(exported.firstMonthNetValue, -494);
  assert.equal(exported.paybackMonths, null);
  assert.ok(!("errorReductionValue" in exported));
  assert.ok(!("collaborationValue" in exported));
  assert.ok(!("clinicalBenefit" in exported));
  assert.match(exported.scope, /no error reduction, clinical benefit, collaboration doublecount/i);
  assert.throws(() => serializeBuyerValue(assumptions({ inventedSavings: 9999 })));
});
