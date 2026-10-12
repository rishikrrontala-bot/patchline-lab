// Patchline's entire data and control path is a reproducible DIGITAL TWIN.
// These levels are display tokens, never device settings or treatment doses.

const CHANNELS = ["temperature", "moisture", "ph", "glucose"];
const FEATURE_NAMES = ["temperatureTrend", "moistureTrend", "phTrend", "glucoseTrend"];
const FEATURE_SCALES = [2, 20, 0.8, 20];
const LIMITS = {
  temperature: [20, 45], // local patch/surface °C, synthetic
  moisture: [0, 100], // dressing wetness %, synthetic
  ph: [4, 10], // wound-fluid pH, synthetic
  glucose: [0, 100], // experimental wound-fluid reading, arbitrary units
};

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value, places = 2) => Number(value.toFixed(places));
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function makeTrace(seed, changing, abrupt = false, boundary = false) {
  const next = random(seed);
  const baseline = {
    temperature: 32.0 + next() * 1.7,
    moisture: 35 + next() * 13,
    ph: 5.45 + next() * 0.85,
    glucose: 28 + next() * 18,
  };
  // Borderline cases overlap across labels on purpose. This avoids a
  // misleadingly perfect held-out result from trivially separable examples.
  const amplitude = boundary
    ? {
        temperature: 0.2 + next() * 0.65,
        moisture: 2 + next() * 7,
        ph: 0.1 + next() * 0.28,
        glucose: 3 + next() * 8,
      }
    : changing
    ? {
        temperature: 1.0 + next() * 1.45,
        moisture: 10 + next() * 16,
        ph: 0.38 + next() * 0.68,
        glucose: 12 + next() * 22,
      }
    : {
        temperature: (next() - 0.5) * 0.36,
        moisture: (next() - 0.5) * 3,
        ph: (next() - 0.5) * 0.14,
        glucose: (next() - 0.5) * 3,
      };
  const onset = 10 + Math.floor(next() * 6);
  const samples = [];

  for (let t = 0; t < 24; t += 1) {
    const progress = abrupt
      ? (t < onset ? 0 : 0.64 + 0.36 * (t - onset) / (23 - onset))
      : Math.pow(t / 23, 1.3);
    const cycle = Math.sin((t / 23) * Math.PI * 2 + seed % 9) * 0.04;
    samples.push({
      t,
      temperature: round(baseline.temperature + amplitude.temperature * progress + cycle + (next() - 0.5) * 0.13),
      moisture: round(baseline.moisture + amplitude.moisture * progress + cycle * 4 + (next() - 0.5) * 1.1),
      ph: round(baseline.ph + amplitude.ph * progress + cycle * 0.15 + (next() - 0.5) * 0.055),
      glucose: round(baseline.glucose + amplitude.glucose * progress + cycle * 4 + (next() - 0.5) * 1.3),
    });
  }
  return samples;
}

export function generateScenario(key) {
  switch (key) {
    case "stable":
      return {
        id: "stable",
        label: "Stable synthetic trace",
        description: "Four reproducible generated channels with small ordinary variation.",
        samples: makeTrace(0x71a2c, false),
      };
    case "change":
      return {
        id: "change",
        label: "Changing synthetic pattern",
        description: "A generated multi-channel shift for demonstrating model and review flow; it is not an infection case.",
        samples: makeTrace(0xc11a9e, true),
      };
    case "fault": {
      const samples = makeTrace(0xfa017, true);
      samples[21].ph = 12.2;
      samples[23].glucose = null;
      return {
        id: "fault",
        label: "Sensor fault",
        description: "A generated trace with an implausible pH reading and missing final glucose reading; the quality gate must hold.",
        samples,
      };
    }
    default:
      throw new RangeError(`Unknown synthetic scenario: ${String(key)}`);
  }
}

