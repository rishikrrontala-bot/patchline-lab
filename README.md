# Patchline Lab — Next Founders edition

A local measurement workbench for wearable-sensor research: map a recording, inspect exact evidence, compare a reference or repeat experiment, and reproduce the investigation from an exported workspace.

Built by **Rishik Rontala**, solo. This separate edition preserves the original Patchline and its other hackathon entries.

## Run and verify

Node 22 or newer. No dependencies, account, API key or runtime AI service.

```sh
npm start
```

Open http://127.0.0.1:8789. Stop with Ctrl-C; optionally set `PATCHLINE_LAB_PORT`. Browser modules require HTTP. The preview serves an explicit public allowlist. Static hosting needs only the packaged public files.

```sh
npm test
node tools/verify-research.mjs
```

The first command runs independent domain/validation tests. The second executes 120 independent analytic engineering cases and verifies the 5,000-row external-recording pipeline, saving actual results and timings in `proof/research-verification.json`. Browser verification also exercises the complete workflow, print, finance, mobile layout and runtime privacy. See [verification](submission/VERIFICATION.md).

## Complete workflow

1. **Try a discrepancy investigation** loads a labelled changing synthetic control, modifies a copy gradually, and compares it with the unchanged control. Shape-only checks can pass while a supplied control reveals a discrepancy.
2. **Load recorded temperature** imports 5,000 credited environmental readings from UCI. Values remain unchanged, the classifier stays disabled, and 76 sampling gaps remain visible under the declared 60-second maximum.
3. Upload your CSV and confirm columns/units. One sensor is enough. Unselected channels are absent; blank values in a selected channel remain missing.
4. Load a reference/repeat recording, or use the original as a declared experimental control. Apply alignment, tolerance, uncertainty, coverage and reference-step assumptions.
5. Follow a finding to its exact sample and expand **Why was this flagged?** for values, neighbors and the rule.
6. Edit a named, versioned protocol; export it with the import profile. Applying a protocol resets controlled modifications so checks under the new assumptions remain explicit.
7. Export JSON, comparison, print or the complete workspace. Restore to recompute evidence. Restored measurements stay imported, and saved operation descriptions are unverified metadata.

## CSV and units

Comma delimiter, dot decimals and numeric elapsed timestamps; BOM, CRLF, quoted/escaped/multiline fields supported. Bounds: 1 MiB UTF-8, 5,000 data rows, 16 columns, 256 characters per field, minimum three samples. Duplicate/empty headers, ragged rows, malformed quotes, nonfinite numbers and reversed timestamps are rejected. Extra unmapped columns are allowed but omitted from normalized exports; retain the raw file separately.

Canonical example (select only channels present):

```csv
timestamp_s,temperature_c,wetness_pct,ph,glucose_au
0,32.4,40,6.0,34
1,32.5,41,6.1,35
2,32.4,40,6.0,34
```

Time: seconds/milliseconds. Temperature: C/F/K converted to °C. Wetness: percent/fraction converted to %. pH is dimensionless; glucose is arbitrary experimental AU. Suggestions need confirmation. Raw voltage is not automatically converted to a physical/chemical measurement.

## Comparison semantics

`current timestamp − offset` matches the nearest actual comparison timestamp within the declared distance. Reference samples are not reused. There is no interpolation or extrapolation. Surrounding reference reading changes above the declared step limit make evidence unavailable; this does not establish that the reference is defective.

For absolute difference `d`, uncertainty bound `u`, tolerance `t`: within when `d + u <= t`, exceeds when `d − u > t`, otherwise uncertain. Insufficient pairs/coverage produce an inconclusive result. Repeat differences describe change; reference discrepancies depend on the supplied reference. Neither proves sensor drift or calibration accuracy. Comparison readings are bounded to ±1 billion for finite statistics.

## Architecture

- `research-engine.js`: mapping, conversion, protocol validation, one-to-one comparison, explanations and strict workspace serialization.
- `economics-engine.js`: per-lab economics with labor, fees, acquisition/onboarding, replacement churn, first-month losses and hypothetical customer time value.
- `lab-engine.js`: full-recording checks, copied faults, internally owned traces, analysis-bound reports and the historical fault benchmark.
- `engine.js`: inherited synthetic generator/classifier. Imports/restores never regain internal ownership or a pattern score.
- `lab-app.js` / `workbench.js`: local interaction, replay, evidence navigation and exports.

See the [architecture walkthrough](submission/technical-walkthrough.html). QC and matching are linear in row count over a fixed channel set; display reduction preserves missing breaks while checks/exports retain every row. The 5,000-row bound is verified. Streaming, shared editing and enterprise load testing are not implemented.

The historical standalone synthetic benchmark remains separate: seed 42 gives 75 detected / 100 faulted, 25 smooth-drift misses and zero false holds / 100 clean. New reference tests do not retrospectively alter it. No real fault-detection accuracy is claimed.

## Independent dataset credit

[Room Occupancy Estimation](https://doi.org/10.24432/C5P605), Adarsh Pal Singh and Sachin Chaudhari, UCI, CC BY 4.0. First 5,000 S1_Temp values and original Date/Time are retained; timestamps alone become elapsed seconds without assuming a timezone. [Manifest](samples/uci-manifest.json) records sources, transformations and SHA-256 checksums. Reproduce with `python3 tools/prepare-uci-sample.py PATH_TO_PUBLIC_SOURCE_ZIP`.

Environmental temperature proves import interoperability, not smart-bandage, patient or calibration performance. No source endorsement is implied.

## Business, privacy and submission

The proposed $300 pilot and $99/month maintained-workflow service are hypotheses. The calculator exposes first-month losses and buyer-value shortfalls. No interviews, customers, commitments or measured savings are recorded. Read the [pilot](submission/PILOT-OFFER.md), [validation kit](submission/CUSTOMER-VALIDATION-KIT.md), [business model](submission/business-validation.md) and [Devpost draft](submission/DEVPOST-DRAFT.md).

Files stay in the current tab unless explicitly downloaded. No telemetry, accounts, hidden persistence or runtime network API exists. [LIMITATIONS.md](LIMITATIONS.md) and [MODEL_CARD.md](MODEL_CARD.md) describe the boundaries. No diagnosis, treatment recommendation or hardware control is provided.

GLM 5.2 through Featherless generated add-on modules and the earlier interface as a coding assistant, followed by local integration, substantial review corrections and independent tests. The delivered app never calls Featherless. Credentials, prompts, generation tooling and budget logs are excluded from the package; the authorized coding cap remains $10.

The silent five-minute demonstration and [voiceover script](submission/next-founders-pitch.md) support the entry. Rishik supplies narration and Public/Unlisted upload; submission is not claimed until confirmed.

## Buyer task-value worksheet

A separate worksheet starts with blank task, usage and setup inputs; only proposed fees are prefilled. Compare the same complete, correct reporting task. Enter estimates or self-reported measurements with a note; the app does not independently validate either. Negative time differences remain negative. Monthly labor value, full upfront fees/setup and payback are separate, with unavailable payback when net value is nonpositive. No avoided-error or clinical benefit is monetized. Export the actual applied inputs/calculations as JSON; edits invalidate the result. The browser workbench remains free to evaluate.

GLM 5.2 generated this pure module, DeepSeek V4 Pro reviewed the business specification, and independent tests caught accessor and exact-break-even boundaries before release. Current automated total: 111 passing tests. Browser tooling optionally uses Playwright plus installed Chrome; `npm install --no-save playwright` is needed only to reproduce browser checks.
