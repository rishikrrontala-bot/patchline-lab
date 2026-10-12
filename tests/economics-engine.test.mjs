import test from "node:test";
import assert from "node:assert/strict";
import {
  ECONOMICS_DEFAULTS, SCENARIOS, calculateEconomics, serializeEconomics,
} from "../economics-engine.js";

const near = (actual, expected, message = "") => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${message}: expected ${expected}, got ${actual}`);
const assertFiniteTree = (value) => {
  if (typeof value === "number") assert.ok(Number.isFinite(value));
  else if (value && typeof value === "object") Object.values(value).forEach(assertFiniteTree);
};

test("default economics include replacement acquisition and founder labor rather than treating hosting as total cost", () => {
  const input = ECONOMICS_DEFAULTS;
  const result = calculateEconomics();
  const acquisition = input.cac + input.onboardingHours * input.laborRate;
  const revenue = input.teams * input.price;
  const support = input.teams * input.supportHours * input.laborRate;
  const transaction = revenue * input.feeRate;
  const replacement = input.teams * input.churn * acquisition;
  near(result.monthlyRevenue, 495);
  near(result.acquisitionCostPerTeam, 150);
  near(result.supportCost, support);
  near(result.transactionCost, transaction);
  near(result.replacementCost, replacement);
  near(result.monthlyCosts, support + transaction + replacement + input.fixed);
  near(result.monthlySurplus, revenue - result.monthlyCosts);
  near(result.contribution, 99 - 30 - 2.97 - 7.5);
  assert.equal(result.breakEvenTeams, 3);
  near(result.firstMonthSurplus, revenue - support - transaction - input.fixed - input.teams * acquisition);
  assert.ok(result.firstMonthSurplus < 0, "upfront onboarding and acquisition make this first month lose money");
  near(result.pilotCost, 189);
  near(result.pilotMargin, 111);
  near(result.pilotMarginRate, 111 / 300);
  near(result.customerMonthlyTimeValue, 40);
  assert.equal(result.runsBreakEvenForCustomer, 20);
  assert.match(result.scope, /assumptions|unvalidated|planning/i);
  assertFiniteTree(result);
});

test("first month charges actual acquisition once, without double-counting monthly replacement reserve", () => {
  const input = {
    teams: 2, price: 100, supportHours: 1, laborRate: 20, fixed: 10,
    onboardingHours: 3, cac: 40, churn: 0.5, feeRate: 0.1,
  };
  const result = calculateEconomics(input);
  near(result.acquisitionCostPerTeam, 100);
  near(result.replacementCost, 100);
  near(result.firstMonthSurplus, -70);
  near(result.monthlySurplus, 30);
  assert.equal(result.breakEvenTeams, 1);
});

test("zero customers leave fixed overhead as a loss and never fabricate traction", () => {
  const result = calculateEconomics({ teams: 0 });
  assert.equal(result.monthlyRevenue, 0);
  assert.equal(result.supportCost, 0);
  assert.equal(result.transactionCost, 0);
  assert.equal(result.replacementCost, 0);
  assert.equal(result.monthlySurplus, -ECONOMICS_DEFAULTS.fixed);
  assert.equal(result.firstMonthSurplus, -ECONOMICS_DEFAULTS.fixed);
  assertFiniteTree(result);
});

test("zero churn does not assert infinite measured customer lifetime or LTV", () => {
  const result = calculateEconomics({ churn: 0 });
  assert.equal(result.replacementCost, 0);
  assert.equal(result.estimatedLifetimeMonths, null);
  assert.equal(result.illustrativeLTV, null);
  near(result.contribution, result.contributionBeforeReplacement);
  assertFiniteTree(result);
});

test("100-percent churn charges one replacement per team and one-month illustrative lifetime", () => {
  const result = calculateEconomics({ teams: 2, price: 200, churn: 1, cac: 10, onboardingHours: 1, laborRate: 20, supportHours: 1, feeRate: 0 });
  assert.equal(result.replacementCost, 60);
  assert.equal(result.estimatedLifetimeMonths, 1);
  assert.equal(result.illustrativeLTV, 180);
  assert.equal(result.contribution, 150);
  assertFiniteTree(result);
});

test("negative contribution has no achievable team break-even or positive payback story", () => {
  const result = calculateEconomics({ price: 10, supportHours: 2, laborRate: 30, churn: 0.1 });
  assert.ok(result.contribution < 0);
  assert.equal(result.breakEvenTeams, null);
  assert.equal(result.paybackMonths, null);
  assert.ok(result.illustrativeLTV < 0);
  assert.ok(result.monthlySurplus < 0);
  assertFiniteTree(result);
});

test("exact zero contribution is unprofitable even when fixed overhead is zero", () => {
  const result = calculateEconomics({ price: 30, supportHours: 1, laborRate: 30, churn: 0, feeRate: 0, fixed: 0 });
  assert.equal(result.contribution, 0);
  assert.equal(result.breakEvenTeams, null);
  assert.equal(result.paybackMonths, null);
  assert.equal(result.monthlySurplus, 0);
});

test("positive contribution with zero fixed overhead has zero team break-even", () => {
  const result = calculateEconomics({ fixed: 0 });
  assert.ok(result.contribution > 0);
  assert.equal(result.breakEvenTeams, 0);
});

test("pilot economics visibly lose money when delivery labor exceeds revenue", () => {
  const result = calculateEconomics({ pilotPrice: 300, pilotHours: 10, laborRate: 30, feeRate: 0.03 });
  assert.equal(result.pilotCost, 309);
  assert.equal(result.pilotMargin, -9);
  near(result.pilotMarginRate, -0.03);
  assert.ok(result.pilotMargin < 0);
});

test("free pilots retain labor cost while margin percentage remains undefined", () => {
  const result = calculateEconomics({ pilotPrice: 0, pilotHours: 2, laborRate: 30 });
  assert.equal(result.pilotCost, 60);
  assert.equal(result.pilotMargin, -60);
  assert.equal(result.pilotMarginRate, null);
  assertFiniteTree(result);
});

test("zero research savings or hourly value cannot justify a customer ROI break-even", () => {
  for (const input of [{ minutesSaved: 0 }, { researchHourlyRate: 0 }]) {
    const result = calculateEconomics(input);
    assert.equal(result.customerMonthlyTimeValue, 0);
    assert.equal(result.runsBreakEvenForCustomer, null);
    assertFiniteTree(result);
  }
  const zeroRuns = calculateEconomics({ runsPerMonth: 0 });
  assert.equal(zeroRuns.customerMonthlyTimeValue, 0);
  assert.ok(zeroRuns.runsBreakEvenForCustomer > 0, "minimum runs can remain a hypothetical threshold even with no current runs");
});

test("customer savings use measured minutes per run rather than comparing monthly price with one run", () => {
  const result = calculateEconomics({ price: 100, minutesSaved: 15, researchHourlyRate: 40, runsPerMonth: 12 });
  assert.equal(result.customerMonthlyTimeValue, 120);
  assert.equal(result.runsBreakEvenForCustomer, 10);
  const free = calculateEconomics({ price: 0, minutesSaved: 15, researchHourlyRate: 40 });
  assert.equal(free.runsBreakEvenForCustomer, 0);
});

test("fees at 100 percent eliminate revenue before support and acquisition", () => {
  const result = calculateEconomics({ feeRate: 1 });
  assert.equal(result.transactionCost, result.monthlyRevenue);
  assert.ok(result.monthlySurplus < 0);
  assert.equal(result.breakEvenTeams, null);
  assertFiniteTree(result);
});

test("validation rejects numeric strings, blanks, booleans, non-finite values and negative assumptions", () => {
  for (const [key, value] of [
    ["teams", "5"], ["price", ""], ["price", "99"], ["price", false], ["price", null],
    ["price", NaN], ["price", Infinity], ["price", -1], ["teams", -1],
    ["price", undefined],
    ["teams", 0.5], ["teams", 1000001], ["churn", -0.01], ["churn", 1.01],
    ["feeRate", -0.01], ["feeRate", 1.01], ["pilotHours", 1000001],
  ]) assert.throws(() => calculateEconomics({ [key]: value }), `${key}=${String(value)}`);
  assert.throws(() => calculateEconomics({ unknown: 1 }));
  assert.throws(() => calculateEconomics([]));
  assert.throws(() => calculateEconomics(null));
  assert.throws(() => calculateEconomics(JSON.parse('{"__proto__":{"polluted":true}}')));
  assert.equal({}.polluted, undefined);
});

test("maximum accepted assumptions still return finite arithmetic", () => {
  const input = Object.fromEntries(Object.keys(ECONOMICS_DEFAULTS).map((key) => [key, 1000000]));
  input.churn = 1;
  input.feeRate = 1;
  const result = calculateEconomics(input);
  assertFiniteTree(result);
  assert.equal(result.breakEvenTeams, null);
});

test("near-zero contribution and churn cannot create infinite break-even, payback or lifetime exports", () => {
  for (const input of [
    { price: Number.MIN_VALUE, supportHours: 0, laborRate: 0, cac: 1, onboardingHours: 0, churn: 0, feeRate: 0, fixed: 1 },
    { churn: Number.MIN_VALUE },
    { minutesSaved: Number.MIN_VALUE },
  ]) {
    let result;
    try { result = calculateEconomics(input); }
    catch (error) { assert.ok(error instanceof Error); continue; }
    assertFiniteTree(result);
  }
});

test("defaults merge only provided numeric fields and calculation snapshots cannot be edited later", () => {
  const input = { teams: 7 };
  const result = calculateEconomics(input);
  assert.equal(result.inputs.teams, 7);
  assert.equal(result.inputs.price, ECONOMICS_DEFAULTS.price);
  input.teams = 500;
  assert.equal(result.inputs.teams, 7);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.inputs));
  assert.throws(() => { result.inputs.teams = 500; }, TypeError);
});

test("planning scenarios remain explicitly hypothetical and downside delivery cost is not hidden", () => {
  for (const key of ["downside", "base", "upside"]) {
    const scenario = SCENARIOS[key];
    assert.ok(scenario && typeof scenario === "object");
    assert.match(scenario.label, /planning|illustrative|hypothetical|assumption/i);
    const assumptions = scenario.inputs ?? scenario.overrides ?? Object.fromEntries(
      Object.entries(scenario).filter(([name]) => Object.hasOwn(ECONOMICS_DEFAULTS, name)));
    const result = calculateEconomics(assumptions);
    assertFiniteTree(result);
    if (key === "downside") {
      assert.equal(result.inputs.pilotHours, 10);
      assert.ok(result.pilotMargin < 0);
    }
  }
});

test("economics export recomputes actual selected assumptions and preserves losses rather than importing forged totals", () => {
  const input = { teams: 0, pilotHours: 10 };
  const serialized = serializeEconomics(input);
  assert.equal(typeof serialized, "string");
  const report = JSON.parse(serialized);
  const computed = report.result ?? report.economics ?? report;
  assert.equal(computed.inputs.teams, 0);
  assert.equal(computed.monthlyRevenue, 0);
  assert.equal(computed.pilotMargin, -9);
  assert.match(report.scope ?? computed.scope, /unvalidated|assumption|planning/i);
  assertFiniteTree(report);
  assert.doesNotMatch(serialized, /paying customers|validated demand|guaranteed|infinite/i);
});
