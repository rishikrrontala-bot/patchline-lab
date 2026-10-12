/* research-engine.js
 * Privacy-preserving research sensor workbench engine.
 * Pure browser ES module. No dependencies, no network, no DOM, no storage.
 * Code assistant: GLM 5.2. App has no runtime AI.
 */
'use strict';

export const RESEARCH_VERSION = '2.0.0';
export const KEYS = ['temperature', 'moisture', 'ph', 'glucose'];

export const DEFAULT_PROFILE = Object.freeze({
  name: 'Canonical research CSV',
  timeColumn: 'timestamp_s',
  timeUnit: 's',
  channels: Object.freeze({
    temperature: Object.freeze({ column: 'temperature_c', unit: 'C' }),
    moisture: Object.freeze({ column: 'wetness_pct', unit: '%' }),
    ph: Object.freeze({ column: 'ph', unit: 'pH' }),
    glucose: Object.freeze({ column: 'glucose_au', unit: 'AU' })
  })
});

const UNIT_ALIASES = {
  temperature: { c: 'C', f: 'F', k: 'K' },
  moisture: { '%': '%', percent: '%', fraction: 'fraction' },
  ph: { ph: 'pH' },
  glucose: { au: 'AU' }
};

const CANONICAL_UNIT = {
  temperature: '°C',
  moisture: '%',
  ph: 'pH',
  glucose: 'AU'
};

const MAX_BYTES = 1048576;
const MAX_ROWS = 5000;
const MIN_ROWS = 3;
const MAX_COLS = 16;
const MAX_FIELD = 256;
const MAX_NAME = 96;
const MAX_REVISION = 32;
const MAX_FILENAME = 256;
const MAX_PROTOCOL_JSON = 32768;
const MAX_WORKSPACE_JSON = 4 * 1024 * 1024;
const MAX_SAMPLES = 5000;
const MAX_OPERATIONS = 5000;
const ABS_BOUND = 1e9;

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isPlainString(v) {
  return typeof v === 'string';
}
function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function isInteger(v) {
  return typeof v === 'number' && Number.isInteger(v);
}
function safeString(v, max) {
  if (typeof v !== 'string') throw new Error('Expected string');
  if (v.length > max) throw new Error('String exceeds length limit');
  return v;
}
function hasExtraKeys(obj, allowed) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) return true;
  }
  return false;
}
function deepFreeze(o) {
  if (o === null || typeof o !== 'object') return o;
  if (typeof o === 'function') return o;
  Object.freeze(o);
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) deepFreeze(v);
  }
  return o;
}
function plainCopy(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) {
    const a = new Array(o.length);
    for (let i = 0; i < o.length; i++) a[i] = plainCopy(o[i]);
    return a;
  }
  const out = {};
  for (const k of Object.keys(o)) Object.defineProperty(out,k,{value:plainCopy(o[k]),enumerable:true,writable:true,configurable:true});
  return out;
}
function safeKeys(obj) {
  return Object.keys(obj).filter(k => Object.prototype.hasOwnProperty.call(obj, k));
}
function utf8ByteLength(s) {return new TextEncoder().encode(s).length;}
function deterministicHash(str) {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x1000193 >>> 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + 0x9e3779b9), 0x85ebca77) >>> 0;
  }
  const hex = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  return 'r' + hex;
}
function parseFiniteNumber(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (t === '') return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}
function normalizeUnit(channel, unit) {
  if (typeof unit !== 'string') throw new Error('Unit must be string');
  const u = unit.trim();
  if (u === '') throw new Error('Empty unit');
  const map = UNIT_ALIASES[channel];
  if (!map) throw new Error('Unknown channel: ' + channel);
  const key = u.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(map, key)) throw new Error('Unsupported unit ' + unit + ' for ' + channel);
  return map[key];
}
function convertValue(channel, canonicalUnit, value) {
  if (value === null || value === undefined) return null;
  if (!isFiniteNumber(value)) throw new Error('Non-finite value');
  if (channel === 'temperature') {
    if (canonicalUnit === 'C') return value;
    if (canonicalUnit === 'F') return (value - 32) * 5 / 9;
    if (canonicalUnit === 'K') return value - 273.15;
    throw new Error('Bad temperature unit');
  }
  if (channel === 'moisture') {
    if (canonicalUnit === '%') return value;
    if (canonicalUnit === 'fraction') return value * 100;
    throw new Error('Bad moisture unit');
  }
  if (channel === 'ph' || channel === 'glucose') return value;
  throw new Error('Unknown channel');
}

