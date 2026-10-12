import test from "node:test";
import assert from "node:assert/strict";
import { analyze, generateScenario, trainSyntheticModel } from "../engine.js";

const model = trainSyntheticModel();

test("demo traces are deterministic, complete, and use four bounded channels", () => {
  for (const key of ["stable", "change", "fault"]) {
    const scenario = generateScenario(key);
    assert.deepEqual(scenario, generateScenario(key));
    assert.equal(scenario.samples.length, 24);
    assert.deepEqual(scenario.samples.map((sample) => sample.t), Array.from({ length: 24 }, (_, index) => index));
    for (const sample of scenario.samples) {
      assert.deepEqual(Object.keys(sample), ["t", "temperature", "moisture", "ph", "glucose"]);
    }
  }
  assert.throws(() => generateScenario("infection"), RangeError);
});

test("classifier is fitted and evaluated on separate deterministic synthetic traces", () => {
  assert.deepEqual(model, trainSyntheticModel());
  assert.equal(model.trainCount, 320);
  assert.equal(model.testCount, 128);
  const { tp, tn, fp, fn, accuracy, precision, recall } = model.metrics;
  assert.equal(tp + tn + fp + fn, model.testCount);
  assert.equal(accuracy, (tp + tn) / model.testCount);
  assert.equal(precision, tp / (tp + fp));
  assert.equal(recall, tp / (tp + fn));
  assert.ok(accuracy > 0.9);
  assert.ok(accuracy < 1, "held-out synthetic examples should include ambiguous patterns");
});

test("stable and changing synthetic patterns lead to distinct bounded virtual actions", () => {
  const stable = analyze(generateScenario("stable").samples, model);
  const changing = analyze(generateScenario("change").samples, model);
  assert.equal(stable.quality.valid, true);
  assert.equal(changing.quality.valid, true);
  assert.ok(stable.patternScore < 0.5);
  assert.ok(changing.patternScore >= 0.5);
  assert.equal(stable.decision.action, "record");
  assert.equal(changing.decision.action, "review");
  for (const result of [stable, changing]) {
    assert.ok(result.evidenceIndices.every((index) => index >= 0 && index < 24));
    assert.ok(result.decision.ultrasoundLevel >= 0 && result.decision.ultrasoundLevel <= 3);
    assert.ok(result.decision.violetLevel >= 0 && result.decision.violetLevel <= 3);
  }
});

test("missing and implausible readings fail closed even on a changing trace", () => {
  const fault = analyze(generateScenario("fault").samples, model);
  assert.equal(fault.quality.valid, false);
  assert.equal(fault.patternScore, null);
  assert.equal(fault.decision.action, "recheck");
  assert.equal(fault.decision.ultrasoundLevel, 0);
  assert.equal(fault.decision.violetLevel, 0);
  assert.ok(fault.quality.flags.some((flag) => flag.includes("ph")));
  assert.ok(fault.quality.flags.some((flag) => flag.includes("glucose")));
  assert.deepEqual(fault.evidenceIndices, [21, 23]);
});

test("every channel, sample count, and isolated spike is quality-gated", () => {
  for (const channel of ["temperature", "moisture", "ph", "glucose"]) {
    const samples = structuredClone(generateScenario("stable").samples);
    samples[7][channel] = null;
    const result = analyze(samples, model);
    assert.equal(result.quality.valid, false);
    assert.equal(result.patternScore, null);
    assert.equal(result.decision.ultrasoundLevel, 0);
  }
  const short = generateScenario("stable").samples.slice(1);
  assert.equal(analyze(short, model).quality.valid, false);
  const noisy = structuredClone(generateScenario("stable").samples);
  noisy[12].temperature += 2;
  assert.equal(analyze(noisy, model).quality.valid, false);
  const badEndpoint = structuredClone(generateScenario("stable").samples);
  badEndpoint[23].temperature += 3;
  assert.equal(analyze(badEndpoint, model).quality.valid, false);
});
