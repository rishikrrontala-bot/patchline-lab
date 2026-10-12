// Local buyer-value worksheet. Built by Rishik Rontala.
import { calculateBuyerValue, serializeBuyerValue } from './buyer-value-engine.js';

const $ = id => document.getElementById(id);
const form = $('buyerForm');
const output = $('buyerOut');
const numericFields = [
  ['runsPerMonth', 'Comparable reports per month'],
  ['baselineMinutes', 'Current workflow minutes per report'],
  ['toolMinutes', 'Patchline minutes per report'],
  ['hourlyRate', 'Research labor value'],
  ['monthlyPrice', 'Monthly service price'],
  ['pilotPrice', 'Pilot fee'],
  ['setupMinutes', 'Additional setup minutes'],
  ['setupCost', 'Other setup cash costs']
];
let appliedResult = null;
let appliedSignature = null;

function inputSignature() {
  return JSON.stringify([
    ...numericFields.map(([key]) => $(`buyer-${key}`).value),
    $('buyer-sameTask').checked,
    $('buyer-evidenceType').value,
    $('buyer-note').value
  ]);
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const money = value => value === null ? 'Unavailable' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = value => value === null ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const signed = value => value > 0 ? `+${number(value)}` : number(value);

function clearInvalidFields() {
  for (const field of form.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
}

function clearError() {
  clearInvalidFields();
  $('buyerError').textContent = '';
  $('buyerError').hidden = true;
}

function validationError(field, message) {
  field.setAttribute('aria-invalid', 'true');
  const error = new Error(message);
  error.inputElement = field;
  return error;
}

function readInputs() {
  const inputs = {};
  for (const [key, label] of numericFields) {
    const field = $(`buyer-${key}`);
    if (!field.value.trim()) throw validationError(field, `${label}: enter a value, including zero when appropriate.`);
    const value = Number(field.value);
    if (!Number.isFinite(value) || value < 0 || value > 1000000) {
      throw validationError(field, `${label}: enter a finite number from 0 to 1,000,000.`);
    }
    if (key === 'runsPerMonth' && !Number.isInteger(value)) {
      throw validationError(field, 'Comparable reports per month must be a whole number.');
    }
    inputs[key] = value;
  }
  inputs.sameTask = $('buyer-sameTask').checked;
  if (!inputs.sameTask) throw validationError($('buyer-sameTask'), 'Confirm that both methods correctly complete the same task under comparable conditions.');
  inputs.evidenceType = $('buyer-evidenceType').value;
  inputs.note = $('buyer-note').value;
  if (inputs.note.length > 512) throw validationError($('buyer-note'), 'Keep the task note to 512 characters or fewer.');
  if (inputs.evidenceType === 'user-measured' && !inputs.note.trim()) {
    throw validationError($('buyer-note'), 'Describe the measured task, timing scope and conditions. These inputs remain self-reported and unverified.');
  }
  return inputs;
}

function metric(parent, title, value, detail) {
  const block = element('div', undefined, 'buyer-metric');
  block.append(element('h3', title), element('p', value, 'buyer-number'));
  if (detail) block.append(element('p', detail, 'help'));
  parent.append(block);
}

function renderResult(result) {
  output.replaceChildren();
  const measured = result.inputs.evidenceType === 'user-measured';
  output.append(element('p', measured
    ? 'Your reported task measurements — unverified. No independent observation or buyer validation is established.'
    : 'Hypothetical estimate — these inputs are assumptions, not measured savings or purchasing evidence.', 'buyer-evidence'));
  const metrics = element('div', undefined, 'buyer-results');
  metric(metrics, 'Time difference per report', `${signed(result.minutesSavedPerRun)} min`, 'Current workflow minus Patchline. A negative value means Patchline took longer.');
  metric(metrics, 'Monthly time difference', `${signed(result.timeSavedHoursPerMonth)} h`, 'Comparable reports × time difference; no task-error or clinical value is added.');
  metric(metrics, 'Monthly labor value', money(result.monthlyTimeValue), 'Time difference valued at your stated hourly rate.');
  metric(metrics, 'Net monthly labor value', money(result.netMonthlyValue), 'Monthly labor value minus the proposed monthly service price.');
  metric(metrics, 'Upfront buyer outlay', money(result.upfrontCost), 'Full pilot fee + your additional setup labor + other setup cash.');
  metric(metrics, 'First-month net value', money(result.firstMonthNetValue), 'Net monthly labor value minus the full upfront outlay.');
  metric(metrics, 'Monthly reports to cover price', number(result.breakEvenRuns), 'Based only on positive labor value per correctly completed report; unavailable when that value cannot cover the price.');
  metric(metrics, 'Upfront payback', result.paybackMonths === null ? 'Unavailable' : `${number(result.paybackMonths)} months`, 'Upfront outlay divided by positive net monthly labor value. Not a guaranteed return.');
  output.append(metrics);
  const positive = result.decision === 'positive-estimate';
  const decision = element('div', undefined, 'buyer-decision');
  decision.append(element('h3', positive ? 'The labor-only estimate covers the monthly fee' : 'The labor-only estimate does not justify the monthly fee'));
  decision.append(element('p', positive
    ? 'Use the free workbench to verify a complete reporting task and these assumptions before treating the estimate as buying evidence.'
    : 'Use the free workbench while validating value. These inputs do not cover the proposed monthly fee through labor value alone; lower prices, higher usage or other benefits would need evidence.'));
  const link = element('a', 'Use the free workbench ↗');
  link.href = '#workflow';
  decision.append(link);
  output.append(decision);
  const note = result.inputs.note.trim();
  if (note) output.append(element('p', `Your task note: ${note}`, 'buyer-note-result'));
  output.append(element('p', 'This worksheet is an arithmetic decision aid. It does not verify task equivalence, observations, demand, procurement approval or savings. Pilot and monthly fees are proposed, editable inputs.', 'help'));
}

function calculate({ moveFocus = false } = {}) {
  clearError();
  appliedResult = null;
  appliedSignature = null;
  $('buyerExport').disabled = true;
  try {
    const result = calculateBuyerValue(readInputs());
    renderResult(result);
    appliedResult = result;
    appliedSignature = inputSignature();
    $('buyerExport').disabled = false;
    if (moveFocus) output.focus();
    return true;
  } catch (error) {
    output.replaceChildren(element('p', 'No estimate is available until the required inputs are valid and the same completed task is confirmed.'));
    $('buyerError').textContent = error.message;
    $('buyerError').hidden = false;
    error.inputElement?.focus();
    return false;
  }
}

function invalidate() {
  clearError();
  if (appliedResult && inputSignature() !== appliedSignature) {
    appliedResult = null;
    appliedSignature = null;
    output.replaceChildren(element('p', 'Inputs changed. Calculate again before reviewing or exporting the worksheet.'));
  }
  $('buyerExport').disabled = !appliedResult;
  $('buyer-note').required = $('buyer-evidenceType').value === 'user-measured';
}

form.addEventListener('submit', event => {
  event.preventDefault();
  calculate({ moveFocus: true });
});
form.addEventListener('input', invalidate);
form.addEventListener('change', invalidate);

$('buyerExport').addEventListener('click', () => {
  if (!appliedResult) return;
  if (inputSignature() !== appliedSignature) { invalidate(); return; }
  try {
    const text = serializeBuyerValue(appliedResult.inputs);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = element('a');
    anchor.href = url;
    anchor.download = 'patchline-buyer-value.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    clearError();
  } catch (error) {
    $('buyerError').textContent = error.message;
    $('buyerError').hidden = false;
  }
});

$('buyerReset').addEventListener('click', () => {
  for (const [key] of numericFields) $(`buyer-${key}`).value = key === 'monthlyPrice' ? '99' : key === 'pilotPrice' ? '300' : '';
  $('buyer-evidenceType').value = 'estimate';
  $('buyer-note').value = '';
  $('buyer-note').required = false;
  $('buyer-sameTask').checked = false;
  appliedResult = null;
  appliedSignature = null;
  $('buyerExport').disabled = true;
  clearError();
  output.replaceChildren(element('p', 'Your task, frequency, labor and setup inputs are blank. Proposed $99/month and $300 pilot fees remain editable. No buyer results are prefilled.'));
  $('buyer-runsPerMonth').focus();
});

$('buyerExample').addEventListener('click', () => {
  const example = { runsPerMonth: 8, baselineMinutes: 20, toolMinutes: 10, hourlyRate: 30, monthlyPrice: 99, pilotPrice: 300, setupMinutes: 0, setupCost: 0 };
  for (const [key, value] of Object.entries(example)) $(`buyer-${key}`).value = String(value);
  $('buyer-evidenceType').value = 'estimate';
  $('buyer-note').required = false;
  $('buyer-note').value = 'Hypothetical example only: eight comparable reports/month, 20 minutes in the current workflow versus 10 in Patchline, $30/hour, proposed $99/month and $300 pilot; zero additional setup time/cash assumed. No task has been measured.';
  $('buyer-sameTask').checked = true;
  calculate({ moveFocus: true });
});

form.dataset.buyerReady = 'true';