export function scanCSV(text) {
  if(typeof text!=='string')throw new Error('CSV input must be string');
  if(utf8ByteLength(text)>MAX_BYTES)throw new Error('CSV exceeds byte limit');
  const src=text.charCodeAt(0)===0xfeff?text.slice(1):text;
  const all=[];let row=[],field='',state='start';
  const append=c=>{field+=c;if(field.length>MAX_FIELD)throw new Error('Field exceeds length limit');};
  const endField=()=>{row.push(field);if(row.length>MAX_COLS)throw new Error('Too many columns');field='';state='start';};
  const endRow=()=>{endField();if(!(row.length===1&&row[0]===''))all.push(row);row=[];if(all.length>MAX_ROWS+1)throw new Error('Too many data rows');};
  for(let i=0;i<src.length;i++) {
    const c=src[i];
    if(state==='quoted') {if(c==='"'){if(src[i+1]==='"'){append('"');i++;}else state='closed';}else append(c);continue;}
    if(c===','){endField();continue;}
    if(c==='\r'||c==='\n'){if(c==='\r'&&src[i+1]==='\n')i++;endRow();continue;}
    if(state==='closed')throw new Error('Malformed quote: text after closing quote');
    if(c==='"'){if(state!=='start')throw new Error('Malformed quote: quote inside field');state='quoted';}
    else{append(c);state='unquoted';}
  }
  if(state==='quoted')throw new Error('Unterminated quoted field');
  if(row.length||field!==''||state==='closed')endRow();
  if(!all.length)throw new Error('No data rows');
  const headers=all.shift().map(h=>h.trim());
  if(headers.some(h=>!h))throw new Error('Empty header');
  if(new Set(headers).size!==headers.length)throw new Error('Duplicate header');
  if(all.length<MIN_ROWS)throw new Error('Insufficient data rows');
  for(const r of all)if(r.length!==headers.length)throw new Error('Ragged row');
  return {headers,rows:all};
}

const TIME_HEADERS = ['time', 'time_s', 'time [s]', 'time [ms]', 'timestamp_ms', 'time_ms', 'timestamp_s'];
const CHANNEL_HEADERS = {
  temperature: ['temp', 'temperature', 'temperature_c', 'temperature [c]', 'temperature_f'],
  moisture: ['wetness_pct', 'moisture', 'wetness'],
  ph: ['ph'],
  glucose: ['glucose_au', 'glucose']
};

export function suggestProfile(headers) {
  if (!Array.isArray(headers)) throw new Error('Headers must be array');
  for (const h of headers) {
    if (typeof h !== 'string' || h.length > MAX_FIELD) throw new Error('Invalid header');
  }
  const lower = headers.map(h => h.toLowerCase());
  let timeCol = null;
  let timeUnit = 's';
  for (const th of TIME_HEADERS) {
    const idx = lower.indexOf(th.toLowerCase());
    if (idx !== -1) {
      timeCol = headers[idx];
      if (th === 'timestamp_ms' || th === 'time_ms' || th === 'time [ms]') timeUnit = 'ms';
      else timeUnit = 's';
      break;
    }
  }
  const channels = {};
  for (const key of KEYS) {
    for (const ch of CHANNEL_HEADERS[key]) {
      const idx = lower.indexOf(ch.toLowerCase());
      if (idx !== -1) {
        let unit = CANONICAL_UNIT[key];
        if (key === 'temperature' && ch === 'temperature_f') unit = 'F';
        channels[key] = { column: headers[idx], unit };
        break;
      }
    }
  }
  if (!timeCol && Object.keys(channels).length === 0) return null;
  if (Object.keys(channels).length === 0) return null;
  const profile = {
    name: 'Suggested profile',
    timeColumn: timeCol || headers[0],
    timeUnit,
    channels
  };
  return deepFreeze(plainCopy(profile));
}

export function validateProfile(profile, headers) {
  if (!isObject(profile)) throw new Error('Profile must be object');
  const allowed = ['name', 'timeColumn', 'timeUnit', 'channels'];
  if (hasExtraKeys(profile, allowed)) throw new Error('Unknown profile keys');
  const name = safeString(profile.name, MAX_NAME);
  const timeColumn = safeString(profile.timeColumn, MAX_FIELD);
  if (timeColumn === '') throw new Error('Empty timeColumn');
  const timeUnit = (function () {
    const u = profile.timeUnit;
    if (u !== 's' && u !== 'ms') throw new Error('timeUnit must be s or ms');
    return u;
  })();
  if (!isObject(profile.channels)) throw new Error('channels must be object');
  const chKeys = safeKeys(profile.channels);
  if (chKeys.length === 0) throw new Error('At least one channel required');
  const usedColumns = new Set([timeColumn]);
  const normChannels = {};
  for (const k of chKeys) {
    if (!KEYS.includes(k)) throw new Error('Unknown channel key: ' + k);
    const ch = profile.channels[k];
    if (!isObject(ch)) throw new Error('Channel must be object');
    if (hasExtraKeys(ch, ['column', 'unit'])) throw new Error('Unknown channel keys');
    const column = safeString(ch.column, MAX_FIELD);
    if (column === '') throw new Error('Empty column');
    if (usedColumns.has(column)) throw new Error('Column reused: ' + column);
    usedColumns.add(column);
    const unit = normalizeUnit(k, ch.unit);
    normChannels[k] = { column, unit };
  }
  if (headers) {
    if (!Array.isArray(headers)) throw new Error('headers must be array');
    const set = new Set(headers);
    if (!set.has(timeColumn)) throw new Error('timeColumn not in headers');
    for (const k of Object.keys(normChannels)) {
      if (!set.has(normChannels[k].column)) throw new Error('Channel column not in headers: ' + normChannels[k].column);
    }
  }
  const result = {
    name,
    timeColumn,
    timeUnit,
    channels: normChannels
  };
  return deepFreeze(plainCopy(result));
}

