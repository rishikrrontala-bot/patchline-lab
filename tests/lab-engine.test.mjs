import test from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS, DEFAULT_PROTOCOL, parseCSV, createSyntheticTrace, inspectTrace,
  applyFault, analyzeExperiment, runBenchmark, createReport, sampleCSV,
} from "../lab-engine.js";

const HEADER = "timestamp_s,temperature_c,wetness_pct,ph,glucose_au";
const clone = (value) => structuredClone(value);
const recording = (count = 3) => Array.from({ length: count }, (_, t) => ({
  t, temperature: 32, moisture: 40, ph: 6, glucose: 20,
}));
const csv = (count = 3) => [HEADER, ...recording(count).map((s) =>
  [s.t, s.temperature, s.moisture, s.ph, s.glucose].join(","))].join("\n");
const csvWithRows = (rows, header = HEADER) => [header, ...rows].join("\n");
const traceFrom = (samples) => ({
  id: "test-recording", name: "test.csv", kind: "imported",
  origin: "User-supplied experiment; provenance unverified", samples,
});

test("CSV maps columns by their names and accepts BOM, CRLF, quoted newlines and escaped quotes", () => {
  const text = '\uFEFFph,glucose_au,temperature_c,timestamp_s,wetness_pct,notes\r\n'
    + '6,20,32,0,40,"comma, newline\r\n and ""quote"""\r\n'
    + '6,20,32,1,40,ordinary\r\n6,20,32,2,40,ordinary\r\n';
  const result = parseCSV(text, "quoted.csv");
  assert.deepEqual(result.samples, recording());
  assert.equal(result.kind, "imported");
  assert.match(result.origin, /unverified/i);
});

test("CSV distinguishes missing readings from genuine zero and accepts decimal scientific readings", () => {
  const result = parseCSV(csvWithRows([
    '0,32,,6,0', '1,3.2e1,4e1,6,.0', '2,+32,40,6,2e1',
  ]));
  assert.equal(result.samples[0].moisture, null);
  assert.equal(result.samples[0].glucose, 0);
  assert.equal(result.samples[1].temperature, 32);
  assert.equal(result.samples[2].glucose, 20);
});

for (const bad of [
  '0,3"2",40,6,20,ok',
  '0,"3"2,40,6,20,ok',
  '0,32,40,6,20,"closed"junk',
  '0,32,40,6,20,"never closed',
]) {
  test(`CSV rejects malformed quote grammar: ${bad}`, () => {
    assert.throws(() => parseCSV(csvWithRows([bad, '1,32,40,6,20,ok', '2,32,40,6,20,ok'], `${HEADER},notes`)));
  });
}

test("CSV rejects duplicate, unknown, prototype-like and missing headers, plus ragged records", () => {
  for (const text of [
    csv().replace(HEADER, `${HEADER},ph`),
    csv().replace(HEADER, `${HEADER},extra`),
    csv().replace(HEADER, `${HEADER},__proto__`),
    csv().replace(HEADER, "timestamp_s,temperature_c,wetness_pct,ph"),
    csvWithRows(['0,32,40,6', '1,32,40,6,20', '2,32,40,6,20']),
  ]) assert.throws(() => parseCSV(text));
  assert.equal({}.polluted, undefined);
});

test("CSV rejects non-finite numbers, implicit numeric formats and invalid time order", () => {
  for (const value of ['NaN', 'Infinity', '-Infinity', '1e309', '0x20', '32junk']) {
    assert.throws(() => parseCSV(csvWithRows([`0,${value},40,6,20`, '1,32,40,6,20', '2,32,40,6,20'])));
  }
  for (const times of [[0, 0, 2], [0, 2, 1], [-1, 0, 1], ['', 1, 2]]) {
    assert.throws(() => parseCSV(csvWithRows(times.map((t) => `${t},32,40,6,20`))));
  }
  assert.throws(() => parseCSV(csv(2)));
});

