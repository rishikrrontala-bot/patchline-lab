# Patchline Lab — business validation

**As of 10 October 2026: no customer interviews, measured user savings, paid pilots, purchase commitments or partnerships recorded.** Prices and economics below are hypotheses. No outreach was sent while preparing these materials. Built by Rishik Rontala, solo.

## Buyer and job

Start with a small research team developing multi-channel wound sensors. The daily user is a sensor engineer or researcher; the possible buyer is a principal investigator, lab manager or project lead. The proposed job: turn one permissioned, non-patient benchtop recording into a reviewable quality report, preserving the original, agreed units, experimental protocol, exact findings and controlled perturbations.

[Three documented research projects](market-evidence.md) establish relevant activity. They are discovery examples, not customers, endorsements, proof of demand or a market-size estimate. Workflow fit and purchasing authority remain unverified.

## Existing alternatives and import reality

| Alternative | Verified capability | What we must prove |
|---|---|---|
| PalmSens PSTrace | Calibration/analysis, scripting and spreadsheet exports. [Official product description](https://www.palmsens.com/software/ps-trace/). | A repeated evidence/review task that existing software does not handle adequately. No comparison has been measured. |
| GraphPad Prism / spreadsheets | CSV can use comma or semicolon separators depending on the decimal convention; some table semantics are lost in export. [Official export guide](https://www.graphpad.com/guides/prism/latest/user-guide/using_exporting_from_data_tables.htm). | A reviewed mapping preserves channels, units, nulls and timestamps. “CSV” alone does not establish compatibility. |
| Python notebooks using pandas | The CSV reader supports delimiter, header, decimal, missing-value and date options. [Official API documentation](https://pandas.pydata.org/pandas-docs/stable/reference/api/pandas.read_csv.html). | A browser workflow improves a real user's preparation or handoff without reducing correctness; capable teams may prefer scripts. |

PalmSens also documents CSV autosaving and splitting scans/traces into files. [Official autosave tutorial](https://www.palmsens.com/knowledgebase-article/pstrace-multitrace-tutorial-21-how-to-never-lose-your-data-with-autosaving/). A pilot therefore needs exact export settings, a sample and a reviewed mapping. Raw electrical channels are not automatically calibrated pH, temperature or glucose. There is no verified vendor connector or universal importer. Newly implemented profiles need acceptance checks before being described as supported.

**Differentiation hypothesis:** linking source readings, experimental checks, controlled faults and reproducible evidence locally can improve handoff. Local processing is structural; speed, uniqueness, savings and willingness to pay require evidence.

## Offer to test

The [pilot offer](PILOT-OFFER.md) proposes **$300 for a two-week evaluation**, capped at **six founder hours**, one lab, one already supported export format and one experimental protocol. It includes mapping review, a small acceptance pack and handover. New arbitrary formats or calibration work require separate feasibility and scope; they are not promised inside six hours. Patient data, hardware, clinical interpretation and open-ended customization are excluded. Confirm purchasing requirements before work.

After a useful pilot, test **$99/month per lab** for maintained export/protocol templates, regression checks, report instructions and up to one asynchronous support hour monthly. Start with at most three labs; additional formats/devices require separate scope. If a stable one-time package solves the job, offer that instead. The current prototype has no billing, license enforcement, saved accounts or team collaboration. Charging needs maintenance/service value; the downloadable prototype does not establish recurring demand.

## Pilot economics

Model defaults: $300 pilot price, six delivery hours at $30/hour and a hypothetical 3% payment fee. That gives $180 delivery labor plus $9 fees: **$111 contribution before acquisition, other cash, taxes and omitted costs**. The fee is not a payment-provider quote. These are planning inputs, not observed work or profit.

| Pilot delivery work | Labor | Fee | Contribution before omitted costs |
|---|---:|---:|---:|
| 4 hours: upside assumption | $120 | $9 | $171 |
| 6 hours: proposed base cap | $180 | $9 | $111 |
| 8 hours: alternative, only if separately agreed | $240 | $9 | $51 |
| 10 hours: downside overrun | $300 | $9 | −$9 |

Additional cash costs reduce these figures dollar for dollar; $20 of extra cash would reduce the base to $91. Record actual work by task. Six hours can cover review/setup of a supported export, not an open-ended instrument integration. Decline or re-scope an incompatible format before starting.

## Recurring economics synchronized with the calculator

These match `economics-engine.js` base/downside/upside input assumptions; they remain hypotheses. Common inputs: founder labor $30/hour, payment fee 3%, shared overhead/maintenance $120/month, and $300 pilot price. Fixed costs exclude lab-specific support, acquisition and onboarding. The acquisition budget/CAC component excludes onboarding; all-in acquisition per lab is `CAC component + onboarding hours × hourly labor`. Do not count that same onboarding cost twice.

The monthly model holds each scenario's lab count constant. Expected replacement acquisition = `labs × monthly churn × all-in acquisition per lab`; fractional replacements describe an average, not a current prospect. The separate first-month model assumes **all labs are newly acquired**, charges acquisition once and does not also charge a replacement reserve. Pilot income/cost is excluded from both recurring models. Pilot and recurring results are not additive without reconciling overlapping onboarding labor.

| Input / result | Downside planning | Base planning | Upside planning |
|---|---:|---:|---:|
| Hypothetical labs | 3 | 5 | 10 |
| Monthly price per lab | $79 | $99 | $129 |
| Support hours per lab | 2 | 1 | 0.5 |
| Onboarding hours per new lab | 5 | 3 | 2 |
| Acquisition budget/CAC component | $120 | $60 | $30 |
| All-in acquisition per lab | $270 | $150 | $90 |
| Monthly churn | 12% | 5% | 2.5% |
| Monthly revenue | $237 | $495 | $1,290 |
| Payment fees | $7.11 | $14.85 | $38.70 |
| Support labor | $180 | $150 | $150 |
| Shared overhead/maintenance | $120 | $120 | $120 |
| Replacement acquisition | $97.20 | $37.50 | $22.50 |
| Monthly costs | $404.31 | $322.35 | $331.20 |
| **Steady-state monthly surplus** | **−$167.31** | **$172.65** | **$958.80** |
| First-month acquisition, all labs new | $810 | $750 | $900 |
| **First-month surplus** | **−$880.11** | **−$539.85** | **$81.30** |
| Labs to cover shared costs | No sustainable break-even | 3 | 2 |
| Pilot delivery hours / contribution | 10h / −$9 | 6h / $111 | 4h / $171 |

Contribution before replacement = `price × (1 − fee rate) − support hours × labor rate`. Contribution after replacement subtracts `churn × all-in acquisition per lab`. Only a positive after-replacement result permits `ceil(fixed / contribution after replacement)` for break-even. All scenarios include founder labor; low static-hosting costs are not the entire cost of running a service.

Base contribution before/after replacement is $66.03/$58.53. Acquisition payback uses the former: `$150 / $66.03 = 2.27 months`. Under constant 5% monthly churn, illustrative billed lifetime is `1 / 0.05 = 20 months`; contribution LTV before fixed costs is `$66.03 / 0.05 = $1,320.60`. These are assumption-based formulas, not measured retention or guaranteed returns. Downside payback is 16.24 months, exceeding its assumed 8.33-month lifetime; LTV is $138.58 against $270 acquisition. Zero churn does not yield an evidence-backed finite LTV; nonpositive contribution has no payback.

## The buyer's value must justify the price

Calculator defaults assume eight runs/month, ten minutes saved per run and research labor valued at $30/hour. That is **80 minutes / $40 monthly hypothetical labor value**, below the $99 base price by $59. No minutes saved have been measured. On labor value alone, the hypothesis needs at least **20 runs/month** at ten minutes saved, or **24.75 minutes saved/run** at eight runs, to cover $99. This is a validation threshold, not evidence that those savings exist. Other benefits such as clearer review may matter, but their value is unmeasured too.

The earlier $75 simplified example and the previous two-hour-support scenario are superseded by this model. Taxes, insurance/legal obligations, refunds, unpaid invoices, extra infrastructure, significant integrations and many operating costs remain omitted. Start with at most three labs and measure actual work; base economics at three labs give $55.59 monthly surplus before omitted costs, but onboarding/acquisition first-month costs still make it a loss. Five base labs imply five monthly support hours plus shared work; the user counts are capacity hypotheses, not traction.

## Evidence gate and decision

Use the [validation kit](CUSTOMER-VALIDATION-KIT.md) for three conversations across daily-user and buyer roles and at least two permissioned task comparisons. These are discovery goals, not hackathon eligibility requirements. Include negative results and incomplete tasks. Interest is not a sale; laboratory funding is not our budget.

Proceed only if a repeated problem, correct task result, reviewed export and purchasing route emerge. Recurring pricing needs repeated maintenance demand, not merely a successful demo. If existing tools solve the task adequately, narrow or reconsider the offer.

| Evidence | Status | Source / date | Result or objection | Permissioned next step |
|---|---|---|---|---|
| Daily user 1 | Pending | — | — | — |
| Daily user 2 | Pending | — | — | — |
| Buyer / budget owner | Pending | — | — | — |
| Comparable task 1 | Pending | — | — | — |
| Comparable task 2 | Pending | — | — | — |
| Pilot / price commitment | Pending | — | — | — |
