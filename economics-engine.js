/* economics-engine.js
 * Planning-only research economics calculator.
 * Pure browser ES module. No dependencies, no network, no DOM, no storage.
 * Code assistant: GLM 5.2. App has no runtime AI.
 */
'use strict';

export const ECONOMICS_DEFAULTS = Object.freeze({
  teams: 5,
  price: 99,
  supportHours: 1,
  laborRate: 30,
  fixed: 120,
  onboardingHours: 3,
  cac: 60,
  churn: 0.05,
  feeRate: 0.03,
  pilotPrice: 300,
  pilotHours: 6,
  runsPerMonth: 8,
  minutesSaved: 10,
  researchHourlyRate: 30
});

export const SCENARIOS = Object.freeze({
  downside: Object.freeze({
    label: 'downside (planning-only, not a forecast)',
    overrides: Object.freeze({
      teams: 3,
      price: 79,
      supportHours: 2,
      onboardingHours: 5,
      cac: 120,
      churn: 0.12,
      pilotHours: 10
    })
  }),
  base: Object.freeze({
    label: 'base (planning-only, not a forecast)',
    overrides: Object.freeze({})
  }),
  upside: Object.freeze({
    label: 'upside (planning-only, not a forecast)',
    overrides: Object.freeze({
      teams: 10,
      price: 129,
      supportHours: 0.5,
      onboardingHours: 2,
      cac: 30,
      churn: 0.025,
      pilotHours: 4
    })
  })
});

const ECON_KEYS = [
  'teams', 'price', 'supportHours', 'laborRate', 'fixed', 'onboardingHours',
  'cac', 'churn', 'feeRate', 'pilotPrice', 'pilotHours', 'runsPerMonth',
  'minutesSaved', 'researchHourlyRate'
];

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function isInteger(v) {
  return typeof v === 'number' && Number.isInteger(v);
}
function deepFreeze(o) {
  if (o === null || typeof o !== 'object') return o;
  Object.freeze(o);
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) deepFreeze(v);
  }
  return o;
}
function plainCopy(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(plainCopy);
  const out = {};
  for (const k of Object.keys(o)) out[k] = plainCopy(o[k]);
  return out;
}
function hasExtraKeys(obj, allowed) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) return true;
  }
  return false;
}

function validateInputs(input) {
  if (input === undefined) {
    return plainCopy(ECONOMICS_DEFAULTS);
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Input must be object');
  }
  if (hasExtraKeys(input, ECON_KEYS)) throw new Error('Unknown economics key');
  const out = {};
  for (const k of ECON_KEYS) {
    const v = Object.hasOwn(input, k) ? input[k] : ECONOMICS_DEFAULTS[k];
    if (typeof v === 'string') throw new Error('String not allowed for ' + k);
    if (!isFiniteNumber(v)) throw new Error('Invalid value for ' + k);
    if (v < 0) throw new Error('Negative value for ' + k);
    if (v > 1e6) throw new Error('Value exceeds limit for ' + k);
    out[k] = v;
  }
  if (!isInteger(out.teams) || out.teams < 0 || out.teams > 1000000) {
    throw new Error('teams must be integer 0..1000000');
  }
  if (out.churn < 0 || out.churn > 1) throw new Error('churn must be 0..1');
  if (out.feeRate < 0 || out.feeRate > 1) throw new Error('feeRate must be 0..1');
  return out;
}

export function calculateEconomics(input = ECONOMICS_DEFAULTS) {
  const inp = validateInputs(input);
  const teams = inp.teams;
  const price = inp.price;
  const supportHours = inp.supportHours;
  const laborRate = inp.laborRate;
  const fixed = inp.fixed;
  const onboardingHours = inp.onboardingHours;
  const cac = inp.cac;
  const churn = inp.churn;
  const feeRate = inp.feeRate;
  const pilotPrice = inp.pilotPrice;
  const pilotHours = inp.pilotHours;
  const runsPerMonth = inp.runsPerMonth;
  const minutesSaved = inp.minutesSaved;
  const researchHourlyRate = inp.researchHourlyRate;

  const monthlyRevenue = teams * price;
  const supportCost = teams * supportHours * laborRate;
  const transactionCost = monthlyRevenue * feeRate;
  const acquisitionCostPerTeam = cac + onboardingHours * laborRate;
  const replacementCost = teams * churn * acquisitionCostPerTeam;
  const monthlyCosts = supportCost + transactionCost + fixed + replacementCost;
  const monthlySurplus = monthlyRevenue - monthlyCosts;
  const contributionBeforeReplacement = price - supportHours * laborRate - price * feeRate;
  const contribution = contributionBeforeReplacement - churn * acquisitionCostPerTeam;
  let breakEvenTeams = null;
  if (contribution > 0) {
    breakEvenTeams = Math.ceil(fixed / contribution);
  }
  const firstMonthSurplus = monthlyRevenue - supportCost - transactionCost - fixed - teams * acquisitionCostPerTeam;
  let paybackMonths = null;
  if (contribution > 0) {
    paybackMonths = acquisitionCostPerTeam / contributionBeforeReplacement;
  }
  let estimatedLifetimeMonths = null;
  if (churn > 0) {
    estimatedLifetimeMonths = 1 / churn;
  }
  let illustrativeLTV = null;
  if (churn > 0) {
    illustrativeLTV = contributionBeforeReplacement / churn;
  }
  const pilotCost = pilotHours * laborRate + pilotPrice * feeRate;
  const pilotMargin = pilotPrice - pilotCost;
  let pilotMarginRate = null;
  if (pilotPrice > 0) {
    pilotMarginRate = pilotMargin / pilotPrice;
  }
  const customerMonthlyTimeValue = runsPerMonth * minutesSaved * researchHourlyRate / 60;
  let runsBreakEvenForCustomer = null;
  const savingsPerRun = minutesSaved * researchHourlyRate / 60;
  if (savingsPerRun > 0) {
    runsBreakEvenForCustomer = Math.ceil(price * 60 / (minutesSaved * researchHourlyRate));
  }

  const result = {
    inputs: deepFreeze(plainCopy(inp)),
    monthlyRevenue,
    supportCost,
    transactionCost,
    replacementCost,
    monthlyCosts,
    monthlySurplus,
    contribution,
    breakEvenTeams,
    firstMonthSurplus,
    acquisitionCostPerTeam,
    contributionBeforeReplacement,
    paybackMonths,
    estimatedLifetimeMonths,
    illustrativeLTV,
    pilotCost,
    pilotMargin,
    pilotMarginRate,
    customerMonthlyTimeValue,
    runsBreakEvenForCustomer,
    scope: 'Planning-only illustration. All income and savings assumptions are unvalidated. Not financial advice.'
  };
  // A mathematically unbounded ratio is unavailable, never Infinity in an export.
  for (const key of ['breakEvenTeams', 'paybackMonths', 'estimatedLifetimeMonths', 'illustrativeLTV', 'pilotMarginRate', 'runsBreakEvenForCustomer']) {
    if (result[key] !== null && !Number.isFinite(result[key])) result[key] = null;
  }
  for (const value of Object.values(result)) if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Calculation exceeds finite numeric range');
  return deepFreeze(plainCopy(result));
}

export function serializeEconomics(input) {
  const result = calculateEconomics(input);
  const envelope = {
    schema: 'patchline-economics-v1',
    version: '1.0.0',
    result,
    assumptions: 'All income and savings assumptions are unvalidated planning estimates.',
    scope: 'Planning-only illustration. Not financial advice.'
  };
  return JSON.stringify(envelope);
}