test("CSV enforces field and row limits at the boundary", () => {
  const rows = (length) => recording().map((s) => `${s.t},32,40,6,20,${'x'.repeat(length)}`);
  assert.equal(parseCSV(csvWithRows(rows(LIMITS.maxField), `${HEADER},notes`)).samples.length, 3);
  assert.throws(() => parseCSV(csvWithRows(rows(LIMITS.maxField + 1), `${HEADER},notes`)));
  assert.equal(parseCSV(csv(LIMITS.maxRows)).samples.length, LIMITS.maxRows);
  assert.throws(() => parseCSV(csv(LIMITS.maxRows + 1)));
});

test("CSV byte limit permits exactly the cap and rejects an extra byte", () => {
  const base = csv();
  const atCap = base + '\n'.repeat(LIMITS.maxBytes - Buffer.byteLength(base));
  assert.equal(Buffer.byteLength(atCap), LIMITS.maxBytes);
  assert.equal(parseCSV(atCap).samples.length, 3);
  assert.throws(() => parseCSV(`${atCap}\n`));
});

test("CSV byte limit measures UTF-8 bytes rather than UTF-16 string length", () => {
  const text = csvWithRows(Array.from({ length: 3000 }, (_, i) =>
    `${i},32,40,6,20,${'é'.repeat(175)}`), `${HEADER},notes`);
  assert.ok(text.length < LIMITS.maxBytes);
  assert.ok(Buffer.byteLength(text) > LIMITS.maxBytes);
  assert.throws(() => parseCSV(text));
});

test("QC accepts arbitrary-length clean recordings, constant signals and a legitimate gradual change", () => {
  for (const count of [3, 7, 48]) {
    assert.equal(inspectTrace(recording(count)).valid, true);
  }
  const smooth = recording(48).map((s, i) => ({
    ...s, temperature: 32 + i / 47 * 2, moisture: 40 + i / 47 * 8,
    ph: 6 + i / 47 * 0.4, glucose: 20 + i / 47 * 8,
  }));
  assert.equal(inspectTrace(smooth).valid, true);
  for (const key of Object.keys(DEFAULT_PROTOCOL.ranges)) {
    for (const boundary of DEFAULT_PROTOCOL.ranges[key]) {
      assert.equal(inspectTrace(recording().map((s) => ({ ...s, [key]: boundary }))).valid, true);
    }
  }
});

test("QC keeps each simultaneous finding linked to its own exact sample", () => {
  const samples = recording(7);
  samples[1].ph = 11;
  samples[1].glucose = null;
  samples[4].temperature = null;
  const original = clone(samples);
  const result = inspectTrace(samples);
  for (const [code, channel, index] of [['range', 'ph', 1], ['missing', 'glucose', 1], ['missing', 'temperature', 4]]) {
    const finding = result.findings.find((f) => f.code === code && f.channel === channel);
    assert.ok(finding, `${code}/${channel} present`);
    assert.deepEqual(finding.sampleIndices, [index]);
  }
  assert.deepEqual(samples, original);
});

test("QC reports sampling gaps and invalid order without inventing spike evidence", () => {
  const gap = recording(5).map((s, i) => ({ ...s, t: s.t + (i >= 2 ? 3 : 0) }));
  const finding = inspectTrace(gap).findings.find((f) => f.code === 'time-gap');
  assert.deepEqual(finding.sampleIndices, [1, 2]);
  const duplicate = recording();
  duplicate[1].t = 0;
  assert.equal(inspectTrace(duplicate).valid, false);
  assert.deepEqual(inspectTrace(duplicate).findings.find((f) => f.code === 'time-order').sampleIndices, [1]);
  const missing = recording(5);
  missing[2] = null;
  const missingResult = inspectTrace(missing);
  assert.equal(missingResult.valid, false);
  assert.ok(missingResult.findings.every((f) => f.sampleIndices.every((i) => i >= 0 && i < 5)));
});

