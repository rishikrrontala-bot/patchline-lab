# Verified v2 build — October 10, 2026

Built by Rishik Rontala. Separate Next Founders edition; nine original Patchline source hashes remain unchanged.

## Executed checks

- **111 / 112 automated tests pass.** 40 existing checks plus 51 independent research/economics and 21 independent buyer-value acceptance cases. Includes bounded CSV parsing, optional channels, unit conversion, quote/prototype safety, exact tolerance boundaries, one-to-one alignment, insufficient evidence, immutable perturbations, provenance, schema validation, complete workspace preservation and finance arithmetic.
- **51 browser workflow groups pass:** 16 established, 21 expanded research and 14 buyer worksheet checks. Real Chrome exercises mapping, missing versus absent channels, control/reference comparisons, uncertainty, exact sample navigation, applied-settings exports, optional-channel restore, atomic failed restore, protocol/profile reuse, recorded-data import, twelve-row pagination, finance losses/invalid inputs, printable reports and 320-pixel layout. No runtime external requests, JavaScript errors or CSP violations occurred. Stale success/provenance statuses are separately regressed.
- **120 / 120 independent analytic comparison cases pass:** 20 each of shared changing signals, declared relative offsets, below-tolerance differences, uncertainty boundaries, missing reference readings and abrupt reference changes. Fixed deterministic cases under fixed declared settings. This is software verification, not measured sensor-fault accuracy.
- **5,000 recorded UCI temperature rows** pass the import → quality checks → labelled drift copy → original-control comparison pipeline. The 76 source sampling gaps remain present; usable comparison coverage is 100%. Comparison pairs: 3,625 within, 1,125 exceeding, 250 uncertain, zero unavailable. The added perturbation is simulated; original data is environmental, with no calibrated sensor-fault labels.
- **Historical shape-only fault benchmark:** 75 detected / 100 injected faults, 25 missed smooth-drift cases, zero false holds / 100 clean traces. The new comparison method does not rewrite those results. The inherited synthetic pattern classifier is a different demonstration and stays disabled on imported/restored measurements.

## Measured scale

The recorded-data Node pipeline includes parsing, quality checks, copied perturbation and reference comparison. Fifteen repetitions on the development Mac measured median **7.46 ms**, p95 **22.48 ms**. The timing excludes browser rendering, downloads and user task completion.

An additional actual Chrome measurement uses 20 trials after three warmups over 5,000 UCI rows: parser, confirmed profile mapping, immutable trace creation, full quality checks and bound analysis snapshot. The recorded p50/p95 and runtime details are in [browser performance](../proof/research-browser-performance.json). This excludes DOM, charts, network, file selection and user task time. It supports the current file bound, not unlimited-scale or customer-time-saving claims.

CSV bounds are 1 MiB UTF-8 and 5,000 rows; protocol 32 KiB; workspace 4 MiB. Per-tab processing avoids shared compute. Streaming and multi-user collaboration are not implemented.

## Reproduce

```sh
npm test
node tools/verify-research.mjs
npm start
```

With Playwright and Chrome installed, run `node tools/browser-qa.cjs`, `node tools/research-browser-qa.cjs`, and `node tools/research-status-qa.cjs` while the app runs on port 8789. Browser tooling is optional; the application has no dependencies. All launches mute audio.

Executed artifacts: [analytic cases and timings](../proof/research-verification.json), [established browser checks](../proof/browser-qa.json), [expanded checks](../proof/research-browser-qa.json). `node tools/record-demo.cjs --rehearse` validates the five-minute recording actions. `node tools/record-demo.cjs` records them; `node tools/video-qa.cjs` inspects video duration/resolution and frames without speaker playback.

## Release integrity and business evidence

The package uses an explicit public whitelist. No private key, environment file, generation prompt, account state or generation tooling is included. Runtime processing stays in the tab; no AI service is called. GLM 5.2 generated add-on modules as a coding assistant, followed by local implementation corrections and independent tests.

Conservative local generation estimate **$0.4668 of the $10 authorized cap**. This includes reserved maximum costs for interrupted/failed requests. Estimates include actual completed output usage and conservative provider-failure reservations. Provider billing has not been independently reconciled.

Base illustrative finance: revenue $495, monthly costs $322.35, ongoing surplus $172.65, first-month loss $539.85, break-even three labs, acquisition payback 2.27 months, pilot margin $111. Founder labor, transaction fees, onboarding, acquisition and replacement churn are included. Customer time value defaults to $40/month against a proposed $99 price; neither savings nor willingness to pay is validated.

Narrated Public/Unlisted video upload and actual buyer evidence remain submission requirements. The recorded silent demo and matched voiceover script are supplied. No users, interviews, customers, commitments or judge scores are fabricated.

Buyer-value acceptance includes negative savings, zero usage, full setup costs, self-reported measurement scope, a 330-month payoff example, export immutability, strict own data properties, subnormal finite ratios and exact 60-run break-even without a floating-point extra run. The browser sheet has blank task inputs, deliberate same-task confirmation, measured notes and stale-export prevention.

## Published separate release

[Live app](https://patchline-lab.vercel.app) and [public source](https://github.com/rishikrrontala-bot/patchline-lab) are verified without creator authentication. All 51 primary browser groups pass against production; CI passes 112 tests and the 120 analytic cases. Deployment headers enforce connect-src none and nosniff, and private key/generation/configuration routes return 404. Details are recorded in [deployment verification](../proof/deployment-verification.json).

Final narrated-ready silent captures: MP4 and WebM, 299.96 seconds, 1280×720, 25fps, no audio streams. Long recorder holds were removed and recorded actions paced to the seven narration chapters; source readings/results are unchanged. The edit list includes source/output hashes and rejects reuse on a different raw recording. The original capture remains local editing input. Footage records 111 passing checks; one subsequent exact-break-even regression brings the final suite to 112, with default demo figures unchanged.