function features(samples) {
  const head = samples.slice(0, 6);
  const tail = samples.slice(-6);
  return CHANNELS.map((name, index) =>
    (average(tail.map((sample) => sample[name])) - average(head.map((sample) => sample[name]))) / FEATURE_SCALES[index],
  );
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function makeDataset(count, seedBase) {
  return Array.from({ length: count }, (_, index) => {
    const changing = index % 2 === 1;
    const seed = (seedBase + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    return {
      x: features(makeTrace(seed, changing, changing && index % 4 === 1, index % 7 === 0)),
      y: Number(changing),
    };
  });
}

function probability(rawFeatures, model) {
  let logit = model.weights.bias;
  FEATURE_NAMES.forEach((name, index) => {
    logit += model.weights[name] * ((rawFeatures[index] - model.means[name]) / model.stds[name]);
  });
  return sigmoid(logit);
}

export function trainSyntheticModel() {
  // Separate fixed seeds make demo, fitting, and evaluation independent.
  const training = makeDataset(320, 0x41d53a);
  const heldOut = makeDataset(128, 0x91f337);
  const means = {};
  const stds = {};
  FEATURE_NAMES.forEach((name, index) => {
    means[name] = average(training.map((item) => item.x[index]));
    stds[name] = Math.max(
      Math.sqrt(average(training.map((item) => (item.x[index] - means[name]) ** 2))),
      0.001,
    );
  });
  const weights = Object.fromEntries(["bias", ...FEATURE_NAMES].map((name) => [name, 0]));
  const model = { weights, means, stds };

  // Batch logistic regression; all coefficients are inspectable in the UI.
  for (let epoch = 0; epoch < 340; epoch += 1) {
    const gradient = Object.fromEntries(["bias", ...FEATURE_NAMES].map((name) => [name, 0]));
    for (const item of training) {
      const error = probability(item.x, model) - item.y;
      gradient.bias += error;
      FEATURE_NAMES.forEach((name, index) => {
        gradient[name] += error * ((item.x[index] - means[name]) / stds[name]);
      });
    }
    const rate = 0.16;
    weights.bias -= rate * gradient.bias / training.length;
    FEATURE_NAMES.forEach((name) => {
      weights[name] -= rate * (gradient[name] / training.length + 0.001 * weights[name]);
    });
  }

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (const item of heldOut) {
    const predicted = probability(item.x, model) >= 0.5 ? 1 : 0;
    if (predicted === 1 && item.y === 1) tp += 1;
    else if (predicted === 0 && item.y === 0) tn += 1;
    else if (predicted === 1) fp += 1;
    else fn += 1;
  }
  model.metrics = {
    accuracy: (tp + tn) / heldOut.length,
    precision: tp + fp ? tp / (tp + fp) : 0,
    recall: tp + fn ? tp / (tp + fn) : 0,
    tp,
    tn,
    fp,
    fn,
  };
  model.trainCount = training.length;
  model.testCount = heldOut.length;
  return model;
}

function inspectQuality(samples) {
  const flags = [];
  const badIndices = new Set();
  if (!Array.isArray(samples) || samples.length !== 24) {
    flags.push("Expected a complete 24-sample synthetic trace.");
    return { valid: false, flags, badIndices };
  }
  samples.forEach((sample, index) => {
    if (!sample || typeof sample !== "object") {
      flags.push(`Sample ${index + 1}: missing reading set.`);
      badIndices.add(index);
      return;
    }
    if (!Number.isFinite(sample.t) || (index > 0 && (!samples[index - 1] || sample.t <= samples[index - 1].t))) {
      flags.push(`Sample ${index + 1}: invalid time order.`);
      badIndices.add(index);
    }
    for (const name of CHANNELS) {
      const value = sample[name];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        flags.push(`Sample ${index + 1}: ${name} is missing.`);
        badIndices.add(index);
      } else if (value < LIMITS[name][0] || value > LIMITS[name][1]) {
        flags.push(`Sample ${index + 1}: ${name} is outside the simulated sensor range.`);
        badIndices.add(index);
      }
    }
  });
  if (flags.length) return { valid: false, flags, badIndices };

  const spikeLimit = { temperature: 1.1, moisture: 8, ph: 0.45, glucose: 8 };
  for (const name of CHANNELS) {
    for (let index = 1; index < samples.length - 1; index += 1) {
      const before = samples[index - 1][name];
      const value = samples[index][name];
      const after = samples[index + 1][name];
      if (Math.abs(value - (before + after) / 2) > spikeLimit[name] && Math.abs(before - after) < spikeLimit[name]) {
        flags.push(`Sample ${index + 1}: isolated ${name} spike; recheck contact or calibration.`);
        badIndices.add(index);
      }
    }
    const lastIndex = samples.length - 1;
    const previousStep = Math.abs(samples[lastIndex - 1][name] - samples[lastIndex - 2][name]);
    const finalStep = Math.abs(samples[lastIndex][name] - samples[lastIndex - 1][name]);
    if (finalStep > spikeLimit[name] * 2 && previousStep < spikeLimit[name]) {
      flags.push(`Sample ${lastIndex + 1}: abrupt ${name} endpoint; recheck contact or calibration.`);
      badIndices.add(lastIndex);
    }
  }
  return { valid: flags.length === 0, flags, badIndices };
}

export function analyze(samples, model) {
  const checked = inspectQuality(samples);
  const last = Array.isArray(samples) && samples.length ? samples[samples.length - 1] : null;
  const latest = Object.fromEntries(CHANNELS.map((name) => [name, last && typeof last === "object" ? (last[name] ?? null) : null]));
  const quality = { valid: checked.valid, flags: checked.flags };
  if (!quality.valid) {
    return {
      quality,
      patternScore: null,
      decision: {
        action: "recheck",
        label: "Recheck simulated sensor",
        rationale: "Data-quality gate held the synthetic score and all virtual treatment tokens at zero. Inspect the flagged readings.",
        ultrasoundLevel: 0,
        violetLevel: 0,
      },
      latest,
      evidenceIndices: [...checked.badIndices].slice(0, 4),
    };
  }
  if (!model || !model.weights || !model.means || !model.stds) {
    throw new TypeError("A trained synthetic model is required.");
  }
  const patternScore = probability(features(samples), model);
  const changing = patternScore >= 0.5;
  const high = patternScore >= 0.88;
  return {
    quality,
    patternScore,
    decision: changing
      ? {
          action: "review",
          label: "Prepare human review",
          rationale: "The generated trace matches a synthetic changing-pattern class. The virtual levels illustrate a disconnected control policy, not a treatment recommendation.",
          ultrasoundLevel: high ? 3 : 1,
          violetLevel: high ? 2 : 1,
        }
      : {
          action: "record",
          label: "Record synthetic trace",
          rationale: "The generated trace matches the stable-pattern class. Keep the measurements available for human review.",
          ultrasoundLevel: 0,
          violetLevel: 0,
        },
    latest,
    evidenceIndices: [0, 5, 18, 23],
  };
}
