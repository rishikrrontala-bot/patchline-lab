# Patchline Lab — Devpost submission draft

**Builder:** Rishik Rontala, solo. **Event:** Next Founders Hackathon.

**Release fields:** live project [patchline-lab.vercel.app](https://patchline-lab.vercel.app); public source [rishikrrontala-bot/patchline-lab](https://github.com/rishikrrontala-bot/patchline-lab); five-minute narrated Public/Unlisted demo **[PENDING — insert verified URL]**. The v2 silent recording and matched narration script are prepared. The separate live site and public source are verified. Narrated upload and Devpost submission remain pending.

## Project name and tagline

**Patchline Lab** — Turn experimental sensor recordings into evidence a research team can review.

## Inspiration

When a sensor trace changes, did the experiment change or did the measurement fail? Physiological and environmental changes can resemble sensor drift. A researcher needs the original readings, units, timing, comparison measurements and assumptions to investigate.

I built Patchline Lab for a small sensor-research team's review and handoff task. Smart-bandage projects such as [TWINSENSE](https://cordis.europa.eu/project/id/101211181) establish relevant research activity. They are discovery examples, not customers, partnerships or proof of demand. Vendor software, spreadsheets and notebooks remain serious alternatives.

## What it does

The browser workflow is **map → inspect → compare → explain → reproduce**:

- **Map actual channels.** Select source columns and declared units for any supported subset of temperature, dressing wetness, pH and experimental glucose in arbitrary units. Convert declared temperature C/F/K, wetness fraction/percent and time seconds/milliseconds explicitly. Absent channels stay excluded; blank selected values stay missing. Raw voltage requires separate calibration.
- **Inspect a complete recording.** Full-record checks follow the chosen experimental protocol. Replay moves the cursor while every row remains checked. Create a controlled fault in a copy, keeping the original normalized readings intact.
- **Compare declared evidence.** Align actual samples with a reference or repeat run using explicit tolerance, uncertainty and coverage settings. Distinguish within-tolerance, exceeding, uncertain and unavailable pairs. Insufficient coverage stays inconclusive. A difference does not establish which device is wrong; a trend alone does not prove drift.
- **Explain exact findings.** Navigate from a finding to its source sample, values, neighboring readings and comparison pair. Export the evidence and print a review summary.
- **Reproduce the handoff.** Export reusable mapping/protocol settings and a workspace containing original/derived samples, operations and comparison recording. Restored workspaces remain imported data with the synthetic classifier disabled. Retain the raw source file separately.

The labelled synthetic investigation demonstrates a changing baseline, injected gradual drift and comparison against the original control. That control establishes a software experiment; a real laboratory reference still needs verified provenance and uncertainty.

## Recorded data and provenance

The bundled sample preserves the first **5,000 `S1_Temp` values** and their order from **Room Occupancy Estimation**, by Adarsh Pal Singh and Sachin Chaudhari, **CC BY 4.0**. Dates/times become elapsed seconds; original timestamps remain in the sample. The manifest records transformations and source/sample hashes. [UCI dataset and citation](https://archive.ics.uci.edu/dataset/864/room%2Boccupancy%2Bestimation), [license](https://creativecommons.org/licenses/by/4.0/).

The selected demo protocol identifies **76 sampling gaps**. These are timing findings, not established sensor failures. This dataset demonstrates environmental-recording import interoperability. It supplies no bandage, patient, calibration or sensor-fault ground truth, and no endorsement is implied. Occupancy labels are not used as fault labels.

## Architecture, testing and measured limits

HTML, CSS and JavaScript modules deliver the interface. Pure engines separate quality/fault logic, mapping/comparison/workspace logic and economics. Node.js supports tooling and automated tests. CSV import is bounded to **1 MiB and 5,000 rows**. Plot reduction affects display; checks and exports use full selected data.

Processing stays in the current browser tab with no required key, processing backend or runtime LLM call. **GLM 5.2 through Featherless was a coding assistant**; generated code received review corrections and independent checks. The older synthetic classifier is restricted to internally generated examples and does not score imported or restored user data.

**Confirmed:** **111 automated tests pass** and **37 primary browser workflow groups pass**: 16 established + 21 expanded + 14 buyer worksheet research + 14 buyer worksheet checks. Five additional status/provenance regressions pass and are reported separately rather than added to the primary-group count. Browser checks exercise the complete import-to-export workflow, invalid/atomic restore, applied-settings snapshots, exact sample links, optional channels, pagination, finance errors/losses, printing and 320-pixel layout. They observed no JavaScript errors, CSP violations or runtime external requests.

On the development Mac, twenty Chrome engine trials after three warmups over 5,000 recorded rows measured **p50 9.0 ms / p95 10.6 ms** for parsing, mapping, immutable trace creation, quality checks and the analysis snapshot. This excludes DOM/chart rendering, file selection, network and user task time; it is evidence for the current file bound, not a researcher-savings claim. [Executed verification and methods](VERIFICATION.md).

Two distinct software evaluations remain visible:

| Evaluation | Actual scope and result |
|---|---|
| Original generated-fault benchmark | 75 of 100 injected faults detected; all 25 smooth-drift cases missed; 0 false holds across 100 generated clean cases |
| Independent comparison suite | 120 of 120 specified comparison software cases pass |

The comparison suite checks implementation against specified expectations. It does not replace the original benchmark or establish clinical accuracy, calibration, reference trust or accuracy on the UCI recording.

The static architecture distributes processing to each user's browser. Its bounded release is not an enterprise load test. Live hardware, streaming, arbitrary channels, hosted collaboration and clinical deployment remain outside scope. Exported files are not signed or tamper-proof. The [architecture walkthrough](technical-walkthrough.html) shows the pure engines and the browser processing boundary.

## Originality

This is a separate Next Founders extension of my existing Patchline project. The original project and other submissions are preserved. This edition adds supported-column/unit mapping, configurable protocols, controlled experiments, reference/repeat comparison, explanations, portable workspaces and a scoped business offer.

The proposed differentiation is an understandable local investigation and handoff loop around existing acquisition tools: a change prompts an investigation, an actual comparison adds evidence, and a colleague can reopen the same readings and declared assumptions. Within-tolerance, uncertain and unavailable states remain distinct. We have not established market uniqueness or measured superiority over competing products.

## Business and finance

The daily user hypothesis is a sensor engineer or researcher; the budget owner may be a PI, lab manager or project lead.

The proposed **$300, two-week pilot** covers one already supported format, one agreed protocol, two recordings, reviewed acceptance and handover within **six founder hours**. It excludes patient data, arbitrary integrations and calibration. An accepted workflow could lead to a proposed **$99/month per-lab maintenance service**, including updates, regression checks, report guidance and up to one asynchronous support hour. A one-time handoff remains a valid outcome. Billing, license enforcement and hosted team accounts are not implemented.

Base assumptions: five labs, $99/month, one support hour/lab at $30/hour, $120 shared overhead, $60 acquisition component, three onboarding hours, 5% monthly churn and a 3% payment fee.

| Base planning result | Value |
|---|---:|
| Monthly revenue / modeled costs | $495 / $322.35 |
| Monthly surplus | $172.65 |
| First-month surplus, all five labs new | −$539.85 |
| Sustainable break-even / acquisition payback | 3 labs / 2.27 months |
| $300 pilot contribution, six delivery hours | $111 before acquisition and omitted costs |

All inputs are unvalidated; these are scenarios, not customers or forecasts. Pilot and recurring results require overlapping onboarding labor to be reconciled before combining them. Taxes and other operating costs remain omitted.

Buyer-side defaults—eight runs/month, ten minutes saved/run and $30/hour—imply only **$40/month labor value versus a $99 price**. No savings have been measured. Labor-only coverage would require twenty such runs/month or 24.75 minutes saved on each of eight runs. Other benefits require buyer evidence too.

There are **no buyer interviews, measured user savings, paying customers, purchase commitments or partnerships**. The [pilot offer](PILOT-OFFER.md) and [validation kit](CUSTOMER-VALIDATION-KIT.md) define task/time/error measurement, permissions and budget questions without fabricating traction. The daily user hypothesis is narrow enough to test, and the budget owner must be established before interpreting interest as a purchasing route.

## What I learned and what comes next

Useful evidence has boundaries: a missing reading cannot become zero, a restored file cannot unlock synthetic scoring, an export must preserve its analysis-time values, and a changing signal does not establish a faulty sensor.

The next proof is a permissioned, non-patient benchtop recording with reviewed units, expected findings and comparison provenance, followed by a complete reporting task against the user's actual workflow. Record correct completion, errors, setup, assistance and elapsed time. Then test the exact capped offer with a budget owner and log founder work. Continue only if the task is correct, the problem repeats and a purchasing route exists. A polished demo is not a guarantee of a judge score or company demand.

## Built with

HTML · CSS · JavaScript · Node.js tooling · GLM 5.2 and Featherless as build assistance.

## Five-minute evidence sequence

0:00 problem → 0:30 recorded environmental import → 1:15 controlled discrepancy investigation → 2:20 workspace/protocol handoff → 2:55 pure-module architecture → 3:35 distinct software benchmarks → 4:10 scoped offer and economics.

## Buyer value without invented savings

A new separate worksheet starts blank for task times, frequency, labor and additional setup. Proposed prices remain editable. It compares the same correctly completed report, retains negative savings, separates ongoing value from full upfront costs and shows unavailable payback when appropriate. User-measured values require a task note and remain self-reported/unverified. No avoided-error or clinical benefit is monetized. Actual inputs and calculations export together; editing invalidates a stale result. At 20 reports/month and 10 minutes saved at $30/hour against $99/month, net value is only $1; a $330 upfront outlay takes 330 months to recover. That is a decision threshold, not a customer claim.
