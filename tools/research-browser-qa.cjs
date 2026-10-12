const { chromium } = require('./browser-runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const checks = [];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (!request.url().startsWith((process.env.PATCHLINE_QA_BASE||'http://127.0.0.1:8789')) && !request.url().startsWith('blob:')) external.push(request.url()); });
  const text = id => page.locator(`#${id}`).innerText();
  async function exportJSON(buttonId, file) {
    const pending = page.waitForEvent('download');
    await page.locator(`#${buttonId}`).click();
    const download = await pending;
    const filename = path.join(root, 'proof', file);
    await download.saveAs(filename);
    return { value: JSON.parse(fs.readFileSync(filename, 'utf8')), filename };
  }
  async function importCSV(content, name, target = 'recording') {
    await page.locator(target === 'reference' ? '#referenceFile' : '#fileInput').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(content) });
    await page.locator('#mappingPanel').waitFor({ state: 'visible' });
  }
  async function confirmCSV() {
    await page.locator('#btnConfirmImport').click();
    await page.locator('#mappingPanel').waitFor({ state: 'hidden' });
  }
  try {
    await page.goto((process.env.PATCHLINE_QA_BASE||'http://127.0.0.1:8789'));
    await page.waitForFunction(() => document.querySelector('#comparisonControls input'));
    await page.waitForFunction(() => document.querySelector('#source').textContent.length > 5);
    const initial = await text('source');
    const fahrenheit = 'Time [ms],temperature_f,notes\n0,89.6,original\n1000,89.6,original\n2000,89.6,original\n3000,89.6,original\n4000,89.6,original';
    await importCSV(fahrenheit, 'fahrenheit-recording.csv');
    assert.equal(await text('source'), initial);
    assert.equal(await page.locator('#mapTime').inputValue(), 'Time [ms]');
    assert.equal(await page.locator('#mapTimeUnit').inputValue(), 'ms');
    assert.equal(await page.locator('#map-temperature').inputValue(), 'temperature_f');
    assert.equal(await page.locator('#unit-temperature').inputValue(), 'F');
    checks.push('Imports stage a visible mapping and declared units without replacing current evidence');
    await page.locator('#map-ph').selectOption('temperature_f');
    await page.locator('#btnConfirmImport').click();
    assert.equal(await page.locator('#mappingPanel').isVisible(), true);
    assert.equal(await page.locator('#mappingError').isVisible(), true);
    assert.equal(await text('source'), initial);
    await page.locator('#map-ph').selectOption('');
    await confirmCSV();
    let report = (await exportJSON('btnExport', 'research-import-report.json')).value;
    assert.equal(report.originalSamples.length, 5);
    assert.deepEqual(report.originalSamples.map(sample => sample.t), [0, 1, 2, 3, 4]);
    assert.ok(report.originalSamples.every(sample => Math.abs(sample.temperature - 32) < 1e-9));
    assert.ok(report.originalSamples.every(sample => sample.moisture === null && sample.ph === null && sample.glucose === null));
    assert.equal(report.model.patternScore, null);
    assert.match(await text('findings'), /no quality findings/i);
    checks.push('Invalid duplicate mapping preserves evidence; Fahrenheit and milliseconds convert; absent channels are not dropouts');

    await page.locator('#btnUseOriginal').click();
    await page.locator('#btnCompare').click();
    let comparison = (await exportJSON('btnExportComparison', 'research-clean-comparison.json')).value;
    assert.deepEqual(comparison.counts, { within: 5, exceeds: 0, uncertain: 0, unavailable: 0 });
    assert.equal(comparison.decision, 'within-tolerance');
    assert.equal(await page.locator('#comparisonFilter').inputValue(), 'review');
    assert.equal(await page.locator('#comparisonOut tbody tr').count(), 0);
    await page.locator('#comparisonFilter').selectOption('all');
    assert.equal(await page.locator('#comparisonOut tbody tr').count(), 5);
    await page.locator('#comparisonFilter').selectOption('review');
    checks.push('Original control comparison has complete, one-to-one, zero-difference evidence');

    await page.locator('details.fault > summary').click();
    await page.locator('#faultType').selectOption('drift');
    await page.locator('#faultChannel').selectOption('temperature');
    await page.locator('#faultIndex').fill('2');
    await page.locator('#faultSeverity').fill('2');
    await page.locator('#faultSeed').fill('0');
    await page.locator('#btnApply').click();
    assert.equal(await page.locator('#btnExportComparison').isDisabled(), true);
    await page.locator('#btnCompare').click();
    comparison = (await exportJSON('btnExportComparison', 'research-drift-comparison.json')).value;
    assert.equal(comparison.decision, 'discrepancy');
    assert.ok(comparison.counts.exceeds >= 2);
    assert.equal(comparison.pairs.length, 5);
    assert.equal(comparison.pairs[4].sampleIndex, 4);
    assert.ok(Math.abs(comparison.pairs[4].delta - 2) < 1e-9);
    await page.getByRole('button', { name: 'Inspect current sample 5', exact: true }).click();
    assert.equal(await page.locator('#cursor').inputValue(), '4');
    assert.match(await text('modelStatus'), /disabled.*import|import.*disabled/i);
    checks.push('Controlled perturbation resets stale comparison and exact paired evidence navigates to the real sample');

    await page.locator('#compareTolerance').fill('99');
    report = (await exportJSON('btnExport', 'research-applied-settings-report.json')).value;
    assert.equal(report.research.comparison.options.tolerance, 0.5);
    assert.equal(report.operations[0].seed, 0);
    assert.ok(Math.abs(report.originalSamples[4].temperature - 32) < 1e-9);
    assert.ok(Math.abs(report.derivedSamples[4].temperature - 34) < 1e-9);
    checks.push('Exports retain applied comparison settings and exact original/derived values despite unapplied edits');

    await page.locator('#compareTolerance').fill('2.5');
    await page.locator('#compareUncertainty').fill('3');
    await page.locator('#btnCompare').click();
    comparison = (await exportJSON('btnExportComparison', 'research-uncertain-comparison.json')).value;
    assert.equal(comparison.decision, 'inconclusive');
    assert.equal(comparison.counts.uncertain, 5);
    assert.match(await text('comparisonOut'), /inconclusive/i);
    checks.push('Large reference uncertainty yields visible inconclusive evidence rather than a confident pass');

    await page.locator('#compareTolerance').fill('0.5');
    await page.locator('#compareUncertainty').fill('0.05');
    await page.locator('#compareOffset').fill('10');
    await page.locator('#btnCompare').click();
    comparison = (await exportJSON('btnExportComparison', 'research-unaligned-comparison.json')).value;
    assert.equal(comparison.coverage, 0);
    assert.equal(comparison.decision, 'inconclusive');
    assert.equal(comparison.summary.rmse, null);
    assert.deepEqual(comparison.findings, []);
    checks.push('Nonoverlapping timestamps retain unavailable pairs and no invented interpolated evidence');
    await page.locator('#compareOffset').fill('0');
    await page.locator('#btnCompare').click();

    const saved = await exportJSON('btnExportWorkspace', 'research-workspace.json');
    await page.locator('#btnChange').click();
    await page.locator('#workspaceFile').setInputFiles(saved.filename);
    await page.waitForFunction(() => document.querySelector('#workspaceStatus').textContent.includes('Workspace restored'));
    report = (await exportJSON('btnExport', 'research-restored-report.json')).value;
    assert.deepEqual(report.originalSamples, saved.value.trace.samples);
    assert.deepEqual(report.derivedSamples, saved.value.derivedSamples);
    assert.equal(report.source.kind, 'imported');
    assert.equal(report.model.patternScore, null);
    assert.equal(report.research.comparison.decision, 'discrepancy');
    checks.push('Workspace restores originals, derived data, operations and comparison then recomputes evidence with classifier disabled');

    const beforeMalformed = await text('source');
    await page.locator('#workspaceFile').setInputFiles({ name: 'malicious-workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...saved.value, schema: 'forged' })) });
    await page.locator('#workspaceError').waitFor({ state: 'visible' });
    assert.equal(await text('source'), beforeMalformed);
    checks.push('Malformed workspace cannot replace the current recording');

    await page.locator('details.protocol-editor > summary').click();
    await page.locator('#protocolName').fill('Independent protocol revision');
    await page.locator('#protocolRevision').fill('2');
    await page.locator('#protocolGap').fill('60');
    await page.locator('#btnSaveProtocol').click();
    const savedProtocol = await exportJSON('btnExportProtocol', 'research-protocol.json');
    assert.equal(savedProtocol.value.protocol.name, 'Independent protocol revision');
    assert.equal(savedProtocol.value.protocol.revision, '2');
    assert.equal(savedProtocol.value.protocol.maxGapSeconds, 60);
    assert.equal(savedProtocol.value.profile.channels.temperature.unit, 'F');
    await page.locator('#protocolGap').fill('2');
    await page.locator('#btnSaveProtocol').click();
    await page.locator('#protocolFile').setInputFiles(savedProtocol.filename);
    await page.waitForFunction(() => document.querySelector('#protocolStatus').textContent.includes('restored'));
    assert.equal(await page.locator('#protocolGap').inputValue(), '60');
    checks.push('Versioned protocols and import profiles export/restore exact declared assumptions');

    const hostileName = '<img src=x onerror=alert(1)>.csv';
    await importCSV(fahrenheit, hostileName);
    assert.match(await text('mappingSummary'), /<img/);
    assert.equal(await page.locator('#mappingSummary img').count(), 0);
    await confirmCSV();
    assert.match(await text('source'), /<img/);
    assert.equal(await page.locator('#source img').count(), 0);
    checks.push('Untrusted filenames render as plain text in staged and confirmed imports');

    await importCSV('timestamp_s,ph\n0,6\n1,6\n2,6', 'ph-only.csv');
    await confirmCSV();
    await page.locator('#btnUseOriginal').click();
    assert.equal(await page.locator('#compareChannel').inputValue(), 'ph');
    const phWorkspace = await exportJSON('btnExportWorkspace', 'research-ph-workspace.json');
    await page.locator('#btnStable').click();
    await page.locator('#workspaceFile').setInputFiles(phWorkspace.filename);
    await page.waitForFunction(() => document.querySelector('#source').textContent.includes('ph-only'));
    assert.equal(await page.locator('#workspaceError').isVisible(), false);
    assert.equal(await page.locator('#compareChannel').inputValue(), 'ph');
    report = (await exportJSON('btnExport', 'research-ph-restored-report.json')).value;
    assert.equal(report.model.patternScore, null);
    assert.equal(report.originalSamples[0].temperature, null);
    assert.equal(report.originalSamples[0].ph, 6);
    checks.push('Optional-channel workspace saves before first comparison and restores without partial-state errors');
    const beforeIncompatible = await text('source');
    const incompatible = structuredClone(phWorkspace.value);
    incompatible.comparisonOptions.channel = 'temperature';
    await page.locator('#workspaceFile').setInputFiles({ name: 'incompatible-comparison-workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incompatible)) });
    await page.locator('#workspaceError').waitFor({ state: 'visible' });
    assert.equal(await text('source'), beforeIncompatible);
    const afterIncompatible = (await exportJSON('btnExport', 'research-failed-restore-report.json')).value;
    assert.deepEqual(afterIncompatible.originalSamples, report.originalSamples);
    assert.deepEqual(afterIncompatible.derivedSamples, report.derivedSamples);
    assert.deepEqual(afterIncompatible.protocol, report.protocol);
    checks.push('Dependent comparison validation fails atomically without replacing original, derived or protocol state');

    await page.locator('#btnInvestigation').click();
    comparison = (await exportJSON('btnExportComparison', 'research-guided-investigation.json')).value;
    assert.equal(comparison.decision, 'discrepancy');
    assert.equal(comparison.source.kind, 'synthetic');
    assert.equal((await text('workspaceStatus')).trim(), '');
    assert.equal((await text('protocolStatus')).trim(), '');
    checks.push('One-click investigation produces reproducible, explicitly synthetic discrepancy evidence');
    assert.equal(await page.locator('#comparisonFilter').inputValue(), 'review');
    assert.ok(await page.locator('#comparisonOut tbody tr').count() <= 12);
    await page.getByRole('button', { name: 'Next pairs', exact: true }).click();
    await page.getByRole('button', { name: 'Inspect current sample 24', exact: true }).click();
    assert.equal(await page.locator('#cursor').inputValue(), '23');
    await page.locator('#comparisonFilter').selectOption('all');
    assert.equal(await page.locator('#comparisonOut tbody tr').count(), 12);
    await page.getByRole('button', { name: 'Next pairs', exact: true }).click();
    assert.equal(await page.locator('#comparisonOut tbody tr').count(), 12);
    const completePaged = (await exportJSON('btnExportComparison', 'research-paged-comparison.json')).value;
    assert.equal(completePaged.pairs.length, 24);
    assert.deepEqual(completePaged.counts, comparison.counts);
    await page.locator('#comparisonFilter').selectOption('review');
    checks.push('Review/all filters page twelve pairs, preserve exact sample navigation and export every pair');

    await page.locator('#btnRecorded').click();
    await page.waitForFunction(() => document.querySelector('#cursor').max === '4999');
    report = (await exportJSON('btnExport', 'research-external-recording.json')).value;
    assert.equal(report.originalSamples.length, 5000);
    assert.equal(report.source.kind, 'imported');
    assert.equal(report.model.patternScore, null);
    assert.equal(report.protocol.maxGapSeconds, 60);
    assert.deepEqual(report.originalSamples, report.derivedSamples);
    assert.match(await text('workspaceStatus'), /credited environmental|unchanged readings/i);
    assert.ok(await page.locator('svg path').evaluateAll(elements => elements.every(element => !/NaN|Infinity/.test(element.getAttribute('d') || ''))));
    checks.push('Credited independent UCI recording loads 5,000 unchanged samples with matching sampling protocol and no classifier');
    assert.ok(report.quality.findings.length > 12);
    assert.equal(await page.locator('#findings .finding-link').count(), 12);
    await page.getByRole('button', { name: 'Next findings', exact: true }).click();
    assert.equal(await page.locator('#findings .finding-link').count(), 12);
    assert.match(await text('findings'), /Findings 13–24/);
    const completeFindings = (await exportJSON('btnExport', 'research-paged-findings.json')).value;
    assert.deepEqual(completeFindings.quality.findings, report.quality.findings);
    await page.getByRole('button', { name: 'Previous findings', exact: true }).click();
    checks.push('Recorded-data quality findings page twelve at a time while JSON retains all findings');

    const performanceResult = await page.evaluate(async () => {
      const { parseMappedCSV, validateProfile, validateResearchProtocol } = await import('./research-engine.js');
      const { analyzeExperiment, DEFAULT_PROTOCOL } = await import('./lab-engine.js');
      const { UCI_TEMPERATURE_CSV } = await import('./samples/uci-temperature.js');
      const profile = validateProfile({ name: 'Measured external import', timeColumn: 'timestamp_s', timeUnit: 's', channels: { temperature: { column: 'temperature_c', unit: 'C' } } });
      const protocol = validateResearchProtocol({ ...DEFAULT_PROTOCOL, channels: ['temperature'], maxGapSeconds: 60 });
      const durations = [];
      let analysis;
      for (let i = 0; i < 23; i++) {
        const started = performance.now();
        const recording = parseMappedCSV(UCI_TEMPERATURE_CSV, profile, 'UCI-S1-temperature-5000.csv');
        analysis = analyzeExperiment(recording, { type: 'none' }, protocol);
        const elapsed = performance.now() - started;
        if (i >= 3) durations.push(elapsed);
      }
      const sorted = [...durations].sort((a, b) => a - b);
      return {
        scope: 'Local headless Chrome engine timing on this Mac. Twenty runs after three warm-up runs; includes CSV scanning, mapping/conversion, immutable trace creation, full-record QC and report snapshot construction. Excludes network, file-picker interaction, DOM/chart rendering, screenshots and user task completion. Not a production service latency or usability claim.',
        rows: analysis.samples.length, channels: ['temperature'], findings: analysis.quality.findings.length,
        classifierDisabled: analysis.patternScore === null, csvUTF8Bytes: new TextEncoder().encode(UCI_TEMPERATURE_CSV).byteLength,
        timingsMs: durations, p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], minimumMs: sorted[0], maximumMs: sorted.at(-1),
        quantileMethod: 'Nearest rank', userAgent: navigator.userAgent,
      };
    });
    assert.equal(performanceResult.rows, 5000);
    assert.equal(performanceResult.classifierDisabled, true);
    assert.ok(performanceResult.timingsMs.every(value => Number.isFinite(value) && value >= 0));
    fs.writeFileSync(path.join(root, 'proof/research-browser-performance.json'), JSON.stringify(performanceResult, null, 2));
    checks.push('Actual recorded-data engine timings measured in Chrome with explicit scope and complete analysis');

    await page.locator('#bizDownside').click();
    assert.match(await text('bizOut'), /\$-9\.00/);
    let economics = (await exportJSON('btnExportEconomics', 'research-downside-economics.json')).value;
    economics = economics.result ?? economics.economics ?? economics;
    assert.equal(economics.inputs.pilotHours, 10);
    assert.equal(economics.pilotMargin, -9);
    await page.locator('#bizBase').click();
    economics = (await exportJSON('btnExportEconomics', 'research-base-economics.json')).value;
    economics = economics.result ?? economics.economics ?? economics;
    assert.equal(economics.monthlyRevenue, 495);
    assert.equal(economics.pilotMargin, 111);
    await page.locator('#finance-teams').fill('0');
    assert.match(await text('bizOut'), /\$-120\.00/);
    await page.locator('#finance-price').fill('');
    assert.equal(await page.locator('#financeError').isVisible(), true);
    assert.doesNotMatch(await text('bizOut'), /NaN|Infinity/);
    await page.locator('#bizBase').click();
    checks.push('Business scenarios expose delivery losses, acquisition/support costs and invalid input instead of fabricated ROI');

    await page.setViewportSize({ width: 320, height: 900 });
    await page.screenshot({ path: path.join(root, 'proof/research-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    checks.push('Complete expanded workflow has no page-level horizontal overflow at 320 pixels');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#btnInvestigation').click();
    assert.equal((await text('workspaceStatus')).trim(), '');
    assert.equal((await text('protocolStatus')).trim(), '');
    await page.screenshot({ path: path.join(root, 'proof/research-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    checks.push('No browser errors, CSP violations or runtime external requests across the full workflow');
    fs.writeFileSync(path.join(root, 'proof/research-browser-qa.json'), JSON.stringify({ checks, errors, external }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, passed: checks }));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
