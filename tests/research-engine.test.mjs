import test from "node:test";
import assert from "node:assert/strict";
import {
  RESEARCH_VERSION, DEFAULT_PROFILE, DEFAULT_COMPARISON, scanCSV,
  suggestProfile, validateProfile, parseMappedCSV, validateResearchProtocol,
  serializeProtocol, restoreProtocol, validateComparisonOptions,
  compareRecordings, describeFinding, serializeWorkspace, restoreWorkspace,
} from "../research-engine.js";
import { analyzeExperiment, DEFAULT_PROTOCOL, createSyntheticTrace } from "../lab-engine.js";

const copy = (value) => structuredClone(value);
const profile = (unit = "C", timeUnit = "s") => ({
  name: "Temperature sensor", timeColumn: "elapsed", timeUnit,
  channels: { temperature: { column: "reading", unit } },
});
const protocol = () => ({
  name: "Independent measurement protocol", revision: "1", channels: ["temperature"],
  ranges: copy(DEFAULT_PROTOCOL.ranges), spikes: copy(DEFAULT_PROTOCOL.spikes),
  maxGapSeconds: 2,
});
const samples = (values = [32, 32, 32, 32, 32]) => values.map((temperature, t) => ({
  t, temperature, moisture: null, ph: null, glucose: null,
}));
const trace = (values, extra = {}) => ({
  id: "independent-recording", name: "independent.csv", kind: "imported",
  origin: "User-supplied experiment; provenance unverified", channels: ["temperature"],
  units: { temperature: "°C" }, samples: samples(values), ...extra,
});
const mapped = () => parseMappedCSV("elapsed,reading\n0,32\n1,32\n2,32", profile());
const csv = (values, elapsed = [0, 1, 2]) => "elapsed,reading\n"
  + values.map((value, i) => `${elapsed[i]},${value}`).join("\n");
const workspace = (original = mapped()) => ({
  trace: original, derivedSamples: copy(original.samples), operations: [],
  protocol: protocol(), profile: profile(), reference: null,
  comparisonOptions: copy(DEFAULT_COMPARISON),
});
const assertCounts = (result, expected) => {
  assert.deepEqual(result.counts, expected);
  assert.equal(Object.values(result.counts).reduce((sum, value) => sum + value, 0), result.pairs.length);
};

test("optional channels remain absent rather than fake zero readings or four-channel QC dropouts", () => {
  const result = mapped();
  assert.equal(RESEARCH_VERSION, "2.0.0");
  assert.equal(result.kind, "imported");
  assert.deepEqual(result.channels, ["temperature"]);
  assert.equal(result.samples[0].temperature, 32);
  for (const key of ["moisture", "ph", "glucose"]) assert.equal(result.samples[0][key], null);
  const analysis = analyzeExperiment(result, { type: "none" }, protocol());
  assert.equal(analysis.quality.valid, true);
  assert.equal(analysis.patternScore, null);
  assert.match(analysis.modelStatus, /disabled.*imported/i);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.samples[0]));
});

test("selected-channel blanks remain null and are different from legitimate zero", () => {
  const result = parseMappedCSV(csv(["", 0, "3.2e1"]), profile());
  assert.equal(result.samples[0].temperature, null);
  assert.equal(result.samples[1].temperature, 0);
  assert.equal(result.samples[2].temperature, 32);
  const analysis = analyzeExperiment(result, { type: "none" }, protocol());
  assert.ok(analysis.quality.findings.some((finding) => finding.code === "missing"
    && finding.channel === "temperature" && finding.sampleIndices.includes(0)));
  assert.ok(analysis.quality.findings.every((finding) => finding.channel === null || finding.channel === "temperature"));
});

test("declared physical units convert correctly without changing source text", () => {
  const fahrenheit = parseMappedCSV(csv([32, 68, 104]), profile("F"));
  assert.deepEqual(fahrenheit.samples.map((sample) => sample.temperature), [0, 20, 40]);
  const kelvin = parseMappedCSV(csv([273.15, 293.15, 313.15]), profile("K"));
  kelvin.samples.forEach((sample, i) => assert.ok(Math.abs(sample.temperature - i * 20) < 1e-10));
  const fraction = {
    name: "Wetness fraction", timeColumn: "elapsed", timeUnit: "ms",
    channels: { moisture: { column: "reading", unit: "fraction" } },
  };
  const converted = parseMappedCSV(csv([0, 0.5, 1], [0, 1000, 2000]), fraction);
  assert.deepEqual(converted.samples.map((sample) => sample.t), [0, 1, 2]);
  assert.deepEqual(converted.samples.map((sample) => sample.moisture), [0, 50, 100]);
  assert.equal(converted.samples[1].temperature, null);
});

