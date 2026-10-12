// Inspect the completed silent video without playing audio through speakers.
const {chromium} = require('./browser-runtime.cjs');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const target = path.resolve(process.argv[2] || path.join(root, 'submission/Patchline-Lab-5-minute-final.webm'));
const frames = [
  {second: 15, chapter: 1, expected: 'Problem hero and workflow'},
  {second: 58, chapter: 2, expected: 'Recorded environmental source sample and full-record quality findings'},
  {second: 103, chapter: 3, expected: 'Actual paired comparison readings with uncertainty and exceeding rows'},
  {second: 151, chapter: 4, expected: 'Workspace handoff and restored comparison'},
  {second: 185, chapter: 5, expected: 'Pure engines and browser-only architecture'},
  {second: 225, chapter: 6, expected: 'Executed engineering proof with explicit data and test scope'},
  {second: 243, chapter: 6, expected: '75 detected / 25 missed generated faults; zero false holds'},
  {second: 268, chapter: 7, expected: 'Seller revenue, monthly cost and first-month loss'},
  {second: 280, chapter: 7, expected: 'Hypothetical buyer value $40, monthly shortfall −$59 and first-month shortfall −$359'},
  {second: 298, chapter: 7, expected: 'Unvalidated assumptions and visible builder credit'},
];
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--mute-audio']});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 720}});
    await page.goto('file://' + target);
    await page.waitForSelector('video');
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
    await page.locator('video').evaluate(v => {
      v.pause(); v.muted = true; v.controls = false;
      v.style.cssText = 'position:fixed;inset:0;width:1280px;height:720px;object-fit:contain;background:black';
      document.body.style.margin = '0';
    });
    const metadata = await page.locator('video').evaluate(v => ({durationSeconds: v.duration, width: v.videoWidth, height: v.videoHeight, muted: v.muted, paused: v.paused}));
    assert.equal(metadata.width, 1280);
    assert.equal(metadata.height, 720);
    assert.ok(metadata.durationSeconds >= 299.8 && metadata.durationSeconds <= 300, 'Video must fit the five-minute limit.');
    assert.equal(metadata.muted, true);
    assert.equal(metadata.paused, true);
    for (const frame of frames) {
      await page.locator('video').evaluate((v, time) => {v.currentTime = time;}, frame.second);
      await page.waitForFunction(time => {const v = document.querySelector('video'); return !v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - time) < .1;}, frame.second);
      await page.waitForTimeout(100);
      frame.file = `proof/video-chapter-${frame.chapter}-${frame.second}s.png`;
      await page.screenshot({path: path.join(root, frame.file)});
    }
    const result = {file: path.relative(root, target), ...metadata, frames, visualReview: 'Expected scenes are listed for frame inspection; rendering alone does not certify their content.'};
    fs.writeFileSync(path.join(root, 'proof/video-verification.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally {await browser.close();}
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
