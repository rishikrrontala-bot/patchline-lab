// Patchline Lab — Next Founders edition
// Browser-only research sensor validation tool.
// No backend, no API calls, no patient data, no diagnosis or treatment.
// Built by Rishik Rontala. Model is a coding assistant only, not required by the delivered app.

import {
  generateScenario,
  trainSyntheticModel,
  analyze as originalAnalyze,
} from "./engine.js";

export const VERSION = "2.0.0";

export const CHANNELS = [
  { key: "temperature", name: "Temperature", unit: "°C" },
  { key: "moisture", name: "Dressing wetness", unit: "%" },
  { key: "ph", name: "Fluid pH", unit: "pH" },
  { key: "glucose", name: "Experimental glucose", unit: "AU" },
];

export const DEFAULT_PROTOCOL = {
  ranges: {
    temperature: [20, 45],
    moisture: [0, 100],
    ph: [4, 10],
    glucose: [0, 100],
  },
  spikes: {
    temperature: 1.1,
    moisture: 8,
    ph: 0.45,
    glucose: 8,
  },
  maxGapSeconds: 2,
};

export const LIMITS = {
  maxBytes: 1048576,
  maxRows: 5000,
  maxField: 256,
  maxColumns: 8,
};

const CHANNEL_KEYS = CHANNELS.map((c) => c.key);