export function parseMappedCSV(text, profile = DEFAULT_PROFILE, filename = 'experiment.csv') {
  if (typeof text !== 'string') throw new Error('text must be string');
  if (typeof filename !== 'string' || filename.length > MAX_FILENAME) throw new Error('Invalid filename');
  const validated = validateProfile(profile);
  const { headers, rows } = scanCSV(text);
  const colIndex = Object.create(null);
  headers.forEach((h, i) => { colIndex[h] = i; });
  const timeIdx = colIndex[validated.timeColumn];
  if (timeIdx === undefined) throw new Error('Time column not found in CSV');
  const channelIdx = {};
  for (const k of Object.keys(validated.channels)) {
    const idx = colIndex[validated.channels[k].column];
    if (idx === undefined) throw new Error('Channel column not found: ' + validated.channels[k].column);
    channelIdx[k] = idx;
  }
  const selectedKeys = Object.keys(validated.channels).sort((a, b) => KEYS.indexOf(a) - KEYS.indexOf(b));
  const samples = [];
  let prevTime = -Infinity;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const timeRaw = row[timeIdx];
    const timeNum = parseFiniteNumber(timeRaw);
    if (timeNum === null) throw new Error('Non-numeric timestamp at row ' + (r + 1));
    if (timeNum < 0) throw new Error('Negative timestamp at row ' + (r + 1));
    let t = timeNum;
    if (validated.timeUnit === 'ms') t = timeNum / 1000;
    if (!(t > prevTime)) throw new Error('Timestamps not strictly increasing at row ' + (r + 1));
    prevTime = t;
    const sample = { t };
    for (const k of KEYS) {
      if (selectedKeys.includes(k)) {
        const idx = channelIdx[k];
        const raw = row[idx];
        if (raw.trim() === '') {
          sample[k] = null;
        } else {
          const num = parseFiniteNumber(raw);
          if (num === null) throw new Error('Non-numeric ' + k + ' at row ' + (r + 1));
          sample[k] = convertValue(k, validated.channels[k].unit, num);
          if(!Number.isFinite(sample[k]))throw new Error('Unit conversion overflows finite range');
        }
      } else {
        sample[k] = null;
      }
    }
    samples.push(sample);
  }
  const hashSrc = text + '\u0001' + JSON.stringify(validated);
  const id = deterministicHash(hashSrc);
  const units = {};
  for (const k of selectedKeys) units[k] = CANONICAL_UNIT[k];
  const trace = {
    id,
    name: filename,
    kind: 'imported',
    origin: 'User-supplied experiment; provenance unverified',
    channels: selectedKeys,
    units,
    importProfile: validated,
    samples
  };
  return deepFreeze(plainCopy(trace));
}

export function validateResearchProtocol(protocol) {
  if (!isObject(protocol)) throw new Error('Protocol must be object');
  const allowed = ['name', 'revision', 'channels', 'ranges', 'spikes', 'maxGapSeconds', 'flatline'];
  if (hasExtraKeys(protocol, allowed)) throw new Error('Unknown protocol keys');
  const name = protocol.name === undefined ? 'Research measurement protocol' : safeString(protocol.name, MAX_NAME);
  const revision = protocol.revision === undefined ? '1' : safeString(protocol.revision, MAX_REVISION);
  let channels;
  if (protocol.channels === undefined) {
    channels = KEYS.slice();
  } else {
    if (!Array.isArray(protocol.channels)) throw new Error('channels must be array');
    if (protocol.channels.length === 0) throw new Error('channels nonempty');
    const seen = new Set();
    for (const c of protocol.channels) {
      if (typeof c !== 'string' || !KEYS.includes(c)) throw new Error('Unknown channel: ' + c);
      if (seen.has(c)) throw new Error('Duplicate channel: ' + c);
      seen.add(c);
    }
    channels = protocol.channels.slice();
  }
  if (!isObject(protocol.ranges) || hasExtraKeys(protocol.ranges,KEYS)) throw new Error('ranges must contain only declared research keys');
  const ranges = {};
  for (const k of KEYS) {
    const r = protocol.ranges[k];
    if (r === undefined) throw new Error('Missing range for ' + k);
    if (!Array.isArray(r) || r.length!==2) throw new Error('Range must be a two-value array');
    const [min,max] = r;
    if (!isFiniteNumber(min) || !isFiniteNumber(max)) throw new Error('Range bounds finite');
    if (Math.abs(min) > ABS_BOUND || Math.abs(max) > ABS_BOUND) throw new Error('Range bound exceeds limit');
    if (!(min <= max)) throw new Error('Range min>max for ' + k);
    ranges[k] = [min, max];
  }
  if (!isObject(protocol.spikes) || hasExtraKeys(protocol.spikes,KEYS)) throw new Error('spikes must contain only research keys');
  const spikes = {};
  for (const k of KEYS) {
    const s = protocol.spikes[k];
    if (s === undefined) throw new Error('Missing spike for ' + k);
    if (!isFiniteNumber(s)) throw new Error('Spike finite');
    if (!(s > 0) || s > ABS_BOUND) throw new Error('Spike out of bounds for ' + k);
    spikes[k] = s;
  }
  const maxGapSeconds = protocol.maxGapSeconds;
  if (!isFiniteNumber(maxGapSeconds)) throw new Error('maxGapSeconds finite');
  if (!(maxGapSeconds > 0) || maxGapSeconds > ABS_BOUND) throw new Error('maxGapSeconds out of bounds');
  let flatline = false;
  if (protocol.flatline !== undefined) {
    if (typeof protocol.flatline !== 'boolean') throw new Error('flatline must be boolean');
    flatline = protocol.flatline;
  }
  const result = {
    name,
    revision,
    channels,
    ranges,
    spikes,
    maxGapSeconds,
    flatline
  };
  return deepFreeze(plainCopy(result));
}