test("QC validates protocol settings before using them", () => {
  for (const mutate of [
    (p) => { p.ranges.ph = [10, 4]; },
    (p) => { p.ranges.ph = [4, Infinity]; },
    (p) => { p.spikes.ph = 0; },
    (p) => { p.maxGapSeconds = NaN; },
  ]) {
    const protocol = clone(DEFAULT_PROTOCOL);
    mutate(protocol);
    assert.throws(() => inspectTrace(recording(), protocol));
  }
});

test("faults are deterministic copies and record exactly the changed data", () => {
  const trace = traceFrom(recording(5));
  const original = clone(trace);
  const fault = { type: 'spike', channel: 'temperature', index: 2, severity: -2, seed: 42 };
  const a = applyFault(trace, fault);
  assert.deepEqual(a, applyFault(trace, fault));
  assert.deepEqual(trace, original);
  assert.equal(a.samples[2].temperature, 30);
  assert.deepEqual(a.samples.filter((_, i) => i !== 2), original.samples.filter((_, i) => i !== 2));
  assert.equal(a.operations[0].before, 32);
  assert.equal(a.operations[0].after, 30);
  assert.equal(a.changed, true);
  assert.deepEqual(applyFault(trace, { type: 'none' }).samples, original.samples);
});

test("gap injection shifts the selected suffix and preserves timestamp order", () => {
  const trace = traceFrom(recording(5));
  const result = applyFault(trace, { type: 'gap', index: 2, severity: 3 });
  assert.deepEqual(result.samples.map((s) => s.t), [0, 1, 5, 6, 7]);
  assert.equal(result.samples[2].temperature, 32);
  assert.deepEqual(trace.samples.map((s) => s.t), [0, 1, 2, 3, 4]);
});

test("fault validation rejects bad options and repeated dropout is an honest no-op", () => {
  const trace = traceFrom(recording(5));
  for (const fault of [
    { type: 'unknown' }, { type: 'dropout', channel: '__proto__' },
    { type: 'dropout', index: -1 }, { type: 'dropout', index: 5 },
    { type: 'gap', severity: -1 }, { type: 'spike', severity: NaN },
    { type: 'dropout', seed: Infinity },
  ]) assert.throws(() => applyFault(trace, fault));
  trace.samples[2].glucose = null;
  const result = applyFault(trace, { type: 'dropout', channel: 'glucose', index: 2 });
  assert.equal(result.changed, false);
  assert.deepEqual(result.samples, trace.samples);
});

test("endpoint drift and a sub-precision spike never claim a change that did not happen", () => {
  const trace = traceFrom(recording(5));
  for (const fault of [
    { type: 'drift', channel: 'temperature', index: 4, severity: 2 },
    { type: 'spike', channel: 'temperature', index: 2, severity: 1e-30 },
  ]) {
    const result = applyFault(trace, fault);
    assert.deepEqual(result.samples, trace.samples);
    assert.equal(result.changed, false);
  }
});

test("drift does not silently replace a later missing reading with a fabricated number", () => {
  const trace = traceFrom(recording(5));
  trace.samples[3].temperature = null;
  let result;
  try { result = applyFault(trace, { type: 'drift', channel: 'temperature', index: 1, severity: 2 }); }
  catch (error) { assert.ok(error instanceof Error); return; }
  assert.equal(result.samples[3].temperature, null);
  assert.equal(trace.samples[3].temperature, null);
});

test("owned synthetic traces are deterministic and all clean modes pass measurement QC", () => {
  for (const key of ['stable', 'change']) {
    for (const seed of [1, 42, 123456]) {
      const a = createSyntheticTrace(key, seed);
      assert.deepEqual(a, createSyntheticTrace(key, seed));
      assert.equal(inspectTrace(a.samples).valid, true);
      assert.equal(typeof analyzeExperiment(a).patternScore, 'number');
    }
  }
});