const OWNED_TRACES = new WeakSet();
const ANALYSES = new WeakMap();
const BENCHMARKS = new WeakSet();
const copyJSON = (value) => JSON.parse(JSON.stringify(value));
function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function cloneSamples(samples) {
  return samples.map((s) => {
    const copy = { t: s.t };
    for (const k of CHANNEL_KEYS) {
      copy[k] = s[k] === undefined ? null : s[k];
    }
    return copy;
  });
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateProtocol(protocol) {
  if (!isPlainObject(protocol)) throw new TypeError("Invalid protocol");
  if (!isPlainObject(protocol.ranges)) throw new TypeError("Invalid protocol ranges");
  if (!isPlainObject(protocol.spikes)) throw new TypeError("Invalid protocol spikes");
  for (const key of CHANNEL_KEYS) {
    const r = protocol.ranges[key];
    if (!Array.isArray(r) || r.length !== 2 || !Number.isFinite(r[0]) || !Number.isFinite(r[1]) || r[0] > r[1]) {
      throw new TypeError(`Invalid range for ${key}`);
    }
    const s = protocol.spikes[key];
    if (!Number.isFinite(s) || s <= 0) throw new TypeError(`Invalid spike threshold for ${key}`);
  }
  const mg = protocol.maxGapSeconds;
  if (!Number.isFinite(mg) || mg <= 0) throw new TypeError("Invalid maxGapSeconds");
  if (protocol.channels !== undefined && (!Array.isArray(protocol.channels) || !protocol.channels.length || new Set(protocol.channels).size !== protocol.channels.length || protocol.channels.some(key => !CHANNEL_KEYS.includes(key)))) throw new TypeError("Invalid protocol channels");
}

// Strict CSV grammar: quotes start a field; nothing may follow a closing quote.
function parseCSVLine(text, start, len) {
  const fields = [];
  let i = start;
  let current = "";
  let state = "start";
  function append(ch) {
    current += ch;
    if (current.length > LIMITS.maxField) throw new Error("CSV field exceeds maximum length");
  }
  while (i < len) {
    const ch = text[i];
    if (state === "quoted") {
      if (ch === '"') {
        if (text[i + 1] === '"') { append('"'); i += 2; }
        else { state = "closed"; i++; }
      } else { append(ch); i++; }
      continue;
    }
    if (ch === ",") {
      fields.push(current);
      if (fields.length >= LIMITS.maxColumns) throw new Error("Too many CSV columns");
      current = ""; state = "start"; i++; continue;
    }
    if (ch === "\n" || ch === "\r") {
      i++;
      if (ch === "\r" && text[i] === "\n") i++;
      break;
    }
    if (state === "closed") throw new Error("Malformed quotes: text after closing quote");
    if (ch === '"') {
      if (state !== "start") throw new Error("Malformed quotes: quote inside unquoted field");
      state = "quoted"; i++;
    } else { append(ch); state = "unquoted"; i++; }
  }
  if (state === "quoted") throw new Error("Malformed quotes: unterminated quoted field");
  fields.push(current);
  return { fields, end: i };
}

function parseNumberStrict(raw) {
  if (raw === null || raw === undefined) return { value: null, blank: true };
  const trimmed = String(raw).trim();
  if (trimmed === "") return { value: null, blank: true };
  if (!/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid numeric value: ${raw}`);
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) throw new Error(`Non-finite numeric value: ${raw}`);
  return { value: num, blank: false };
}

export function parseCSV(text, filename = "experiment.csv") {
  if (typeof text !== "string") throw new TypeError("CSV text must be a string");
  if (text.length > LIMITS.maxBytes || new TextEncoder().encode(text).length > LIMITS.maxBytes) throw new Error(`Input exceeds max bytes (${LIMITS.maxBytes})`);

  let content = text;
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const len = content.length;
  if (len === 0) throw new Error("Empty CSV");

  let pos = 0;
  const headerRes = parseCSVLine(content, pos, len);
  pos = headerRes.end;
  const headers = headerRes.fields.map((h) => h.trim());

  const REQUIRED = ["timestamp_s", "temperature_c", "wetness_pct", "ph", "glucose_au"];
  const OPTIONAL = ["source", "notes"];
  const known = new Set([...REQUIRED, ...OPTIONAL]);

  for (const h of headers) {
    if (h.length > LIMITS.maxField) throw new Error(`Header field exceeds max length (${LIMITS.maxField})`);
  }
  if (headers.length > LIMITS.maxColumns) throw new Error(`Too many columns (max ${LIMITS.maxColumns})`);

  const seen = new Set();
  for (const h of headers) {
    if (seen.has(h)) throw new Error(`Duplicate header: ${h}`);
    seen.add(h);
  }
  for (const r of REQUIRED) {
    if (!seen.has(r)) throw new Error(`Missing required header: ${r}`);
  }
  for (const h of headers) {
    if (!known.has(h)) throw new Error(`Unknown header: ${h}`);
  }

  const colMap = {};
  headers.forEach((h, idx) => { colMap[h] = idx; });

  const samples = [];
  let prevTime = null;
  let rowCount = 0;

  while (pos < len) {
    if (content[pos] === "\n") { pos += 1; continue; }
    if (content[pos] === "\r") {
      pos += 1;
      if (pos < len && content[pos] === "\n") pos += 1;
      continue;
    }

    const rowRes = parseCSVLine(content, pos, len);
    pos = rowRes.end;
    const fields = rowRes.fields;

    if (fields.length === 1 && fields[0].trim() === "") continue;
    if (fields.length !== headers.length) throw new Error("Ragged row: field count mismatch");

    for (const f of fields) {
      if (f.length > LIMITS.maxField) throw new Error(`Field exceeds max length (${LIMITS.maxField})`);
    }

    rowCount += 1;
    if (rowCount > LIMITS.maxRows) throw new Error(`Too many rows (max ${LIMITS.maxRows})`);

    const timeRaw = fields[colMap["timestamp_s"]];
    const timeTrimmed = timeRaw.trim();
    if (timeTrimmed === "") throw new Error("Missing timestamp value");
    if (!/^\d+(?:\.\d+)?$/.test(timeTrimmed)) throw new Error(`Invalid timestamp: ${timeRaw}`);
    const t = Number(timeTrimmed);
    if (!Number.isFinite(t)) throw new Error(`Non-finite timestamp: ${timeRaw}`);
    if (t < 0) throw new Error(`Negative timestamp: ${t}`);
    if (prevTime !== null && t <= prevTime) throw new Error(`Invalid or duplicate/reversed time at row ${rowCount + 1}`);
    prevTime = t;

    const sample = { t };
    const channelFields = [
      ["temperature", "temperature_c"],
      ["moisture", "wetness_pct"],
      ["ph", "ph"],
      ["glucose", "glucose_au"],
    ];
    for (const [key, col] of channelFields) {
      const parsed = parseNumberStrict(fields[colMap[col]]);
      sample[key] = parsed.value;
    }
    samples.push(sample);
  }

  if (samples.length < 3) throw new Error("At least 3 samples required");

  const id = `imported-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

  return {
    id,
    name: filename,
    kind: "imported",
    origin: "User-supplied experiment; provenance unverified",
    units: {
      temperature: "°C",
      moisture: "%",
      ph: "pH",
      glucose: "AU",
    },
    samples,
  };
}

export function createSyntheticTrace(key = "stable", seed = 1) {
  const scenario = generateScenario(key);
  const baseSamples = scenario.samples;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError("Seed must be a 32-bit unsigned integer");
  const seedNum = seed >>> 0;

  let state = seedNum;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const noise = {
    temperature: 0.06,
    moisture: 0.5,
    ph: 0.025,
    glucose: 0.6,
  };

  const samples = baseSamples.map((s) => {
    const copy = { t: s.t };
    for (const k of CHANNEL_KEYS) {
      const perturbation = (next() - 0.5) * 2 * noise[k];
      copy[k] = Number.isFinite(s[k]) ? Number((s[k] + perturbation).toFixed(2)) : null;
    }
    return copy;
  });

  const trace = {
    id: `synthetic-${key}-${seedNum}`,
    name: scenario.label,
    kind: "synthetic",
    origin: `Generated synthetic trace (${key}); not patient data`,
    seed: seedNum,
    units: {
      temperature: "°C",
      moisture: "%",
      ph: "pH",
      glucose: "AU",
    },
    samples,
  };

  OWNED_TRACES.add(trace);
  return freezeDeep(trace);
}

export function inspectTrace(samples, protocol = DEFAULT_PROTOCOL) {
  validateProtocol(protocol);
  const selectedKeys = protocol.channels || CHANNEL_KEYS;
  const findings = [];
  const sampleCount = Array.isArray(samples) ? samples.length : 0;

  if (!Array.isArray(samples) || sampleCount === 0) {
    return { valid: false, findings, sampleCount };
  }

  const cloned = samples.map((s) => isPlainObject(s) ? ({ ...s }) : ({}));

  for (let i = 0; i < cloned.length; i++) {
    const s = cloned[i];
    if (!isPlainObject(s)) {
      findings.push({ code: "missing", channel: null, sampleIndices: [i], message: `Sample ${i + 1}: invalid reading set.` });
      continue;
    }
    if (!Number.isFinite(s.t) || s.t < 0) {
      findings.push({ code: "time-order", channel: null, sampleIndices: [i], message: `Sample ${i + 1}: invalid time.` });
    } else if (i > 0 && cloned[i - 1] && Number.isFinite(cloned[i - 1].t) && s.t <= cloned[i - 1].t) {
      findings.push({ code: "time-order", channel: null, sampleIndices: [i], message: `Sample ${i + 1}: time not strictly increasing.` });
    }

    for (const key of selectedKeys) {
      const value = s[key];
      if (value === null || value === undefined) {
        findings.push({ code: "missing", channel: key, sampleIndices: [i], message: `Sample ${i + 1}: ${key} is missing.` });
      } else if (typeof value !== "number" || !Number.isFinite(value)) {
        findings.push({ code: "missing", channel: key, sampleIndices: [i], message: `Sample ${i + 1}: ${key} is not a finite number.` });
      } else {
        const [min, max] = protocol.ranges[key];
        if (value < min || value > max) {
          findings.push({ code: "range", channel: key, sampleIndices: [i], message: `Sample ${i + 1}: ${key} value ${value} outside range [${min}, ${max}].` });
        }
      }
    }
  }

  for (let i = 1; i < cloned.length - 1; i++) {
    if (i > 0 && cloned[i - 1] && Number.isFinite(cloned[i - 1].t) && Number.isFinite(cloned[i].t) && cloned[i].t <= cloned[i - 1].t) continue;
    if (i < cloned.length - 1 && Number.isFinite(cloned[i + 1].t) && Number.isFinite(cloned[i].t) && cloned[i + 1].t <= cloned[i].t) continue;
    if (i > 0 && cloned[i].t - cloned[i - 1].t > protocol.maxGapSeconds) continue;
    if (i < cloned.length - 1 && cloned[i + 1].t - cloned[i].t > protocol.maxGapSeconds) continue;

    for (const key of selectedKeys) {
      const before = cloned[i - 1] ? cloned[i - 1][key] : undefined;
      const value = cloned[i][key];
      const after = cloned[i + 1] ? cloned[i + 1][key] : undefined;

      if (before === null || before === undefined || !Number.isFinite(before)) continue;
      if (after === null || after === undefined || !Number.isFinite(after)) continue;
      if (value === null || value === undefined || !Number.isFinite(value)) continue;

      const mid = (before + after) / 2;
      const limit = protocol.spikes[key];
      if (Math.abs(value - mid) > limit && Math.abs(before - after) < limit) {
        findings.push({ code: "spike", channel: key, sampleIndices: [i], message: `Sample ${i + 1}: isolated ${key} spike.` });
      }
    }
  }

  if (cloned.length >= 3) {
    const last = cloned.length - 1;
    const prev = cloned.length - 2;
    const prevPrev = cloned.length - 3;
    if (cloned[last] && cloned[prev] && cloned[prevPrev] &&
        Number.isFinite(cloned[last].t) && Number.isFinite(cloned[prev].t) &&
        cloned[last].t > cloned[prev].t && cloned[prev].t > cloned[prevPrev].t) {
      for (const key of selectedKeys) {
        const lv = cloned[last][key];
        const pv = cloned[prev][key];
        const ppv = cloned[prevPrev][key];
        if (lv === null || lv === undefined || !Number.isFinite(lv)) continue;
        if (pv === null || pv === undefined || !Number.isFinite(pv)) continue;
        if (ppv === null || ppv === undefined || !Number.isFinite(ppv)) continue;
        const limit = protocol.spikes[key];
        const finalStep = Math.abs(lv - pv);
        const previousStep = Math.abs(pv - ppv);
        if (finalStep > limit * 2 && previousStep < limit) {
          findings.push({ code: "spike", channel: key, sampleIndices: [last], message: `Sample ${last + 1}: abrupt ${key} endpoint.` });
        }
      }
    }
  }

  for (let i = 1; i < cloned.length; i++) {
    const prev = cloned[i - 1];
    const curr = cloned[i];
    if (!prev || !curr) continue;
    if (!Number.isFinite(prev.t) || !Number.isFinite(curr.t)) continue;
    if (curr.t <= prev.t) continue;
    const gap = curr.t - prev.t;
    if (gap > protocol.maxGapSeconds) {
      findings.push({ code: "time-gap", channel: null, sampleIndices: [i - 1, i], message: `Gap between samples ${i} and ${i + 1} exceeds ${protocol.maxGapSeconds}s.` });
    }
  }

  if (protocol.flatline !== undefined && protocol.flatline) {
    for (const key of selectedKeys) {
      let runStart = 0;
      for (let i = 1; i <= cloned.length; i++) {
        const prev = cloned[i - 1];
        const curr = i < cloned.length ? cloned[i] : null;
        const same = curr && prev && curr[key] === prev[key] && Number.isFinite(curr[key]);
        if (!same) {
          const runLen = i - runStart;
          if (runLen >= 5) {
            const indices = [];
            for (let j = runStart; j < i; j++) indices.push(j);
            findings.push({ code: "flatline", channel: key, sampleIndices: indices, message: `Samples ${runStart + 1}-${i}: ${key} held constant.` });
          }
          runStart = i;
        }
      }
    }
  }

  return { valid: findings.length === 0, findings, sampleCount };
}

export function applyFault(trace, options = {}) {
  if (!isPlainObject(trace)) throw new TypeError("Invalid trace");
  if (!Array.isArray(trace.samples)) throw new TypeError("Invalid trace samples");

  const type = options.type ?? "none";
  const channel = options.channel ?? "temperature";
  const index = options.index ?? 0;
  const severity = options.severity ?? 0;
  const seed = options.seed ?? 42;

  const validTypes = ["none", "dropout", "spike", "gap", "drift"];
  if (!validTypes.includes(type)) throw new TypeError(`Invalid fault type: ${type}`);
  if (!CHANNEL_KEYS.includes(channel)) throw new TypeError(`Invalid channel: ${channel}`);
  if (type !== "none" && type !== "gap" && trace.channels && !trace.channels.includes(channel)) throw new TypeError(`Channel ${channel} was not recorded`);
  if (!Number.isInteger(index) || index < 0 || index >= trace.samples.length) throw new RangeError(`Invalid index: ${index}`);
  if (!Number.isFinite(severity)) throw new TypeError(`Invalid severity: ${severity}`);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError("Seed must be a 32-bit unsigned integer");

  const samples = cloneSamples(trace.samples);
  const operations = [];
  let changed = false;

  if (type === "none") {
    operations.push({ type, channel, index, before: null, after: null, seed });
    return { samples, operations, changed: false };
  }

  if (type === "dropout") {
    const before = samples[index][channel];
    if (before === null) {
      operations.push({ type, channel, index, before: null, after: null, seed });
      return { samples, operations, changed: false };
    }
    samples[index][channel] = null;
    operations.push({ type, channel, index, before, after: null, seed });
    return { samples, operations, changed: true };
  }

  if (type === "spike") {
    if (severity === 0) throw new TypeError("Spike severity must be non-zero");
    const before = samples[index][channel];
    if (!Number.isFinite(before)) throw new TypeError(`Cannot spike a missing value at index ${index}`);
    const after = before + severity;
    if (!Number.isFinite(after)) throw new TypeError("Spike overflows numeric range");
    samples[index][channel] = after;
    operations.push({ type, channel, index, before, after, seed });
    return { samples, operations, changed: after !== before };
  }

  if (type === "gap") {
    if (severity <= 0) throw new TypeError("Gap severity must be positive");
    const before = samples[index].t;
    for (let i = index; i < samples.length; i++) {
      const after = samples[i].t + severity;
      if (!Number.isFinite(after)) throw new TypeError("Gap overflows numeric range");
      samples[i].t = after;
    }
    operations.push({ type, channel, index, before, after: samples[index].t, seed });
    return { samples, operations, changed: true };
  }

  if (type === "drift") {
    if (severity === 0) throw new TypeError("Drift severity must be non-zero");
    const n = samples.length - index;
    if (n < 1) throw new RangeError("Drift requires at least one sample from index");
    const before = samples[index][channel];
    if (!Number.isFinite(before)) throw new TypeError(`Cannot drift from a missing value at index ${index}`);
    for (let i = index; i < samples.length; i++) {
      const frac = (i - index) / Math.max(1, samples.length - 1 - index);
      const delta = severity * frac;
      if (samples[i][channel] === null) continue;
      if (!Number.isFinite(samples[i][channel])) throw new TypeError("Cannot drift non-finite readings");
      const after = samples[i][channel] + delta;
      if (!Number.isFinite(after)) throw new TypeError("Drift overflows numeric range");
      if (after !== samples[i][channel]) changed = true;
      samples[i][channel] = after;
    }
    operations.push({ type, channel, index, before, after: samples[samples.length - 1][channel], seed, affectedIndices: samples.map((row, i) => row[channel] !== trace.samples[i][channel] ? i : null).filter(i => i !== null) });
    return { samples, operations, changed };
  }

  throw new TypeError(`Unhandled fault type: ${type}`);
}

export function analyzeExperiment(trace, fault = { type: "none" }, protocol = DEFAULT_PROTOCOL, model = null, saved = null) {
  validateProtocol(protocol);

  if (!isPlainObject(trace)) throw new TypeError("Invalid trace");
  if (!Array.isArray(trace.samples)) throw new TypeError("Invalid trace samples");

  const isOwned = OWNED_TRACES.has(trace);
  const isImported = !isOwned;

  let faultResult;
  if (saved !== null) {
    if (isOwned) throw new TypeError("Restored arrays must remain imported measurements");
    if (!Array.isArray(saved.samples) || saved.samples.length !== trace.samples.length || saved.samples.length < 3 || saved.samples.length > LIMITS.maxRows) throw new TypeError("Invalid restored recording length");
    for (const [i, sample] of saved.samples.entries()) {
      if (!isPlainObject(sample) || !Number.isFinite(sample.t) || sample.t < 0 || (i > 0 && sample.t <= saved.samples[i - 1].t)) throw new TypeError("Invalid restored timestamp order");
      for (const key of CHANNEL_KEYS) if (sample[key] !== null && !Number.isFinite(sample[key])) throw new TypeError("Invalid restored reading");
    }
    if (!Array.isArray(saved.operations) || saved.operations.length > LIMITS.maxRows) throw new TypeError("Invalid restored operation descriptions");
    faultResult = { samples: cloneSamples(saved.samples), operations: copyJSON(saved.operations), changed: JSON.stringify(saved.samples) !== JSON.stringify(trace.samples) };
  } else faultResult = applyFault(trace, fault);
  const quality = inspectTrace(faultResult.samples, protocol);

  const evidenceIndices = [];
  const seen = new Set();
  for (const f of quality.findings) {
    for (const idx of f.sampleIndices) {
      if (!seen.has(idx)) { seen.add(idx); evidenceIndices.push(idx); }
    }
  }

  let patternScore = null;
  let modelStatus = "Disabled for imported measurements";
  let decision;

  if (isImported) {
    patternScore = null;
    modelStatus = "Disabled for imported measurements";
    if (quality.valid) {
      decision = {
        label: "Experiment ready for review",
        rationale: "Imported measurements passed quality checks. Pattern scoring remains disabled for user-supplied data.",
        action: "record",
      };
    } else {
      decision = {
        label: "Check measurement evidence",
        rationale: "Imported measurements have quality findings that must be reviewed before proceeding.",
        action: "recheck",
      };
    }
  } else {
    if (quality.valid && faultResult.samples.length === 24) {
      let originalResult = null;
      try {
        originalResult = originalAnalyze(faultResult.samples, model || trainSyntheticModel());
      } catch (e) {
        originalResult = null;
      }

      if (originalResult && originalResult.quality && originalResult.quality.valid && typeof originalResult.patternScore === "number") {
        patternScore = originalResult.patternScore;
        modelStatus = "Synthetic pattern score available";
        const changing = patternScore >= 0.5;
        decision = changing
          ? {
              label: "Synthetic pattern review",
              rationale: "Generated trace matches a synthetic changing-pattern class. No clinical inference.",
              action: "review",
            }
          : {
              label: "Record synthetic trace",
              rationale: "Generated trace matches the stable-pattern class. Keep available for human review.",
              action: "record",
            };
      } else {
        patternScore = null;
        modelStatus = "Synthetic model unavailable; original QC rejected trace";
        decision = {
          label: "Record synthetic trace",
          rationale: "Lab quality checks passed but synthetic model analyzer rejected the trace. No pattern score assigned.",
          action: "record",
        };
      }
    } else {
      patternScore = null;
      modelStatus = "Disabled due to quality findings";
      decision = {
        label: "Check measurement evidence",
        rationale: "Generated trace has quality findings that must be reviewed.",
        action: "recheck",
      };
    }
  }

  const result = {
    trace,
    samples: faultResult.samples,
    operations: faultResult.operations,
    quality,
    patternScore,
    modelStatus,
    decision,
    evidenceIndices,
    changed: faultResult.changed,
    operationProvenance: saved ? "Restored descriptions; execution unverified" : "Executed locally on a copy",
  };
  // Preserve measurement provenance at analysis time. Reports cannot mix traces/results.
  const source = {
    id: String(trace.id || "unknown"), name: String(trace.name || "experiment.csv"),
    kind: isOwned ? "synthetic" : "imported",
    origin: isOwned ? trace.origin : "User-supplied experiment; provenance unverified",
  };
  source.channels = trace.channels ? [...trace.channels] : [...CHANNEL_KEYS];
  if (trace.importProfile) source.importProfile = copyJSON(trace.importProfile);
  if (isOwned) source.seed = trace.seed;
  const snapshot = copyJSON({ source, originalSamples: cloneSamples(trace.samples),
    derivedSamples: result.samples, operations: result.operations, quality: result.quality,
    decision: result.decision, model: { status: result.modelStatus, patternScore: isOwned ? result.patternScore : null },
    protocol, operationProvenance: result.operationProvenance });
  ANALYSES.set(result, { trace, snapshot });
  return result;
}

export function runBenchmark({ seed = 42, cases = 100, protocol = DEFAULT_PROTOCOL } = {}) {
  validateProtocol(protocol);
  if (!Number.isFinite(cases)) throw new TypeError("Cases must be finite");
  const boundedCases = Math.max(10, Math.min(300, Math.floor(cases)));
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError("Seed must be a 32-bit unsigned integer");
  const seedNum = seed >>> 0;

  const faultCases = [];
  const cleanCases = [];

  const faultTypes = ["dropout", "spike", "gap", "drift"];

  for (let i = 0; i < boundedCases; i++) {
    const caseSeed = (seedNum + Math.imul(i + 1, 0x9e3779b1)) >>> 0;
    const isChanging = i % 2 === 1;
    const baseKey = isChanging ? "change" : "stable";
    const baseTrace = createSyntheticTrace(baseKey, caseSeed);

    const faultType = faultTypes[i % faultTypes.length];
    const channel = CHANNEL_KEYS[Math.floor(i / faultTypes.length) % CHANNEL_KEYS.length];
    const targetIndex = 5 + (i % 14);

    let faultOpts;
    if (faultType === "dropout") {
      faultOpts = { type: "dropout", channel, index: targetIndex, seed: caseSeed };
    } else if (faultType === "spike") {
      const sign = i % 3 === 0 ? -1 : 1;
      const mag = protocol.spikes[channel] * (1.8 + (i % 5) * 0.4);
      faultOpts = { type: "spike", channel, index: targetIndex, severity: sign * mag, seed: caseSeed };
    } else if (faultType === "gap") {
      faultOpts = { type: "gap", channel, index: targetIndex, severity: protocol.maxGapSeconds + 1 + (i % 3), seed: caseSeed };
    } else {
      const subtle = i % 3 === 0;
      const driftMag = subtle ? 0.15 : 2.5;
      faultOpts = { type: "drift", channel, index: targetIndex, severity: driftMag, seed: caseSeed };
    }

    const faulted = applyFault(baseTrace, faultOpts);
    const inspection = inspectTrace(faulted.samples, protocol);
    const detected = !inspection.valid;

    faultCases.push({
      type: faultType,
      channel,
      index: targetIndex,
      severity: faultOpts.severity ?? null,
      seed: caseSeed,
      detected,
      findings: inspection.findings,
      subtle: faultType === "drift" && Math.abs(faultOpts.severity) < 0.5,
    });

    const cleanTrace = createSyntheticTrace(baseKey, (caseSeed + 0x12345) >>> 0);
    const cleanInspection = inspectTrace(cleanTrace.samples, protocol);
    cleanCases.push({
      detected: !cleanInspection.valid,
      findings: cleanInspection.findings,
      seed: (caseSeed + 0x12345) >>> 0,
    });
  }

  let tp = 0, fn = 0, fp = 0, tn = 0;
  const byTypeMap = {};

  for (const fc of faultCases) {
    if (fc.detected) tp += 1;
    else fn += 1;

    if (!byTypeMap[fc.type]) {
      byTypeMap[fc.type] = { type: fc.type, total: 0, detected: 0, missed: 0 };
    }
    byTypeMap[fc.type].total += 1;
    if (fc.detected) byTypeMap[fc.type].detected += 1;
    else byTypeMap[fc.type].missed += 1;
  }

  for (const cc of cleanCases) {
    if (cc.detected) fp += 1;
    else tn += 1;
  }

  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const falseHoldRate = tn + fp > 0 ? fp / (tn + fp) : null;

  const byType = Object.values(byTypeMap);

  const examples = [];
  for (const fc of faultCases) {
    if (examples.length >= 10) break;
    examples.push({
      type: fc.type,
      channel: fc.channel,
      index: fc.index,
      severity: fc.severity,
      detected: fc.detected,
      subtle: fc.subtle,
      findingsCount: fc.findings.length,
    });
  }

  const benchmark = {
    seed: seedNum,
    cases: boundedCases,
    counts: { tp, fn, fp, tn },
    rates: { recall, precision, falseHoldRate },
    byType,
    examples,
    scope: "Synthetic injected faults only; no clinical performance.",
    protocol: copyJSON(protocol),
    version: VERSION,
  };
  BENCHMARKS.add(benchmark);
  return freezeDeep(benchmark);
}

export function createReport(trace, result, benchmark = null, protocol = DEFAULT_PROTOCOL) {
  validateProtocol(protocol);
  const record = ANALYSES.get(result);
  if (!record || record.trace !== trace) throw new TypeError("Report requires the matching analyzed experiment");
  if (JSON.stringify(record.snapshot.protocol) !== JSON.stringify(protocol)) {
    throw new TypeError("Report protocol must match the analyzed experiment");
  }
  if (benchmark !== null && !BENCHMARKS.has(benchmark)) throw new TypeError("Benchmark must come from a local benchmark run");
  return {
    schema: "patchline-lab-experiment/v1", version: VERSION,
    ...copyJSON(record.snapshot),
    units: { temperature: "°C", moisture: "%", ph: "pH", glucose: "AU" },
    benchmark: benchmark === null ? null : copyJSON(benchmark),
    scope: "Research sensor validation only; no clinical diagnosis or treatment.",
  };
}

export function sampleCSV() {
  const trace = createSyntheticTrace("stable", 1);
  const headers = ["timestamp_s", "temperature_c", "wetness_pct", "ph", "glucose_au"];
  const lines = [headers.join(",")];
  for (const s of trace.samples) {
    const row = [
      s.t,
      s.temperature,
      s.moisture,
      s.ph,
      s.glucose,
    ];
    lines.push(row.join(","));
  }
  return lines.join("\n");
}