test("mapping rejects dimension mismatches, implicit time conversion and reused source columns", () => {
  for (const unit of ["V", "%", "celsius", "", null]) assert.throws(() => validateProfile(profile(unit)));
  assert.throws(() => validateProfile(profile("C", "min")));
  assert.throws(() => validateProfile({ ...profile(), channels: {} }));
  assert.throws(() => validateProfile({ ...profile(), channels: { temperature: { column: "elapsed", unit: "C" } } }));
  assert.throws(() => validateProfile({ ...profile(), channels: {
    temperature: { column: "reading", unit: "C" }, moisture: { column: "reading", unit: "%" },
  } }));
  assert.throws(() => validateProfile(profile(), ["elapsed", "different"]));
  assert.throws(() => validateProfile({ ...profile(), unknown: 1 }));
  assert.throws(() => validateProfile({ ...profile(), channels: { temperature: { column: "reading", unit: "C", extra: 1 } } }));
});

test("header suggestions use only existing columns and recognize declared milliseconds and Fahrenheit", () => {
  const headers = ["Time [ms]", "temperature_f", "unrelated"];
  const suggested = suggestProfile(headers);
  assert.ok(suggested);
  assert.equal(suggested.timeColumn, "Time [ms]");
  assert.equal(suggested.timeUnit, "ms");
  assert.equal(suggested.channels.temperature.column, "temperature_f");
  assert.equal(suggested.channels.temperature.unit, "F");
  assert.ok(Object.values(suggested.channels).every((mapping) => headers.includes(mapping.column)));
  assert.equal(suggestProfile(["unrelated", "unknown"]), null);
  assert.deepEqual(validateProfile(DEFAULT_PROFILE).channels, DEFAULT_PROFILE.channels);
});

test("mapped parser obeys quoted CSV grammar and preserves multiline metadata while ignoring unused columns", () => {
  const text = '\uFEFFreading,elapsed,notes\r\n"32",0,"comma, line\r\n and ""quote"""\r\n32,1,plain\r\n32,2,plain\r\n';
  const scanned = scanCSV(text);
  assert.deepEqual(scanned.headers, ["reading", "elapsed", "notes"]);
  assert.match(scanned.rows[0][2], /comma, line\r?\n and "quote"/);
  assert.deepEqual(parseMappedCSV(text, profile()).samples, samples([32, 32, 32]));
  for (const row of ['0,"3"2', '0,3"2"', '0,"32"junk', '0,"never closed']) {
    assert.throws(() => scanCSV(`elapsed,reading\n${row}\n1,32\n2,32`));
  }
  assert.throws(() => parseMappedCSV('elapsed,reading\n0,32\n,\n1,32\n2,32', profile()),
    'a delimiter-only data row cannot disappear as a blank physical line');
  assert.equal(parseMappedCSV('elapsed,reading\n\n0,32\n\n1,32\n2,32\n\n', profile()).samples.length, 3);
});

test("mapped parser rejects nonfinite and implicit numeric forms plus duplicate or reversed times", () => {
  for (const value of ["NaN", "Infinity", "-Infinity", "1e309", "0x20", "32junk"]) {
    assert.throws(() => parseMappedCSV(csv([value, 32, 32]), profile()));
  }
  for (const elapsed of [[0, 0, 2], [0, 2, 1], [-1, 0, 1], ["", 1, 2]]) {
    assert.throws(() => parseMappedCSV(csv([32, 32, 32], elapsed), profile()));
  }
  assert.throws(() => parseMappedCSV(csv([1e308, 32, 32]), {
    ...profile(), channels: { moisture: { column: "reading", unit: "fraction" } },
  }));
});

