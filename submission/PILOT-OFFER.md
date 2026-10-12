# Patchline Lab — proposed research pilot

**Draft offer to validate, 10 October 2026. No customer has accepted it.** Built by Rishik Rontala, solo. This research-software evaluation makes no clinical performance, time-savings or purchasing claim.

## Who and what

One small sensor-research lab wants to review and hand off one non-patient benchtop recording format. Proposed price: **$300 total for a two-week calendar period, with at most six founder hours**. Agree on scope and acceptance before payment or work. Confirm budget authority, onboarding requirements, payment method and whether the institution can contract with a student builder. No payment has been requested or collected.

The lab retains its acquisition/calibration tools. Patchline supplies a local quality/evidence workflow for readings with agreed meaning and units. Scope: one already supported file format, one reviewed channel mapping, one experimental protocol, up to two evaluation recordings within the delivered application's published limits, and one consolidated revision within the work cap. Arbitrary new export formats are not promised inside six hours. Optional references need permission, alignment and explicit identification; a trend alone is not proof of sensor drift.

## Lab-approved inputs

- A shareable, non-patient benchtop file and exact export settings. An initial synthetic demonstration needs no confidential file.
- Column meanings, time origin/units, channel units, missing-value markers, experimental checks and independently reviewed expected outcomes. A mapping cannot replace calibration.
- A daily user, reviewer, budget owner and purchasing route. One person may hold multiple roles.
- Permission for file use, notes or recording. Publication of files, quotes or affiliations requires separate explicit consent.

Unsupported formats are a feasibility question before the pilot; vendor integration is not implied. If the sample cannot be mapped correctly within the work cap, decline or revise scope before accepting the pilot.

## Deliverables and work budget

| Work | Founder-hour cap | Deliverable |
|---|---:|---|
| Kickoff and feasibility review | 0.5 | Agreed task, permissions, supported sample and checklist |
| Supported mapping/protocol setup | 1.5 | Reviewed units, nulls, time mapping and pinned settings |
| Acceptance/reproducibility checks | 1.5 | Reviewed fixture pack, actual results and known misses |
| Observed task comparison | 0.5 | Completion/time/error worksheet, including setup and assistance |
| Handover | 1 | Versioned local package, report instructions and limitations |
| One consolidated revision | 1 | Corrections within the same format/protocol and total cap |
| **Total** | **6** | Two calendar weeks do not imply full-time development |

An eight-hour alternative must be separately agreed; at the same $300 price its modeled contribution is $51 before acquisition and omitted costs. Do not promise a new vendor connector, arbitrary parser or calibration within either cap.

## Acceptance agreed before work

1. **Correct mapping.** The lab reviewer independently verifies timestamps, units, nulls and at least five selected source readings against the raw file. Unsupported/malformed inputs fail visibly. Silent dropping or invented values fails acceptance.
2. **Intact originals.** Perturbations change a copy. Findings identify relevant source rows; reports distinguish original/derived readings and operations. A smooth change without a suitable reference is unresolved, not diagnosed as drift.
3. **Agreed test outcomes.** Use an unchanged case and approved missing-reading, timestamp-gap and spike cases with independent expected outcomes. Report detected/missed faults and false holds from actual counts, including legitimate transients flagged. Do not promise every fault is detected or extrapolate to patients.
4. **Reviewable handoff.** JSON export and printable summary identify application version, mapping/protocol settings, evidence and limitations. The same supported inputs/settings reproduce agreed results. Reports are not signed or tamper-proof.
5. **Real task completion.** After equal short training, the user reviews a new supported recording and produces the agreed report. Record completion, time, errors and assistance. Agree on any time target after observing the baseline; savings cannot be promised in advance.

The reviewer records pass/fail and unresolved limitations. Use the included revision if needed. Do not claim success or continue to a paid recurring service until the reviewer accepts the delivered scope. Further work needs a separate agreement; do not silently expand the pilot.

## Exclusions and continuation

No patient data, diagnosis, treatment advice, medical validation, hardware control, bespoke electronics, calibration, live streaming, unlimited formats, regulatory certification, uptime guarantee or continuous support. The current static prototype has no hosted team workspace, paid-license enforcement or billing.

If repeated maintenance is useful, discuss **$99/month per lab** for maintaining the accepted workflow: supported profile/protocol updates, regression checks, versioned local packages, report guidance and up to one asynchronous support hour monthly. Additional devices/formats require separate scope. No 24/7 promise. Begin with at most three labs and measure support load. A stable one-time handoff is a valid outcome; recurring value and price remain unvalidated.

Illustrative calculator economics at six hours: $300 minus $180 labor at $30/hour and $9 assumed payment fee leaves **$111 before acquisition, other cash, taxes and omitted costs**. Ten hours instead loses $9 before those costs. Record actual work. Pilot and recurring calculations are separate; reconcile overlapping onboarding labor before combining them. See [business-validation.md](business-validation.md) for scenarios and the buyer-value threshold; use the [validation kit](CUSTOMER-VALIDATION-KIT.md) to record evidence.
