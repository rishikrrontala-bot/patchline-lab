const { chromium } = require('./browser-runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto((process.env.PATCHLINE_QA_BASE||'http://127.0.0.1:8789'));
    await page.waitForFunction(() => document.querySelector('#comparisonControls input'));
    await page.locator('#btnRecorded').click();
    assert.match(await page.locator('#workspaceStatus').innerText(), /5,000 unchanged readings/);
    await page.locator('details.protocol-editor > summary').click();
    await page.locator('#protocolName').fill('Previous declared protocol');
    await page.locator('#btnSaveProtocol').click();
    assert.match(await page.locator('#protocolStatus').innerText(), /Protocol applied/);
    await page.locator('#btnInvestigation').click();
    assert.equal((await page.locator('#workspaceStatus').innerText()).trim(), '');
    assert.equal((await page.locator('#protocolStatus').innerText()).trim(), '');
    assert.match(await page.locator('#source').innerText(), /changing.*synthetic|synthetic.*changing/i);
    assert.match(await page.locator('#comparisonOut').innerText(), /discrepancy needs review/i);
    await page.screenshot({ path: path.join(root, 'proof/research-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.locator('#btnRecorded').click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(root, 'proof/research-mobile.png'), fullPage: true });
    await page.screenshot({ path: path.join(root, 'proof/research-mobile-hero.png') });
    await page.locator('#comparisonPanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, 'proof/research-mobile-controls.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    const result = { checks: ['Recorded-data success describes the current recording', 'Applied protocol success is visible', 'Synthetic investigation clears previous recorded-data and protocol provenance statuses', 'Current comparison remains valid', 'Mobile has no page-level overflow'], errors };
    fs.writeFileSync(path.join(root, 'proof/research-status-qa.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
