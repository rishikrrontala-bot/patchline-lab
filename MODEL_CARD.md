# Synthetic model and dataset card

## Purpose

The model demonstrates a pattern-classification step in a proposed sensing pipeline. It learns from **synthetic** traces, not patient records. Its output is labeled *simulated pattern score* in the product. It must not be interpreted as calibrated infection risk.

## Data generation

`engine.js` uses a fixed-seed pseudorandom generator to create four channels: patch temperature, dressing wetness, fluid pH, and experimental wound-fluid glucose. Stable and changing examples are generated from coded assumptions. The demo scenarios use distinct seeds from training and evaluation traces so the demo is reproducible without being a copy of a training sample.

The synthetic “changing” class is a scenario label chosen by the builder. It is **not** a clinically adjudicated infection label. Sensor dropout is a separate data-quality state, not a disease class.

## Learning and evaluation

The engine fits a transparent logistic classifier from 320 generated training traces and applies it to 128 separately seeded held-out synthetic traces. `trainSyntheticModel().metrics` reports a held-out confusion matrix and derived metrics; the deterministic checks run with `node --test tests/engine.test.mjs`. The generated classes deliberately overlap. The current held-out result is 58 true positives, 63 true negatives, 1 false positive, and 6 false negatives (94.5% accuracy on generated examples only). Quality-gate checks separately cover missing values, implausible values, and isolated spikes. These are software checks only.

## Intended and prohibited uses

Intended: demonstrate data flow, reproducibility, fault handling, and evidence-linked explanations in a digital twin. Prohibited: infection diagnosis, predicting clinical outcomes, ranking patients, selecting treatment, calculating physical therapy doses, or using the score to control hardware.

## Known failure modes

Synthetic assumptions may make examples easier than real data. Temperature can change with environment/contact; pH can drift or foul; dressing wetness depends on absorbent materials; wound-fluid glucose differs from blood glucose. Missing and noisy data can undermine the model. A data-quality gate must override the model before any synthetic pattern score is shown. The Lab interface includes no treatment controls.

## Human review

No real patient decision is made. For an eventual clinical research study, reference labels would require clinician adjudication and measurements from diverse patients and wound states, with external validation and analysis of missed infections and false alarms. The [IWGDF/IDSA guideline](https://www.idsociety.org/practice-guideline/diabetic-foot-infections/) remains the clinical reference for diagnosis.

## Patchline Lab boundary

Imported measurements never reach this classifier. Only immutable objects returned by the internal synthetic-trace factory are eligible. CSV reimports are unverified imported data even when their numbers came from the template. Lab quality checks support variable-length recordings; the inherited classifier remains a 24-sample demonstration. The Lab fault benchmark evaluates measurement perturbation detection separately, and reports its misses explicitly.