export function serializeProtocol(protocol, profile) {
  const p = validateResearchProtocol(protocol);
  const pr = validateProfile(profile);
  const envelope = {
    schema: 'patchline-protocol-v2',
    version: '2.0.0',
    protocol: p,
    profile: pr
  };
  const str = JSON.stringify(envelope);
  if (utf8ByteLength(str) > MAX_PROTOCOL_JSON) throw new Error('Protocol JSON too large');
  return str;
}

export function restoreProtocol(text) {
  if (typeof text !== 'string') throw new Error('Input must be string');
  if (text.length === 0 || utf8ByteLength(text) > MAX_PROTOCOL_JSON) throw new Error('Protocol size out of bounds');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('Malformed JSON');
  }
  if (!isObject(parsed)) throw new Error('Envelope must be object');
  const allowed = ['schema', 'version', 'protocol', 'profile'];
  if (hasExtraKeys(parsed, allowed)) throw new Error('Unknown envelope keys');
  if (parsed.schema !== 'patchline-protocol-v2') throw new Error('Wrong schema');
  if (parsed.version !== '2.0.0') throw new Error('Wrong version');
  const protocol = validateResearchProtocol(parsed.protocol);
  const profile = validateProfile(parsed.profile);
  return deepFreeze({ protocol, profile });
}

export const DEFAULT_COMPARISON = Object.freeze({
  channel: 'temperature',
  role: 'reference',
  tolerance: 0.5,
  uncertainty: 0.05,
  timeOffsetSeconds: 0,
  maxMatchDistance: 0.25,
  maxReferenceStep: 1,
  minCoverage: 0.8,
  minPairs: 3
});

export function validateComparisonOptions(options) {
  if (!isObject(options)) throw new Error('Options must be object');
  const allowed = ['channel', 'role', 'tolerance', 'uncertainty', 'timeOffsetSeconds', 'maxMatchDistance', 'maxReferenceStep', 'minCoverage', 'minPairs'];
  if (hasExtraKeys(options, allowed)) throw new Error('Unknown option keys');
  options={...DEFAULT_COMPARISON,...Object.fromEntries(Object.entries(options).filter(([,v])=>v!==undefined))};
  const channel = options.channel;
  if (typeof channel !== 'string' || !KEYS.includes(channel)) throw new Error('Invalid channel');
  const role = options.role;
  if (role !== 'reference' && role !== 'repeat') throw new Error('Invalid role');
  const tolerance = options.tolerance;
  if (!isFiniteNumber(tolerance) || !(tolerance > 0)) throw new Error('tolerance must be >0');
  const uncertainty = options.uncertainty;
  if (!isFiniteNumber(uncertainty) || uncertainty < 0) throw new Error('uncertainty must be >=0');
  const timeOffsetSeconds = options.timeOffsetSeconds;
  if (!isFiniteNumber(timeOffsetSeconds) || Math.abs(timeOffsetSeconds) > ABS_BOUND) throw new Error('timeOffsetSeconds out of bounds');
  const maxMatchDistance = options.maxMatchDistance;
  if (!isFiniteNumber(maxMatchDistance) || maxMatchDistance < 0) throw new Error('maxMatchDistance must be >=0');
  const maxReferenceStep = options.maxReferenceStep;
  if (!isFiniteNumber(maxReferenceStep) || !(maxReferenceStep > 0)) throw new Error('maxReferenceStep must be >0');
  const minCoverage = options.minCoverage;
  if (!isFiniteNumber(minCoverage) || !(minCoverage > 0 && minCoverage <= 1)) throw new Error('minCoverage out of (0,1]');
  const minPairs = options.minPairs;
  if (!isInteger(minPairs) || minPairs < 3 || minPairs > 5000) throw new Error('minPairs integer 3..5000');
  const result = {
    channel,
    role,
    tolerance,
    uncertainty,
    timeOffsetSeconds,
    maxMatchDistance,
    maxReferenceStep,
    minCoverage,
    minPairs
  };
  return deepFreeze(plainCopy(result));
}

function mergeOptions(options) {
  if (options === undefined) return validateComparisonOptions(DEFAULT_COMPARISON);
  if (!isObject(options)) throw new Error('Options must be object');
  if(hasExtraKeys(options,Object.keys(DEFAULT_COMPARISON)))throw new Error('Unknown comparison option');
  const merged = {};
  for (const k of Object.keys(DEFAULT_COMPARISON)) {
    merged[k] = options[k] === undefined ? DEFAULT_COMPARISON[k] : options[k];
  }
  return validateComparisonOptions(merged);
}