test("CSV scanner enforces row, column, field, header and UTF-8 byte boundaries", () => {
  const limitRows = "elapsed,reading\n" + Array.from({ length: 5000 }, (_, i) => `${i},32`).join("\n");
  assert.equal(scanCSV(limitRows).rows.length, 5000);
  assert.throws(() => scanCSV(`${limitRows}\n5000,32`));
  assert.throws(() => scanCSV("elapsed,elapsed\n0,0\n1,1\n2,2"));
  assert.throws(() => scanCSV("elapsed,\n0,32\n1,32\n2,32"));
  assert.throws(() => scanCSV("elapsed,reading\n0,32\n1,32,extra\n2,32"));
  assert.throws(() => scanCSV("elapsed,reading\n0,32\n1,32"));
  const wide = Array.from({ length: 17 }, (_, i) => `h${i}`);
  assert.throws(() => scanCSV([wide.join(","), ...Array(3).fill(wide.map(() => "1").join(","))].join("\n")));
  const fieldCSV = (length) => `elapsed,reading,notes\n0,32,${"x".repeat(length)}\n1,32,ok\n2,32,ok`;
  assert.equal(scanCSV(fieldCSV(256)).rows.length, 3);
  assert.throws(() => scanCSV(fieldCSV(257)));
  const multibyte = "elapsed,reading,notes\n" + Array.from({ length: 3000 }, (_, i) => `${i},32,${"é".repeat(175)}`).join("\n");
  assert.ok(multibyte.length < 1048576);
  assert.ok(Buffer.byteLength(multibyte) > 1048576);
  assert.throws(() => scanCSV(multibyte));
  const malformedUnicode = "elapsed,reading,notes\n" + Array.from({ length: 4500 }, (_, i) => `${i},32,${"\ud800界".repeat(100)}`).join("\n");
  assert.ok(Buffer.byteLength(malformedUnicode) > 1048576);
  assert.throws(() => scanCSV(malformedUnicode), 'UTF-8 byte accounting must follow replacement encoding for unpaired surrogates');
});

test("profiles freeze normalized copies, remain plain text and reject prototype pollution", () => {
  const input = profile();
  input.name = '<img src=x onerror="alert(1)">';
  const normalized = validateProfile(input);
  assert.equal(normalized.name, input.name);
  input.channels.temperature.column = "edited";
  assert.equal(normalized.channels.temperature.column, "reading");
  assert.ok(Object.isFrozen(normalized.channels.temperature));
  const malicious = JSON.parse('{"name":"test","timeColumn":"elapsed","timeUnit":"s","channels":{"__proto__":{"polluted":true},"temperature":{"column":"reading","unit":"C"}}}');
  assert.throws(() => validateProfile(malicious));
  assert.equal({}.polluted, undefined);
  assert.throws(() => validateProfile({ ...profile(), name: "x".repeat(97) }));
});

test("import fingerprints are deterministic while source content and unit interpretation remain distinguishable", () => {
  const text = csv([32, 33, 34]);
  const first = parseMappedCSV(text, profile());
  assert.equal(first.id, parseMappedCSV(text, profile()).id);
  assert.notEqual(first.id, parseMappedCSV(csv([32, 33, 35]), profile()).id);
  assert.notEqual(first.id, parseMappedCSV(text, profile("F")).id);
});

test("recording filenames retain provenance separately from profile labels and obey their own length bound", () => {
  const name = '<img src=x onerror="alert(1)">.csv';
  assert.equal(parseMappedCSV(csv([32, 32, 32]), profile(), name).name, name);
  assert.equal(parseMappedCSV(csv([32, 32, 32]), profile(), "x".repeat(256)).name.length, 256);
  assert.throws(() => parseMappedCSV(csv([32, 32, 32]), profile(), "x".repeat(257)));
});

test("protocols validate before analysis and retain name, revision, selected channels and exact assumptions", () => {
  const p = protocol();
  p.ranges.temperature = [-10, 50];
  p.spikes.temperature = 2;
  p.maxGapSeconds = 60;
  const restored = restoreProtocol(serializeProtocol(p, profile()));
  assert.deepEqual(restored.protocol, validateResearchProtocol(p));
  assert.deepEqual(restored.profile, validateProfile(profile()));
  assert.ok(Object.isFrozen(restored.protocol.ranges.temperature));
  p.ranges.temperature[0] = -99;
  assert.equal(restored.protocol.ranges.temperature[0], -10);
  for (const change of [
    { channels: [] }, { channels: ["temperature", "temperature"] }, { channels: ["bad"] },
    { maxGapSeconds: 0 }, { maxGapSeconds: NaN }, { flatline: "false" },
    { revision: "x".repeat(33) }, { extra: true },
  ]) assert.throws(() => validateResearchProtocol({ ...protocol(), ...change }));
  const badRange = protocol(); badRange.ranges.ph = [10, 4];
  assert.throws(() => validateResearchProtocol(badRange));
  const badSpike = protocol(); badSpike.spikes.temperature = Infinity;
  assert.throws(() => validateResearchProtocol(badSpike));
});

