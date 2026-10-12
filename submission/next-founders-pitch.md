# Patchline Lab — v2 five-minute voiceover

**Builder:** Rishik Rontala, solo. **Spoken text:** 634 words, approximately five minutes at 127 words/minute with short pauses. Rehearse against the recorded timeline; headings and on-screen instructions are not narration. Voiceover recording and Public/Unlisted upload remain to be completed.

## 0:00–0:30 · Problem and researcher

**On screen:** Show the hero and investigation workflow.

I'm Rishik Rontala, and this is Patchline Lab. When a sensor trace changes, did the experiment change, or did the measurement fail? Physiological changes and sensor drift can look similar. Researchers need source readings, timing and a meaningful comparison. Patchline gives small sensor teams a repeatable investigation and handoff workflow. It supports research review without diagnosing patients or certifying sensors.

## 0:30–1:15 · Recorded environmental import

**On screen:** Load recorded temperature; show credit, selected channel, full-record QC, sampling gaps and exact rows.

First, here are five thousand recorded temperatures from UCI's Room Occupancy Estimation dataset. Source values and row order are preserved. Dates and times become elapsed seconds, with original timestamps retained in the sample. Attribution and transformation hashes are available here. This is environmental import evidence.

The mapping selects temperature alone, so absent channels stay excluded. Blank selected readings remain missing. Replay moves the cursor; checks cover every row. The selected protocol finds seventy-six sampling gaps. These are timestamp findings, not seventy-six verified sensor failures. The dataset supplies no patient, bandage or calibration ground truth.

## 1:15–2:20 · Controlled comparison investigation

**On screen:** Load the labelled synthetic investigation, inject drift, choose original as control, compare and navigate one exact discrepancy.

Next, I'll switch to a labelled synthetic investigation. The trace already changes, showing why a trend alone cannot establish drift. I inject gradual drift into a copy, preserving the original. Then I choose the original as the control. This is generated software evidence, not a calibrated laboratory reference.

The comparison uses actual paired readings. I declare alignment, tolerance and uncertainty, then run it. Results distinguish within-tolerance, uncertain, exceeding and unavailable pairs. Insufficient coverage remains inconclusive.

Clicking this discrepancy opens the exact sample, original and derived values, and paired control reading. The explanation states the rule and measured difference. I can inspect neighboring samples and export evidence. For a real reference, provenance and uncertainty still need review. A difference cannot establish which device is wrong; it gives the researcher a reproducible question to investigate.

## 2:20–2:55 · Workspace and reusable protocol

**On screen:** Export protocol/profile and workspace; restore and show the same evidence and imported/model-disabled state.

Now the experiment can survive a handoff. I export its reusable protocol and mapping profile, then save the workspace: original and derived readings, operations, settings and comparison recording. Restoring reopens the evidence while treating readings as imported data, with the synthetic classifier disabled. The printable summary supports review; JSON preserves full selected data. Retain the raw source separately. Exports are ordinary files, not signed evidence.

## 2:55–3:35 · Architecture and bounded scaling

**On screen:** Show the three pure engines, test results and the local processing boundary.

The architecture separates pure JavaScript engines from the interface. One handles quality checks and faults; another handles mapping, comparison and restoration. The economics module calculates explicit assumptions. One hundred eleven automated checks pass.

CSV parsing is bounded to one megabyte and five thousand rows, with supported units and optional channels. Plot reduction changes display, not evidence. Processing stays in this browser tab, without runtime LLM calls, network APIs or required keys. I used GLM five point two through Featherless for code, and DeepSeek for finance review, then independently tested the implementation.

## 3:35–4:10 · Distinct software benchmarks

**On screen:** Show original 75/100 benchmark and the separate 120/120 independent comparison results with scope labels.

The original generated-fault benchmark detects seventy-five of one hundred faults, misses twenty-five smooth drifts, and produces zero false holds across one hundred clean cases.

A separate independent software suite passes one hundred twenty of one hundred twenty comparison cases. Those cases check specified expectations for stable signals, changes, offsets and uncertainty. They establish software behavior, not clinical accuracy or calibration. Comparison adds evidence when appropriate; it does not rewrite the original benchmark or turn every trend into a fault.

## 4:10–5:00 · Bounded business offer and next proof

**On screen:** Show six-hour $300 pilot, $99 maintained workflow, calculator base/first-month result, customer value shortfall and blank buyer evidence.

The buyer hypothesis is a lab manager or principal investigator. This separate worksheet starts blank and compares the same correct reporting task. Negative savings stay negative; entered measurements remain unverified. I propose a three-hundred-dollar, two-week pilot, capped at six hours for one supported format and protocol, then test ninety-nine dollars monthly for maintained workflows.

Founder labor is costed at thirty dollars an hour. Five hypothetical labs yield four hundred ninety-five dollars revenue and one hundred seventy-two dollars sixty-five cents monthly surplus after the modeled costs. Acquiring all five makes the first month lose five hundred thirty-nine dollars eighty-five cents.

The buyer's assumptions imply only forty dollars monthly labor value against ninety-nine dollars. No savings, interviews or commitments are claimed. We need a permissioned task comparison and an actual budget owner to validate value and price.

## Exact calculator values to keep on screen

These are planning assumptions, not observed customers or profit. The base model uses five labs, $99/month, one support hour per lab at $30/hour, $120 shared costs, a $60 acquisition component, three onboarding hours, 5% monthly churn and a 3% fee.

| Base result | Value |
|---|---:|
| Monthly revenue | $495 |
| All modeled monthly costs | $322.35 |
| Monthly surplus | $172.65 |
| First-month surplus, all five labs newly acquired | −$539.85 |
| Sustainable break-even | 3 labs |
| Acquisition payback | 2.27 months |
| $300 pilot, six delivery hours: modeled contribution | $111 |
| Hypothetical buyer labor value: 8 runs × 10 minutes × $30/hour | $40/month against a $99 price |

Pilot contribution excludes acquisition and other omitted costs. Do not add it to recurring results without reconciling overlapping onboarding labor. No time savings or prices are validated.

## Recording and publication checks

- Keep UCI/environmental credit, synthetic labels and original/control distinctions visible. The 76 gaps belong to the selected demonstration protocol; do not call them established sensor faults.
- Keep the 75/100 generated-fault benchmark separate from the 120/120 independent comparison cases. Neither supplies patient outcomes, calibration or imported-data accuracy.
- Show readable architecture source and actual test output. Confirmed: 111 automated tests and 51 browser workflow groups (16 established + 21 expanded + 14 buyer worksheet), plus five targeted status regressions reported separately.
- Keep private files, keys and build logs off-screen. Automated recording stays muted.
- Add the verified live/repository URLs and Public/Unlisted narrated video to the Devpost draft. Verified live site: https://patchline-lab.vercel.app; source: https://github.com/rishikrrontala-bot/patchline-lab.
- Protect submission by **October 15, 2026, 3:00 p.m. EDT**; official deadline is **5:00 p.m. EDT**. Allow upload and processing time.

Source: [UCI Room Occupancy Estimation dataset](https://archive.ics.uci.edu/dataset/864/room%2Boccupancy%2Bestimation), Adarsh Pal Singh and Sachin Chaudhari, CC BY 4.0. The dataset is environmental interoperability evidence only.