function validateSampleArray(arr, label) {
  if (!Array.isArray(arr)) throw new Error(label + ' samples must be array');
  if (arr.length < 3) throw new Error(label + ' needs >=3 samples');
  if (arr.length > MAX_SAMPLES) throw new Error(label + ' exceeds sample limit');
  let prev = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (!isObject(s)) throw new Error(label + ' sample must be object');
    const t = s.t;
    if (!isFiniteNumber(t) || t < 0) throw new Error(label + ' timestamp invalid at ' + i);
    if (!(t > prev)) throw new Error(label + ' timestamps not strictly increasing at ' + i);
    prev = t;
  }
}

function getChannelValue(sample, channel) {
  if (!Object.prototype.hasOwnProperty.call(sample, channel)) return null;
  const v = sample[channel];
  if (v === null) return null;
  if (isFiniteNumber(v)) return v;
  throw new Error('Non-finite reading');
}

export function compareRecordings(recording, reference, options = DEFAULT_COMPARISON) {
  if (!isObject(recording)) throw new Error('recording must be object');
  if (!isObject(reference)) throw new Error('reference must be object');
  if (!Array.isArray(recording.samples)) throw new Error('recording.samples required');
  if (!Array.isArray(reference.samples)) throw new Error('reference.samples required');
  validateSampleArray(recording.samples, 'recording');
  validateSampleArray(reference.samples, 'reference');
  const opts = mergeOptions(options);
  const channel = opts.channel;
  let recChannels = recording.channels;
  if (recChannels === undefined) recChannels = KEYS.slice();
  if (!Array.isArray(recChannels)) throw new Error('recording.channels must be array');
  if (!recChannels.includes(channel)) throw new Error('Channel ' + channel + ' not in recording');
  let refChannels = reference.channels;
  if (refChannels === undefined) refChannels = KEYS.slice();
  if (!Array.isArray(refChannels)) throw new Error('reference.channels must be array');
  for(const [trace,channels] of [[recording,recChannels],[reference,refChannels]]){if(!channels.length||new Set(channels).size!==channels.length||channels.some(key=>!KEYS.includes(key)))throw new Error('Invalid declared channels');for(const sample of trace.samples)for(const key of channels){const value=getChannelValue(sample,key);if(value!==null && Math.abs(value)>ABS_BOUND)throw new Error('Reading exceeds supported numeric range');}}
  if (!refChannels.includes(channel)) throw new Error('Channel ' + channel + ' not in reference');
  const recSamples = recording.samples;
  const refSamples = reference.samples;
  const pairs = [];
  const usedRef = new Set();
  let refIdx = 0;
  for (let i = 0; i < recSamples.length; i++) {
    const s = recSamples[i];
    const sensorTime = s.t - opts.timeOffsetSeconds;
    const sensorVal = getChannelValue(s, channel);
    while (refIdx + 1 < refSamples.length && refSamples[refIdx + 1].t <= sensorTime) refIdx++;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let k = Math.max(0, refIdx - 1); k <= Math.min(refSamples.length - 1, refIdx + 1); k++) {
      const d = Math.abs(refSamples[k].t - sensorTime);
      if (d < bestDist || (d === bestDist && !usedRef.has(k))) {
        bestDist = d;
        bestIdx = k;
      }
    }
    if (bestIdx === -1 || bestDist > opts.maxMatchDistance) {
      pairs.push({
        sampleIndex: i,
        referenceIndex: null,
        time: s.t,
        referenceTime: null,
        value: sensorVal,
        referenceValue: null,
        delta: null,
        status: 'unavailable',
        reason: 'no-match'
      });
      continue;
    }
    if (usedRef.has(bestIdx)) {
      pairs.push({
        sampleIndex: i,
        referenceIndex: null,
        time: s.t,
        referenceTime: null,
        value: sensorVal,
        referenceValue: null,
        delta: null,
        status: 'unavailable',
        reason: 'reused'
      });
      continue;
    }
    const refSample = refSamples[bestIdx];
    let stepBad = false;
    if (bestIdx > 0) {
      const value=getChannelValue(refSample,channel),neighbor=getChannelValue(refSamples[bestIdx-1],channel);
      if(value!==null&&neighbor!==null&&Math.abs(value-neighbor)>opts.maxReferenceStep)stepBad=true;
    }
    if (bestIdx < refSamples.length - 1) {
      const value=getChannelValue(refSample,channel),neighbor=getChannelValue(refSamples[bestIdx+1],channel);
      if(value!==null&&neighbor!==null&&Math.abs(value-neighbor)>opts.maxReferenceStep)stepBad=true;
    }
    if (stepBad) {
      usedRef.add(bestIdx);
      pairs.push({
        sampleIndex: i,
        referenceIndex: null,
        time: s.t,
        referenceTime: refSample.t,
        value: sensorVal,
        referenceValue: null,
        delta: null,
        status: 'unavailable',
        reason: 'reference-step'
      });
      continue;
    }
    const refVal = getChannelValue(refSample, channel);
    if (sensorVal === null || refVal === null) {
      pairs.push({
        sampleIndex: i,
        referenceIndex: bestIdx,
        time: s.t,
        referenceTime: refSample.t,
        value: sensorVal,
        referenceValue: refVal,
        delta: null,
        status: 'unavailable',
        reason: 'missing-value'
      });
      usedRef.add(bestIdx);
      continue;
    }
    const delta = sensorVal - refVal;
    let status;
    if (Math.abs(delta) + opts.uncertainty <= opts.tolerance) status = 'within';
    else if (Math.abs(delta) - opts.uncertainty > opts.tolerance) status = 'exceeds';
    else status = 'uncertain';
    pairs.push({
      sampleIndex: i,
      referenceIndex: bestIdx,
      time: s.t,
      referenceTime: refSample.t,
      value: sensorVal,
      referenceValue: refVal,
      delta,
      status,
      reason: null
    });
    usedRef.add(bestIdx);
  }
  const counts = { within: 0, exceeds: 0, uncertain: 0, unavailable: 0 };
  for (const p of pairs) counts[p.status]++;
  const usable = counts.within + counts.exceeds + counts.uncertain;
  const coverage = recSamples.length > 0 ? usable / recSamples.length : 0;
  let decision;
  const findings = [];
  if (usable < opts.minPairs || coverage < opts.minCoverage) {
    decision = 'inconclusive';
  } else if (counts.exceeds > 0) {
    decision = 'discrepancy';
    const indices = [];
    const refIndices = [];
    for (const p of pairs) {
      if (p.status === 'exceeds') {
        indices.push(p.sampleIndex);
        if (p.referenceIndex !== null) refIndices.push(p.referenceIndex);
      }
    }
    findings.push({
      code: 'reference-discrepancy',
      channel,
      sampleIndices: indices,
      referenceIndices: refIndices,
      message: 'Sensor reading exceeds tolerance relative to reference at ' + indices.length + ' sample(s).'
    });
  } else if (counts.uncertain > 0) {
    decision = 'inconclusive';
  } else {
    decision = 'within-tolerance';
  }
  let summary;
  if (usable === 0) {
    summary = {
      matched: 0,
      meanDelta: null,
      rmse: null,
      maxAbsDelta: null,
      firstDelta: null,
      lastDelta: null
    };
  } else {
    const deltas = pairs.filter(p => p.delta !== null).map(p => p.delta);
    const sum = deltas.reduce((a, b) => a + b, 0);
    const mean = sum / deltas.length;
    const sq = deltas.reduce((a, b) => a + b * b, 0);
    const rmse = Math.sqrt(sq / deltas.length);
    const maxAbs = deltas.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
    summary = {
      matched: deltas.length,
      meanDelta: mean,
      rmse,
      maxAbsDelta: maxAbs,
      firstDelta: deltas[0],
      lastDelta: deltas[deltas.length - 1]
    };
  }
  const recKind = recording.kind === 'synthetic' ? 'synthetic' : 'imported';
  const refKind = reference.kind === 'synthetic' ? 'synthetic' : 'imported';
  const result = {
    schema: 'patchline-comparison-v2',
    version: RESEARCH_VERSION,
    options: opts,
    source: {
      id: recording.id,
      name: recording.name,
      kind: recKind
    },
    reference: {
      id: reference.id,
      name: reference.name,
      kind: refKind
    },
    pairs,
    counts,
    coverage,
    decision,
    summary,
    findings,
    scope: 'User-supplied reference unverified; no calibration certification or clinical claim.'
  };
  return deepFreeze(plainCopy(result));
}