test("protocol restore rejects forged envelopes, extra fields, versions and oversized JSON", () => {
  const original = JSON.parse(serializeProtocol(protocol(), profile()));
  for (const change of [{ schema: "anything" }, { version: "9.0.0" }, { forged: true }]) {
    assert.throws(() => restoreProtocol(JSON.stringify({ ...original, ...change })));
  }
  assert.throws(() => restoreProtocol("{bad"));
  assert.throws(() => restoreProtocol(" ".repeat(32769)));
});

test("legitimate joint trends are within tolerance instead of being called sensor drift", () => {
  const values = Array.from({ length: 20 }, (_, i) => 30 + i * 0.2);
  const a = trace(values);
  const b = trace(values, { id: "reference", name: "reference.csv" });
  const result = compareRecordings(a, b);
  assert.equal(result.decision, "within-tolerance");
  assertCounts(result, { within: 20, exceeds: 0, uncertain: 0, unavailable: 0 });
  assert.equal(result.summary.rmse, 0);
  assert.equal(result.summary.meanDelta, 0);
  assert.equal(result.coverage, 1);
  assert.equal(result.findings.length, 0);
  assert.match(result.scope, /unverified/i);
  assert.ok(Object.isFrozen(result.pairs[0]));
  assert.deepEqual(a.samples.map((sample) => sample.temperature), values);
});

test("uncertainty intervals have inclusive within boundaries, strict exceeds boundaries and honest ambiguity", () => {
  const options = { tolerance: 1, uncertainty: 0.25 };
  const result = compareRecordings(trace([32.75, 33.25, 33.2500001]), trace([32, 32, 32]), options);
  assert.deepEqual(result.pairs.map((pair) => pair.status), ["within", "uncertain", "exceeds"]);
  assert.equal(result.decision, "discrepancy");
  assertCounts(result, { within: 1, exceeds: 1, uncertain: 1, unavailable: 0 });
  assert.deepEqual(result.findings[0].sampleIndices, [2]);
  assert.deepEqual(result.findings[0].referenceIndices, [2]);
  const allAmbiguous = compareRecordings(trace([32, 32, 32]), trace([32, 32, 32]), { tolerance: 0.5, uncertainty: 0.6 });
  assert.equal(allAmbiguous.decision, "inconclusive");
  assertCounts(allAmbiguous, { within: 0, exceeds: 0, uncertain: 3, unavailable: 0 });
});

test("smooth differences from reference are measured with signed deltas and exact paired evidence", () => {
  const result = compareRecordings(trace([32, 32.5, 33, 33.5, 34]), trace([32, 32, 32, 32, 32]));
  assert.equal(result.decision, "discrepancy");
  assert.deepEqual(result.pairs.map((pair) => pair.delta), [0, 0.5, 1, 1.5, 2]);
  assert.equal(result.summary.firstDelta, 0);
  assert.equal(result.summary.lastDelta, 2);
  assert.equal(result.summary.meanDelta, 1);
  assert.ok(Math.abs(result.summary.rmse - Math.sqrt(1.5)) < 1e-12);
  assert.equal(result.summary.maxAbsDelta, 2);
  assert.ok(result.findings.every((finding) => finding.code === "reference-discrepancy"
    && finding.sampleIndices.every((i) => result.pairs[i].status === "exceeds")));
});