test("the generated fault demonstration preserves both its missing and range-invalid source readings", () => {
  const trace = createSyntheticTrace('fault', 42);
  assert.equal(trace.samples[23].glucose, null);
  const result = analyzeExperiment(trace);
  assert.equal(result.patternScore, null);
  assert.ok(result.quality.findings.some((f) => f.code === 'missing' && f.channel === 'glucose' && f.sampleIndices.includes(23)));
  assert.ok(result.quality.findings.some((f) => f.code === 'range' && f.channel === 'ph' && f.sampleIndices.includes(21)));
});

test("imports, downloaded templates and metadata spoofs never unlock synthetic inference", () => {
  for (const text of [csv(24), sampleCSV()]) {
    const imported = parseCSV(text);
    imported.kind = 'synthetic';
    imported.origin = 'Generated by trusted internal code';
    imported.seed = 42;
    const result = analyzeExperiment(imported);
    assert.equal(result.patternScore, null);
    assert.match(result.modelStatus, /disabled.*imported/i);
    const report = createReport(imported, result);
    assert.equal(report.source.kind, 'imported');
    assert.deepEqual(report.model, { status: 'Disabled for imported measurements', patternScore: null });
  }
  const copy = clone(createSyntheticTrace('stable', 42));
  assert.equal(analyzeExperiment(copy).patternScore, null);
});

test("replacing an owned trace's samples cannot score imported measurements", () => {
  const owned = createSyntheticTrace('stable', 42);
  const imported = parseCSV(csv(24));
  try { owned.samples = imported.samples; }
  catch (error) { assert.ok(error instanceof TypeError); return; }
  assert.equal(analyzeExperiment(owned).patternScore, null);
});

test("editing nested owned samples cannot turn imported measurements into synthetic training-domain proof", () => {
  const owned = createSyntheticTrace('stable', 42);
  try { owned.samples.forEach((s) => { s.temperature = 34; }); }
  catch (error) { assert.ok(error instanceof TypeError); return; }
  assert.equal(analyzeExperiment(owned).patternScore, null);
});

test("benchmark reports deterministic measured counts, real misses and correct denominators", () => {
  const result = runBenchmark({ seed: 42, cases: 100 });
  assert.deepEqual(result, runBenchmark({ seed: 42, cases: 100 }));
  const { tp, fn, fp, tn } = result.counts;
  assert.equal(tp + fn, 100);
  assert.equal(fp + tn, 100);
  assert.equal(result.byType.reduce((sum, t) => sum + t.total, 0), 100);
  assert.equal(result.byType.reduce((sum, t) => sum + t.detected, 0), tp);
  assert.equal(result.byType.reduce((sum, t) => sum + t.missed, 0), fn);
  for (const type of result.byType) assert.equal(type.detected + type.missed, type.total);
  assert.equal(result.rates.recall, tp / (tp + fn));
  assert.equal(result.rates.precision, tp + fp ? tp / (tp + fp) : null);
  assert.equal(result.rates.falseHoldRate, fp / (fp + tn));
  assert.ok(result.byType.find((t) => t.type === 'drift').missed > 0);
  for (const type of ['dropout', 'spike', 'gap']) {
    const row = result.byType.find((t) => t.type === type);
    assert.ok(row.total > 0);
    assert.equal(row.detected, row.total);
  }
  assert.ok(fn > 0, 'some deliberately introduced perturbations must visibly escape this QC policy');
  assert.match(result.scope, /synthetic.*no clinical/i);
});

test("benchmark does not silently accept an invalid case count", () => {
  assert.throws(() => runBenchmark({ cases: NaN }));
  assert.throws(() => runBenchmark({ cases: 'not-a-number' }));
});