export function describeFinding(finding, samples, protocol) {
  if (!isObject(finding)) throw new Error('finding must be object');
  if (!Array.isArray(samples)) throw new Error('samples must be array');
  if (samples.length < 3) throw new Error('samples need >=3');
  if (samples.length > MAX_SAMPLES) throw new Error('too many samples');
  const p = validateResearchProtocol(protocol);
  const code = finding.code;
  if (typeof code !== 'string') throw new Error('finding.code must be string');
  const channel = finding.channel;
  if(channel!==null && (typeof channel !== 'string' || !KEYS.includes(channel))) throw new Error('Invalid finding channel');
  if(channel===null&&!['time-gap','time-order'].includes(code))throw new Error('Finding requires a channel');
  const indices = finding.sampleIndices;
  if (!Array.isArray(indices)) throw new Error('sampleIndices must be array');
  for (const i of indices) {
    if (!isInteger(i) || i < 0 || i >= samples.length) throw new Error('sampleIndex out of bounds');
  }
  let title, rule, explanation, nextStep;
  const evidence = [];
  for (const i of indices) {
    const s = samples[i];
    const prev = i > 0 ? samples[i - 1] : null;
    const next = i < samples.length - 1 ? samples[i + 1] : null;
    evidence.push({
      index: i,
      time: s.t,
      value: channel===null?s.t:s[channel] !== undefined ? s[channel] : null,
      previous: prev ? { time: prev.t, value: channel===null?prev.t:prev[channel] !== undefined ? prev[channel] : null } : null,
      next: next ? { time: next.t, value: channel===null?next.t:next[channel] !== undefined ? next[channel] : null } : null
    });
  }
  if (code === 'range') {
    const r = p.ranges[channel];
    title = channel + ' outside expected range';
    rule = 'range [' + r[0] + ', ' + r[1] + ']';
    explanation = 'Reading(s) at ' + indices.length + ' sample(s) fall outside the configured range [' + r[0] + ', ' + r[1] + '] for ' + channel + '.';
    nextStep = 'Recheck acquisition, units, and protocol assumptions for ' + channel + '.';
  } else if (code === 'spike') {
    const sp = p.spikes[channel];
    title = channel + ' isolated spike';
    rule = 'spike > ' + sp;
    explanation = 'Reading(s) at ' + indices.length + ' sample(s) differ from neighbors by more than the configured spike threshold ' + sp + ' for ' + channel + '.';
    nextStep = 'Inspect neighbors and recheck sensor contact or noise for ' + channel + '.';
  } else if (code === 'time-gap') {
    title = 'time gap exceeds maxGapSeconds';
    rule = 'maxGapSeconds ' + p.maxGapSeconds;
    const gap=indices.length>=2?samples[indices[1]].t-samples[indices[0]].t:null;
    explanation = 'Observed interval '+gap+' seconds exceeds configured maximum '+p.maxGapSeconds+' seconds.';
    nextStep = 'Recheck acquisition timing and clock continuity.';
  } else if (code === 'missing') {
    title=channel+' missing reading';rule='Selected channel requires a finite reading';explanation='This channel was selected as recorded, but these exact samples have no usable value. Absent, unselected channels do not trigger this rule.';nextStep='Recheck the acquisition export and blank-value convention; do not invent replacement values.';
  } else if(code==='time-order'){title='Invalid timestamp order';rule='Strictly increasing nonnegative elapsed seconds';explanation='These timestamps do not meet the declared ordering rule.';nextStep='Inspect clock reset, units and export order.';
  } else if (code === 'flatline') {
    title = channel + ' flatline';
    rule = 'flatline ' + p.flatline;
    explanation = 'Consecutive readings are identical; protocol flatline assumption is ' + p.flatline + '.';
    nextStep = 'Recheck sensor responsiveness and protocol assumptions.';
  } else if (code === 'reference-discrepancy') {
    title = channel + ' reference discrepancy';
    rule = 'reference comparison';
    explanation = 'Sensor reading(s) exceed tolerance relative to the user-supplied reference. Tolerances are supplied in comparison options.';
    nextStep = 'Recheck acquisition, units, and reference alignment.';
  } else {
    title = 'finding';
    rule = code;
    explanation = 'Unrecognized finding code ' + code + '.';
    nextStep = 'Recheck protocol and data.';
  }
  const result = { title, rule, explanation, nextStep, evidence };
  return deepFreeze(plainCopy(result));
}