test("alignment uses declared offset, nearest actual timestamps and no extrapolation", () => {
  const a = trace([32, 32, 32], { samples: samples([32, 32, 32]).map((sample) => ({ ...sample, t: sample.t + 10 })) });
  const b = trace([32, 32, 32]);
  assert.equal(compareRecordings(a, b, { timeOffsetSeconds: 10 }).decision, "within-tolerance");
  const noOverlap = compareRecordings(a, b);
  assert.equal(noOverlap.decision, "inconclusive");
  assertCounts(noOverlap, { within: 0, exceeds: 0, uncertain: 0, unavailable: 3 });
  assert.equal(noOverlap.coverage, 0);
  for (const value of Object.values(noOverlap.summary)) if (typeof value !== "number") assert.equal(value, null);
  assert.equal(noOverlap.summary.matched, 0);
  const shifted = trace([32, 32, 32], { samples: samples([32, 32, 32]).map((sample) => ({ ...sample, t: sample.t + 0.2 })) });
  assert.equal(compareRecordings(shifted, b, { maxMatchDistance: 0.25 }).summary.matched, 3);
  assert.equal(compareRecordings(shifted, b, { maxMatchDistance: 0.1 }).summary.matched, 0);
});

test("a reference reading cannot be reused to fabricate full alignment coverage", () => {
  const a = trace([32, 32, 32], { samples: samples([32, 32, 32]).map((sample, i) => ({ ...sample, t: i / 10 })) });
  const b = trace([32, 32, 32]);
  const result = compareRecordings(a, b, { maxMatchDistance: 0.25 });
  const matched = result.pairs.filter((pair) => pair.status !== "unavailable");
  assert.equal(new Set(matched.map((pair) => pair.referenceIndex)).size, matched.length);
  assert.ok(result.coverage < 1);
  assert.equal(result.decision, "inconclusive");
});

test("reference missing readings and abrupt steps stay unavailable while benign neighbors remain usable", () => {
  const missing = compareRecordings(trace([32, 32, 32, 32, 32]), trace([32, null, 32, 32, 32]), { minCoverage: 0.6 });
  assert.equal(missing.pairs[1].status, "unavailable");
  assert.equal(missing.pairs[0].status, "within");
  assert.equal(missing.pairs[4].status, "within");
  assert.ok(missing.summary.matched >= 3);
  const stepped = compareRecordings(trace([32, 32, 40, 40, 40]), trace([32, 32, 40, 40, 40]));
  assert.equal(stepped.pairs[1].status, "unavailable");
  assert.equal(stepped.pairs[2].status, "unavailable");
  assert.match(stepped.pairs[1].reason, /reference-step/i);
  assert.equal(stepped.decision, "inconclusive");
});

test("insufficient coverage retains discrepancy counts but cannot issue confident discrepancy findings", () => {
  const a = trace([35, 35, 35, 35, 35]);
  const b = trace([32, 32, 32, null, null]);
  const result = compareRecordings(a, b, { minCoverage: 0.8 });
  assert.equal(result.decision, "inconclusive");
  assert.equal(result.counts.exceeds, 3);
  assert.equal(result.coverage, 0.6);
  assert.equal(result.findings.length, 0);
  assert.ok(result.pairs.slice(0, 3).every((pair) => pair.status === "exceeds"));
});

test("repeat role describes measured change without certifying a sensor fault or calibration", () => {
  const result = compareRecordings(trace([35, 35, 35]), trace([32, 32, 32]), { role: "repeat" });
  assert.equal(result.options.role, "repeat");
  assert.equal(result.decision, "discrepancy");
  assert.match(result.scope, /repeat|unverified/i);
  assert.doesNotMatch(JSON.stringify(result.findings), /diagnosis|treatment|certified|sensor fault confirmed/i);
});

test("comparison rejects absent channels, dishonest numeric fields, malformed time and invalid settings", () => {
  const a = trace([32, 32, 32]);
  assert.throws(() => compareRecordings(a, { ...a, channels: ["ph"] }));
  for (const value of [NaN, Infinity, "32", {}, true]) {
    const bad = copy(a); bad.samples[1].temperature = value;
    assert.throws(() => compareRecordings(bad, a));
  }
  const badTime = copy(a); badTime.samples[1].t = 0;
  assert.throws(() => compareRecordings(badTime, a));
  for (const options of [
    { tolerance: 0 }, { tolerance: -1 }, { uncertainty: -1 }, { uncertainty: NaN },
    { maxMatchDistance: -1 }, { minCoverage: 0 }, { minCoverage: 1.01 },
    { minPairs: 2 }, { minPairs: 3.5 }, { minPairs: 5001 }, { role: "calibrated" },
    { timeOffsetSeconds: Infinity }, { extra: true }, { maxReferenceStep: 0 },
  ]) assert.throws(() => validateComparisonOptions(options));
  assert.equal(validateComparisonOptions({ uncertainty: 0 }).uncertainty, 0);
  assert.equal(validateComparisonOptions({ maxMatchDistance: 0 }).maxMatchDistance, 0);
  assert.throws(() => compareRecordings(a, a, { extra: true }));
  assert.throws(() => compareRecordings({ ...a, channels: ["temperature", "fake"] }, a));
  const multi = copy(a);
  multi.channels = ["temperature", "ph"];
  multi.samples[0].ph = "6";
  assert.throws(() => compareRecordings(multi, a), "bad declared readings must not escape validation just because another channel is being compared");
});