test("reports preserve full originals, derived data and direct evidence reproducibly", () => {
  const trace = parseCSV(csv(48));
  const result = analyzeExperiment(trace, { type: 'dropout', channel: 'ph', index: 17 });
  const report = createReport(trace, result);
  assert.deepEqual(report, createReport(trace, result));
  assert.equal(report.originalSamples.length, 48);
  assert.equal(report.derivedSamples.length, 48);
  assert.equal(report.originalSamples[17].ph, 6);
  assert.equal(report.derivedSamples[17].ph, null);
  assert.deepEqual(report.quality.findings.find((f) => f.channel === 'ph').sampleIndices, [17]);
  assert.equal(report.model.patternScore, null);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  trace.samples[17].ph = 7;
  assert.equal(report.originalSamples[17].ph, 6);
});

test("reports reject results belonging to another recording instead of combining unrelated provenance", () => {
  const a = parseCSV(csv(24), 'a.csv');
  const b = createSyntheticTrace('change', 99);
  assert.throws(() => createReport(a, analyzeExperiment(b)));
  assert.throws(() => createReport(b, analyzeExperiment(a)));
});

test("reports reject a fabricated analysis object even when its trace reference is genuine", () => {
  const trace = parseCSV(csv(24));
  const real = analyzeExperiment(trace);
  const fabricated = { ...clone(real), trace };
  assert.throws(() => createReport(trace, fabricated));
});

test("reports preserve analyzed evidence or reject a source edited after analysis", () => {
  const trace = parseCSV(csv(24));
  const result = analyzeExperiment(trace);
  trace.samples[0].temperature = 33;
  let report;
  try { report = createReport(trace, result); }
  catch (error) { assert.ok(error instanceof Error); return; }
  assert.equal(report.originalSamples[0].temperature, 32);
  assert.equal(report.derivedSamples[0].temperature, 32);
});

test("reports do not present user-supplied benchmark counts as executed benchmark evidence", () => {
  const trace = parseCSV(csv());
  const result = analyzeExperiment(trace);
  const fabricated = clone(runBenchmark({ cases: 10 }));
  fabricated.counts.tp = 999;
  assert.throws(() => createReport(trace, result, fabricated));
});

test("reports never retain a forged imported score or synthetic decision", () => {
  const trace = parseCSV(csv(24));
  const result = analyzeExperiment(trace);
  result.patternScore = 0.99;
  result.modelStatus = 'Synthetic pattern score available';
  result.decision = { action: 'review', label: 'Synthetic pattern review', rationale: 'Claim from a forged score' };
  let report;
  try { report = createReport(trace, result); }
  catch (error) { assert.ok(error instanceof Error); return; }
  assert.equal(report.model.patternScore, null);
  assert.equal(report.decision.action, 'record');
  assert.doesNotMatch(report.decision.label, /synthetic|pattern/i);
});

test("reports preserve the protocol that actually produced the analysis", () => {
  const trace = parseCSV(csv(24));
  const analyzedProtocol = clone(DEFAULT_PROTOCOL);
  const result = analyzeExperiment(trace, { type: 'none' }, analyzedProtocol);
  const unrelatedProtocol = clone(DEFAULT_PROTOCOL);
  unrelatedProtocol.maxGapSeconds = 99;
  let report;
  try { report = createReport(trace, result, null, unrelatedProtocol); }
  catch (error) { assert.ok(error instanceof Error); return; }
  assert.equal(report.protocol.maxGapSeconds, analyzedProtocol.maxGapSeconds);
});

test("an exported report is a snapshot when external protocol and benchmark objects change", () => {
  const trace = parseCSV(csv());
  const protocol = clone(DEFAULT_PROTOCOL);
  const result = analyzeExperiment(trace, { type: 'none' }, protocol);
  const benchmark = runBenchmark({ cases: 10, protocol });
  const report = createReport(trace, result, benchmark, protocol);
  const original = clone(report);
  try { protocol.maxGapSeconds = 99; benchmark.counts.tp = 999; }
  catch (error) { assert.ok(error instanceof TypeError); }
  assert.deepEqual(report, original);
});