const OP_TYPES = ['none', 'dropout', 'spike', 'gap', 'drift'];
const OP_FIELDS = ['type', 'channel', 'index', 'before', 'after', 'seed', 'affectedIndices'];

function validateOperations(ops, sampleCount=MAX_SAMPLES) {
  if (!Array.isArray(ops)) throw new Error('operations must be array');
  if (ops.length > MAX_OPERATIONS) throw new Error('too many operations');
  for (const op of ops) {
    if (!isObject(op)) throw new Error('operation must be object');
    if (hasExtraKeys(op, OP_FIELDS)) throw new Error('Unknown operation field');
    if (typeof op.type !== 'string' || !OP_TYPES.includes(op.type)) throw new Error('Invalid operation type');
    if (op.channel !== undefined) {
      if (typeof op.channel !== 'string' || !KEYS.includes(op.channel)) throw new Error('Invalid operation channel');
    }
    if (op.index !== undefined) {
      if (!isInteger(op.index) || op.index < 0 || op.index>=sampleCount) throw new Error('Invalid operation index');
    }
    if (op.before !== undefined && op.before !== null && !isFiniteNumber(op.before)) throw new Error('Invalid before');
    if (op.after !== undefined && op.after !== null && !isFiniteNumber(op.after)) throw new Error('Invalid after');
    if (op.seed !== undefined && (!isInteger(op.seed)||op.seed<0||op.seed>0xffffffff)) throw new Error('Invalid seed');
    if (op.affectedIndices !== undefined) {
      if (!Array.isArray(op.affectedIndices)) throw new Error('affectedIndices must be array');
      for (const i of op.affectedIndices) {
        if (!isInteger(i) || i < 0 || i>=sampleCount) throw new Error('Invalid affected index');
      }
    }
  }
}

function validateSampleArrayFull(arr, label) {
  if (!Array.isArray(arr)) throw new Error(label + ' must be array');
  if (arr.length < 3) throw new Error(label + ' needs >=3');
  if (arr.length > MAX_SAMPLES) throw new Error(label + ' too many');
  let prev = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (!isObject(s) || hasExtraKeys(s,['t',...KEYS])) throw new Error(label + ' sample object or unexpected fields');
    if (!isFiniteNumber(s.t) || s.t < 0) throw new Error(label + ' timestamp');
    if (!(s.t > prev)) throw new Error(label + ' not increasing');
    prev = s.t;
    for (const k of KEYS) {
      if (!Object.prototype.hasOwnProperty.call(s, k)) throw new Error(label + ' missing key ' + k);
      if (s[k] !== null && !isFiniteNumber(s[k])) throw new Error(label + ' bad value');
    }
  }
}