test("extreme finite readings cannot escape as Infinity or NaN in comparison evidence and summary", () => {
  const a = trace([1e308, 1e308, 1e308]);
  const b = trace([-1e308, -1e308, -1e308]);
  let result;
  try { result = compareRecordings(a, b); }
  catch (error) { assert.ok(error instanceof Error); return; }
  const inspectFinite = (value) => {
    if (typeof value === "number") assert.ok(Number.isFinite(value), "every exported numeric value must remain finite");
    else if (value && typeof value === "object") Object.values(value).forEach(inspectFinite);
  };
  inspectFinite(result);
});

test("finding explanations cite exact original values, range assumptions and neighboring readings", () => {
  const data = samples([32, 48, 32]);
  const finding = { code: "range", channel: "temperature", sampleIndices: [1], message: "range" };
  const explained = describeFinding(finding, data, protocol());
  assert.equal(explained.evidence.length, 1);
  assert.equal(explained.evidence[0].index, 1);
  assert.equal(explained.evidence[0].time, 1);
  assert.equal(explained.evidence[0].value, 48);
  assert.match(`${explained.rule} ${explained.explanation}`, /20/);
  assert.match(`${explained.rule} ${explained.explanation}`, /45/);
  assert.doesNotMatch(explained.nextStep, /patient|doctor|treatment|infection/i);
  assert.ok(Object.isFrozen(explained.evidence[0]));
  assert.throws(() => describeFinding({ ...finding, sampleIndices: [-1] }, data, protocol()));
  assert.throws(() => describeFinding({ ...finding, sampleIndices: [3] }, data, protocol()));
});

test("finding explanations preserve a selected missing reading and a true timestamp gap", () => {
  const missing = describeFinding({ code: "missing", channel: "temperature", sampleIndices: [1] }, samples([32, null, 32]), protocol());
  assert.equal(missing.evidence[0].value, null);
  const data = samples([32, 32, 32]); data[2].t = 5;
  const gap = describeFinding({ code: "time-gap", channel: null, sampleIndices: [1, 2] }, data, protocol());
  assert.deepEqual(gap.evidence.map((row) => row.time), [1, 5]);
  assert.match(`${gap.rule} ${gap.explanation}`, /4/);
});

test("workspace roundtrip preserves exact originals, derived nulls, protocol, profile and independent reference", () => {
  const original = mapped();
  const input = workspace(original);
  input.derivedSamples[1].temperature = null;
  input.operations = [{ type: "dropout", channel: "temperature", index: 1, before: 32, after: null, seed: 0 }];
  input.reference = trace([32, 32, 32, 32]);
  const result = restoreWorkspace(serializeWorkspace(input));
  assert.equal(result.trace.kind, "imported");
  assert.match(result.trace.origin, /restored|unverified|user.supplied/i);
  assert.deepEqual(result.trace.samples, original.samples);
  assert.equal(result.derivedSamples[1].temperature, null);
  assert.equal(result.trace.samples[1].temperature, 32);
  assert.equal(result.operations[0].seed, 0);
  assert.equal(result.reference.samples.length, 4);
  assert.equal(result.reference.kind, "imported");
  assert.ok(Object.isFrozen(result.trace.samples[0]));
  const analysis = analyzeExperiment(result.trace, { type: "none" }, result.protocol);
  assert.equal(analysis.patternScore, null);
});

