/*
 * Patchline Buyer Value Engine v1.0.0
 * Honest buyer cost/time worksheet. Not ROI claim or financial advice.
 * Dependency-free browser ES module. Pure functions only.
 */

const SCHEMA = 'patchline-buyer-value-v1';
const VERSION = '1.0.0';
const MAX_VAL = 1e6;
const MAX_NOTE = 512;

const REQUIRED_KEYS = [
  'runsPerMonth', 'baselineMinutes', 'toolMinutes', 'hourlyRate',
  'monthlyPrice', 'pilotPrice', 'setupMinutes', 'setupCost',
  'sameTask', 'evidenceType', 'note'
];

const ALLOWED_KEYS = new Set(REQUIRED_KEYS);
const VALID_EVIDENCE = new Set(['estimate', 'user-measured']);

function isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  if (Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateNumber(v, name) {
  if (typeof v === 'string' || typeof v === 'boolean') {
    throw new Error(name + ' must be a number');
  }
  if (!isFiniteNumber(v)) throw new Error(name + ' must be finite');
  if (v < 0) throw new Error(name + ' must be >= 0');
  if (v > MAX_VAL) throw new Error(name + ' must be <= 1e6');
}

function validateInput(input) {
  if (!isPlainObject(input)) throw new Error('input must be a plain object');
  for (const k of Reflect.ownKeys(input)) {
    if (!ALLOWED_KEYS.has(k)) throw new Error('Extra input key is unsupported');
    const descriptor=Object.getOwnPropertyDescriptor(input,k);
    if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error('Accessor inputs are unsupported');
  }
  const normalized={};
  for (const k of REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input,k)) throw new Error('missing key: ' + k);
    normalized[k]=Object.getOwnPropertyDescriptor(input,k).value;
  }
  input=normalized;
  const r = input.runsPerMonth;
  if (typeof r === 'string' || typeof r === 'boolean') {
    throw new Error('runsPerMonth must be a number');
  }
  if (!isFiniteNumber(r)) throw new Error('runsPerMonth must be finite');
  if (!Number.isInteger(r)) throw new Error('runsPerMonth must be an integer');
  if (r < 0 || r > MAX_VAL) throw new Error('runsPerMonth out of range');
  validateNumber(input.baselineMinutes, 'baselineMinutes');
  validateNumber(input.toolMinutes, 'toolMinutes');
  validateNumber(input.hourlyRate, 'hourlyRate');
  validateNumber(input.monthlyPrice, 'monthlyPrice');
  validateNumber(input.pilotPrice, 'pilotPrice');
  validateNumber(input.setupMinutes, 'setupMinutes');
  validateNumber(input.setupCost, 'setupCost');
  if (typeof input.sameTask !== 'boolean') throw new Error('sameTask must be boolean');
  if (input.sameTask !== true) throw new Error('sameTask must be true');
  if (!VALID_EVIDENCE.has(input.evidenceType)) throw new Error('invalid evidenceType');
  if (typeof input.note !== 'string') throw new Error('note must be a string');
  if (input.note.length > MAX_NOTE) throw new Error('note too long');
  if (input.evidenceType === 'user-measured' && input.note.trim().length === 0) {
    throw new Error('user-measured requires non-whitespace note');
  }
  return normalized;
}

function deepFreeze(o) {
  if (o === null || typeof o !== 'object') return o;
  Object.freeze(o);
  for (const v of Object.values(o)) deepFreeze(v);
  return o;
}

function safeRatio(n, d) {
  if (!isFiniteNumber(n) || !isFiniteNumber(d) || d === 0) return null;
  const r = n / d;
  return isFiniteNumber(r) ? r : null;
}

function buildScope(evidenceType) {
  const base = 'Only user-supplied task time and cost assumptions. Includes no error reduction, clinical benefit, collaboration doublecount or financial promise; setup/pilot upfront separate from monthly; compare SAME complete correct task and include checks/report/handoff time.';
  if (evidenceType === 'user-measured') {
    return 'User-measured inputs are self-reported unverified; not verified validation. ' + base;
  }
  return base;
}

function calculateBuyerValue(input) {
  const i = validateInput(input);
  const saved = i.baselineMinutes - i.toolMinutes;
  const hoursPerMonth = i.runsPerMonth * saved / 60;
  const perRun = saved * i.hourlyRate / 60;
  const monthly = i.runsPerMonth * saved * i.hourlyRate / 60;
  const net = monthly - i.monthlyPrice;
  const upfront = i.pilotPrice + i.setupCost + i.setupMinutes * i.hourlyRate / 60;
  const firstMonth = net - upfront;
  if (!isFiniteNumber(saved) || !isFiniteNumber(hoursPerMonth) ||
      !isFiniteNumber(perRun) || !isFiniteNumber(monthly) ||
      !isFiniteNumber(net) || !isFiniteNumber(upfront) ||
      !isFiniteNumber(firstMonth)) {
    throw new Error('non-finite computation');
  }
  const runsRatio=perRun>0?safeRatio(i.monthlyPrice*60,saved*i.hourlyRate):null;
  const breakEvenRuns=runsRatio===null?null:Math.ceil(runsRatio);
  const paybackMonths = net > 0 ? safeRatio(upfront, net) : null;
  const decision = net > 0 ? 'positive-estimate' : 'nonpositive-estimate';
  const result = {
    schema: SCHEMA,
    version: VERSION,
    inputs: i,
    minutesSavedPerRun: saved,
    timeSavedHoursPerMonth: hoursPerMonth,
    timeValuePerRun: perRun,
    monthlyTimeValue: monthly,
    netMonthlyValue: net,
    upfrontCost: upfront,
    firstMonthNetValue: firstMonth,
    breakEvenRuns: breakEvenRuns,
    paybackMonths: paybackMonths,
    decision: decision,
    scope: buildScope(i.evidenceType)
  };
  return deepFreeze(result);
}

function serializeBuyerValue(input) {
  return JSON.stringify(calculateBuyerValue(input));
}

export { calculateBuyerValue, serializeBuyerValue };