function normalizeTrace(trace, label, restoring=false) {
  if(!isObject(trace)||hasExtraKeys(trace,['id','name','kind','origin','seed','channels','units','importProfile','samples']))throw new Error(label+' has invalid or unexpected metadata');
  validateSampleArrayFull(trace.samples,label+' samples');
  const channels=trace.channels===undefined&&!restoring?KEYS.slice():trace.channels;
  if(!Array.isArray(channels)||!channels.length||new Set(channels).size!==channels.length||channels.some(key=>!KEYS.includes(key)))throw new Error(label+' invalid declared channels');
  const name=safeString(trace.name===undefined?label:trace.name,MAX_FILENAME);
  const id=safeString(trace.id===undefined?label:trace.id,256);
  if(trace.kind!==undefined&&!['imported','synthetic'].includes(trace.kind))throw new Error(label+' invalid source kind');
  if(trace.origin!==undefined)safeString(trace.origin,512);
  if(trace.seed!==undefined&&(!isInteger(trace.seed)||trace.seed<0||trace.seed>0xffffffff))throw new Error(label+' invalid seed');
  const units={};
  if(trace.units!==undefined&&(!isObject(trace.units)||hasExtraKeys(trace.units,KEYS)))throw new Error(label+' invalid units');
  for(const key of channels){const unit=trace.units?.[key]??CANONICAL_UNIT[key];if(unit!==CANONICAL_UNIT[key])throw new Error(label+' incompatible canonical unit');units[key]=unit;}
  const profile=trace.importProfile===undefined||trace.importProfile===null?null:validateProfile(trace.importProfile);
  if(profile && (Object.keys(profile.channels).length!==channels.length||channels.some(key=>!Object.hasOwn(profile.channels,key))))throw new Error(label+' profile does not match declared channels');
  for(const sample of trace.samples)for(const key of KEYS)if(!channels.includes(key)&&sample[key]!==null)throw new Error(label+' has values for an absent channel');
  const result={id,name,kind:restoring?'imported':trace.kind||'imported',origin:restoring?'Restored user-supplied recording; provenance unverified':trace.origin||'User-supplied experiment; provenance unverified',channels:[...channels],units,importProfile:profile,samples:trace.samples.map(sample=>({t:sample.t,...Object.fromEntries(KEYS.map(key=>[key,sample[key]]))}))};
  if(!restoring && trace.seed!==undefined)result.seed=trace.seed;
  return deepFreeze(result);
}
function normalizeWorkspace(bundle,restoring) {
  const trace=normalizeTrace(bundle.trace,'Recording',restoring);
  validateSampleArrayFull(bundle.derivedSamples,'Derived recording');
  if(bundle.derivedSamples.length!==trace.samples.length)throw new Error('Derived length mismatch');
  for(const sample of bundle.derivedSamples)for(const key of KEYS)if(!trace.channels.includes(key)&&sample[key]!==null)throw new Error('Derived values for absent channel');
  validateOperations(bundle.operations,trace.samples.length);
  const reference=bundle.reference===undefined||bundle.reference===null?null:normalizeTrace(bundle.reference,'Comparison recording',restoring);
  return deepFreeze({schema:'patchline-workspace-v2',version:RESEARCH_VERSION,trace,derivedSamples:plainCopy(bundle.derivedSamples),operations:plainCopy(bundle.operations),protocol:validateResearchProtocol(bundle.protocol),profile:validateProfile(bundle.profile),reference,comparisonOptions:mergeOptions(bundle.comparisonOptions),scope:'Local import/export; no hidden persistence. Restored source and operation descriptions are unverified.'});
}
export function serializeWorkspace(bundle) {
  if(!isObject(bundle)||hasExtraKeys(bundle,['trace','derivedSamples','operations','protocol','profile','reference','comparisonOptions']))throw new Error('Invalid workspace fields');
  const text=JSON.stringify(normalizeWorkspace(bundle,false));
  if(utf8ByteLength(text)>MAX_WORKSPACE_JSON)throw new Error('Workspace exceeds byte limit');
  return text;
}
export function restoreWorkspace(text) {
  if(typeof text!=='string'||!text.length||utf8ByteLength(text)>MAX_WORKSPACE_JSON)throw new Error('Workspace size out of bounds');
  let parsed;try{parsed=JSON.parse(text);}catch{throw new Error('Malformed workspace JSON');}
  if(!isObject(parsed)||hasExtraKeys(parsed,['schema','version','trace','derivedSamples','operations','protocol','profile','reference','comparisonOptions','scope']))throw new Error('Invalid workspace envelope');
  if(parsed.schema!=='patchline-workspace-v2'||parsed.version!==RESEARCH_VERSION)throw new Error('Unsupported workspace schema or version');
  return normalizeWorkspace(parsed,true);
}