test("even a genuine synthetic trace loses synthetic classifier ownership after workspace restoration", () => {
  const original = createSyntheticTrace("stable", 42);
  const result = restoreWorkspace(serializeWorkspace({
    trace: original, derivedSamples: copy(original.samples), operations: [],
    protocol: { ...protocol(), channels: ["temperature", "moisture", "ph", "glucose"] },
    profile: DEFAULT_PROFILE, reference: original, comparisonOptions: DEFAULT_COMPARISON,
  }));
  assert.equal(result.trace.kind, "imported");
  assert.equal(result.reference.kind, "imported");
  assert.equal(analyzeExperiment(result.trace, { type: "none" }, result.protocol).patternScore, null);
  assert.equal(analyzeExperiment(result.reference, { type: "none" }, result.protocol).patternScore, null);
});

test("trusted synthetic ownership cannot score foreign samples through the restored-array analysis path", () => {
  const original = createSyntheticTrace("stable", 42);
  const foreign = copy(original.samples);
  foreign[0].temperature = 34;
  assert.throws(() => analyzeExperiment(original, { type: "none" }, DEFAULT_PROTOCOL, null, {
    samples: foreign, operations: [],
  }));
});

test("workspace restore rejects fabricated schema/version, extra metadata, malformed readings and operations", () => {
  const base = JSON.parse(serializeWorkspace(workspace()));
  for (const change of [{ schema: "forged" }, { version: "9.0.0" }, { extra: true }]) {
    assert.throws(() => restoreWorkspace(JSON.stringify({ ...base, ...change })));
  }
  for (const mutate of [
    (bundle) => { bundle.trace.samples[1].t = 0; },
    (bundle) => { bundle.trace.samples[1].temperature = "32"; },
    (bundle) => { bundle.derivedSamples.pop(); },
    (bundle) => { bundle.trace.name = "x".repeat(257); },
    (bundle) => { bundle.operations = [{ type: "unrecognized", channel: "temperature", index: 0 }]; },
    (bundle) => { bundle.operations = [{ type: "dropout", channel: "__proto__", index: 0 }]; },
    (bundle) => { bundle.operations = [{ type: "dropout", channel: "temperature", index: -1 }]; },
    (bundle) => { bundle.operations = [{ type: "dropout", channel: "temperature", index: 3 }]; },
    (bundle) => { bundle.operations = [{ type: "dropout", channel: "temperature", index: 0, seed: -1 }]; },
    (bundle) => { bundle.operations = [{ type: "dropout", channel: "temperature", index: 0, seed: 4294967296 }]; },
    (bundle) => { bundle.operations = [{ type: "drift", channel: "temperature", index: 0, affectedIndices: [3] }]; },
    (bundle) => { bundle.operations = [{ type: "dropout", channel: "temperature", index: 0, arbitrary: true }]; },
    (bundle) => { bundle.comparisonOptions.extra = true; },
    (bundle) => { bundle.trace.execute = "untrusted metadata"; },
    (bundle) => { bundle.trace.channels = ["temperature", "temperature"]; },
    (bundle) => { bundle.trace.channels = []; },
    (bundle) => { bundle.trace.importProfile.unknown = true; },
  ]) {
    const changed = copy(base); mutate(changed);
    assert.throws(() => restoreWorkspace(JSON.stringify(changed)));
  }
  assert.throws(() => restoreWorkspace(" ".repeat(4194305)));
  assert.equal({}.polluted, undefined);
});

test("workspace null operations and declared 256-character filenames are valid roundtrip inputs", () => {
  const input = workspace(parseMappedCSV(csv([32, 32, 32]), profile(), "x".repeat(256)));
  input.operations = [{ type: "none", channel: "temperature", index: 0, before: null, after: null, seed: 0 }];
  const result = restoreWorkspace(serializeWorkspace(input));
  assert.equal(result.trace.name.length, 256);
  assert.equal(result.operations[0].before, null);
  assert.equal(result.operations[0].after, null);
});

test("workspace serialized snapshots are independent of later caller mutation", () => {
  const input = workspace();
  const text = serializeWorkspace(input);
  input.derivedSamples[0].temperature = 99;
  input.protocol.ranges.temperature[0] = -99;
  const result = restoreWorkspace(text);
  assert.equal(result.derivedSamples[0].temperature, 32);
  assert.equal(result.protocol.ranges.temperature[0], 20);
});
