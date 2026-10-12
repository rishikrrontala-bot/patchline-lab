const { chromium } = require('./browser-runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const base = process.env.PATCHLINE_QA_BASE || 'http://127.0.0.1:8789';
const origin = new URL(base).origin;
const proof = path.join(root, 'proof');
const checks = [];
const numericKeys = ['runsPerMonth', 'baselineMinutes', 'toolMinutes', 'hourlyRate', 'monthlyPrice', 'pilotPrice', 'setupMinutes', 'setupCost'];

(async () => {
  fs.mkdirSync(proof, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith(`${origin}/`) && !url.startsWith('blob:') && !url.startsWith('data:')) external.push(url);
  });
  const text = id => page.locator(`#${id}`).innerText();
  const focus = () => page.evaluate(() => document.activeElement?.id);
  async function fill(values) {
    for (const [key, value] of Object.entries(values)) await page.locator(`#buyer-${key}`).fill(String(value));
  }
  async function calculate() { await page.locator('#buyerCalculate').click(); }
  async function exported(file) {
    const pending = page.waitForEvent('download');
    await page.locator('#buyerExport').click();
    const download = await pending;
    const filename = path.join(proof, file);
    await download.saveAs(filename);
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  }
  try {
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#buyerForm')?.dataset.buyerReady === 'true');
    for (const key of numericKeys.filter(key => !['monthlyPrice', 'pilotPrice'].includes(key))) assert.equal(await page.locator(`#buyer-${key}`).inputValue(), '');
    assert.equal(await page.locator('#buyer-monthlyPrice').inputValue(), '99');
    assert.equal(await page.locator('#buyer-pilotPrice').inputValue(), '300');
    assert.equal(await page.locator('#buyer-sameTask').isChecked(), false);
    assert.equal(await page.locator('#buyerExport').isDisabled(), true);
    assert.equal(await page.locator('#buyerOut .buyer-results').count(), 0);
    assert.match(await text('buyerOut'), /no buyer results are prefilled/i);
    checks.push('Initial task, usage, labor and setup inputs are blank; proposed prices are explicit and no savings result or export is prefilled');

    await calculate();
    assert.equal(await page.locator('#buyerError').isVisible(), true);
    assert.match(await text('buyerError'), /Comparable reports.*enter a value/i);
    assert.equal(await focus(), 'buyer-runsPerMonth');
    assert.equal(await page.locator('#buyer-runsPerMonth').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#buyerExport').isDisabled(), true);
    checks.push('Blank required input fails visibly, marks the relevant field and moves keyboard focus without creating an estimate');

    await page.locator('#buyerExample').click();
    assert.equal(await page.locator('#buyer-sameTask').isChecked(), true);
    assert.match(await text('buyerOut'), /hypothetical estimate/i);
    assert.match(await text('buyerOut'), /-\$59\.00/);
    assert.match(await text('buyerOut'), /-\$359\.00/);
    assert.match(await text('buyerOut'), /use the free workbench/i);
    assert.match(await page.locator('#buyer-note').inputValue(), /No task has been measured/);
    let result = await exported('buyer-hypothetical.json');
    assert.equal(result.schema, 'patchline-buyer-value-v1');
    assert.equal(result.inputs.evidenceType, 'estimate');
    assert.equal(result.monthlyTimeValue, 40);
    assert.equal(result.netMonthlyValue, -59);
    assert.equal(result.upfrontCost, 300);
    assert.equal(result.firstMonthNetValue, -359);
    assert.equal(result.breakEvenRuns, 20);
    assert.equal(result.paybackMonths, null);
    assert.ok(!('clinicalBenefit' in result));
    assert.ok(!('errorReductionValue' in result));
    checks.push('Explicitly hypothetical example preserves the buyer-value shortfall, full pilot fee and negative first month in actual JSON export');

    await fill({ runsPerMonth: 20, setupMinutes: 60 });
    await calculate();
    result = await exported('buyer-slow-payback.json');
    assert.equal(result.netMonthlyValue, 1);
    assert.equal(result.upfrontCost, 330);
    assert.equal(result.firstMonthNetValue, -329);
    assert.equal(result.paybackMonths, 330);
    assert.match(await text('buyerOut'), /330 months/);
    assert.match(await text('buyerOut'), /not a guaranteed return/i);
    checks.push('Small positive monthly value retains a 330-month upfront payback and negative first-month result rather than implying rapid repayment');

    await fill({ baselineMinutes: 10, toolMinutes: 20 });
    await calculate();
    result = await exported('buyer-slower-task.json');
    assert.equal(result.minutesSavedPerRun, -10);
    assert.equal(result.monthlyTimeValue, -100);
    assert.equal(result.netMonthlyValue, -199);
    assert.equal(result.breakEvenRuns, null);
    assert.equal(result.paybackMonths, null);
    assert.match(await text('buyerOut'), /-10 min/);
    assert.match(await text('buyerOut'), /unavailable/i);
    checks.push('A slower tool preserves signed time and labor losses with unavailable break-even and payback');

    await page.locator('#buyer-evidenceType').selectOption('user-measured');
    await page.locator('#buyer-note').fill('   ');
    await calculate();
    assert.equal(await focus(), 'buyer-note');
    assert.match(await text('buyerError'), /describe the measured task/i);
    assert.equal(await page.locator('#buyerExport').isDisabled(), true);
    const malicious = '<img src="https://invalid.example/x" onerror="window.__buyerInjected=1"> Complete report included; user supplied this note.';
    await page.locator('#buyer-note').fill(malicious);
    await calculate();
    assert.match(await text('buyerOut'), /reported task measurements.*unverified/i);
    assert.ok((await text('buyerOut')).includes(malicious));
    assert.equal(await page.locator('#buyerOut img').count(), 0);
    assert.equal(await page.evaluate(() => window.__buyerInjected), undefined);
    result = await exported('buyer-self-reported.json');
    assert.equal(result.inputs.note, malicious);
    assert.match(result.scope, /self-reported unverified/i);
    checks.push('Measured label requires a substantive note, remains self-reported and unverified, and renders untrusted notes as inert text');

    await fill({ toolMinutes: 9 });
    assert.equal(await page.locator('#buyerExport').isDisabled(), true);
    assert.equal(await page.locator('#buyerOut .buyer-results').count(), 0);
    assert.match(await text('buyerOut'), /inputs changed.*calculate again/i);
    checks.push('Editing an applied input clears stale results and disables export until recalculation');

    await fill({ baselineMinutes: 20 });
    await page.locator('#buyer-toolMinutes').press('Enter');
    assert.equal(await focus(), 'buyerOut');
    assert.equal(await page.locator('#buyerExport').isDisabled(), false);
    result = await exported('buyer-keyboard.json');
    assert.equal(result.inputs.toolMinutes, 9);
    assert.equal(result.minutesSavedPerRun, 11);
    assert.equal(result.netMonthlyValue, 11);
    assert.equal(result.paybackMonths, 30);
    checks.push('Enter submits from an edited numeric field and result focus does not invalidate the newly applied export');

    await page.locator('#buyer-evidenceType').selectOption('estimate');
    await page.locator('#buyer-note').fill('Exact-boundary hypothetical software check; no measured task.');
    await fill({ runsPerMonth: 60, baselineMinutes: 20, toolMinutes: 10, hourlyRate: 10, monthlyPrice: 100, pilotPrice: 0, setupMinutes: 0, setupCost: 0 });
    await calculate();
    result = await exported('buyer-exact-boundary.json');
    assert.equal(result.monthlyTimeValue, 100);
    assert.equal(result.netMonthlyValue, 0);
    assert.equal(result.breakEvenRuns, 60);
    assert.equal(result.paybackMonths, null);
    assert.equal(result.decision, 'nonpositive-estimate');
    checks.push('Exact sixty-report break-even stays at sixty with zero net value and no positive payback claim');

    await fill({ runsPerMonth: 1.5 });
    await calculate();
    assert.match(await text('buyerError'), /whole number/i);
    assert.equal(await focus(), 'buyer-runsPerMonth');
    await fill({ runsPerMonth: 60, hourlyRate: -1 });
    await calculate();
    assert.match(await text('buyerError'), /from 0 to 1,000,000/i);
    assert.equal(await focus(), 'buyer-hourlyRate');
    await fill({ hourlyRate: 1000001 });
    await calculate();
    assert.equal(await focus(), 'buyer-hourlyRate');
    assert.equal(await page.locator('#buyerExport').isDisabled(), true);
    checks.push('Fractional report counts and negative or excessive cost inputs fail visibly before export');

    await fill({ hourlyRate: 10 });
    await page.locator('#buyer-sameTask').uncheck();
    await calculate();
    assert.match(await text('buyerError'), /same task under comparable conditions/i);
    assert.equal(await focus(), 'buyer-sameTask');
    assert.equal(await page.locator('#buyerExport').isDisabled(), true);
    checks.push('Unconfirmed task equivalence prevents a time-savings estimate and focuses the declaration');

    await page.locator('#buyerReset').click();
    for (const key of numericKeys.filter(key => !['monthlyPrice', 'pilotPrice'].includes(key))) assert.equal(await page.locator(`#buyer-${key}`).inputValue(), '');
    assert.equal(await page.locator('#buyer-monthlyPrice').inputValue(), '99');
    assert.equal(await page.locator('#buyer-pilotPrice').inputValue(), '300');
    assert.equal(await page.locator('#buyer-evidenceType').inputValue(), 'estimate');
    assert.equal(await page.locator('#buyer-note').inputValue(), '');
    assert.equal(await page.locator('#buyer-sameTask').isChecked(), false);
    assert.equal(await page.locator('#buyerExport').isDisabled(), true);
    assert.equal(await page.locator('#buyerOut .buyer-results').count(), 0);
    assert.equal(await focus(), 'buyer-runsPerMonth');
    assert.equal(await page.locator('#buyerError').isVisible(), false);
    checks.push('Reset removes entered buyer information and results, preserves only explicit proposed prices and returns focus to the first input');

    await page.locator('#buyerExample').click();
    await page.locator('#buyer-value').screenshot({ path: path.join(proof, 'buyer-desktop.png') });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.locator('#buyer-value').screenshot({ path: path.join(proof, 'buyer-mobile.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await page.locator('#buyerExport').isVisible());
    assert.equal(await page.locator('#buyerOut .buyer-metric').count(), 8);
    const narrow = await page.locator('#buyerCalculate').boundingBox();
    assert.ok(narrow.width <= 288);
    checks.push('Complete worksheet and eight result metrics remain available without page-level horizontal overflow at 320 pixels');

    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    checks.push('Full worksheet workflow has no JavaScript errors, CSP violations or external runtime requests');
    const report = { base, scope: 'Muted Chrome browser acceptance for the buyer worksheet; figures are hypothetical software expectations, not observed customer savings.', checks, errors, external };
    fs.writeFileSync(path.join(proof, 'buyer-browser-qa.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ groups: checks.length, ...report }));
  } catch (error) {
    await page.screenshot({ path: path.join(proof, 'buyer-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
