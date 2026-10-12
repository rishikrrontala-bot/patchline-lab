# Patchline Lab limitations

This browser tool reviews research measurement recordings. It does not diagnose, recommend treatment, control sensors or certify calibration. No patient study, connected hardware or paid pilot is included.

## Import and protocols

Comma CSV, dot decimals, numeric elapsed timestamps and explicitly selected sensor channels are supported. Temperature C/F/K and wetness percent/fraction conversions are explicit. No generic raw-voltage calibration, semicolon/decimal-comma importer, absolute-time parser or vendor connector exists. Extra source columns are omitted from normalized workspaces/reports; retain the raw CSV.

Bounds: 1 MiB UTF-8, 5,000 rows, 16 columns, 256 characters per field and three samples minimum. Missing selected readings differ from unselected/absent sensors. Active QC checks the recording's declared channels. Inclusive ranges, spikes, gaps and optional repeated values are editable research assumptions; legitimate transients/stability may trigger review, and faulty readings can pass. These are not clinical thresholds.

## Reference and repeat comparisons

Nearest actual timestamps are matched one-to-one within a declared offset/distance. No interpolation/extrapolation occurs. Different sampling rates, jitter, missing overlap or blank readings reduce coverage. A reference step beyond the supplied limit marks neighboring evidence unavailable; it may be a legitimate reference change rather than a defective reference.

User-supplied uncertainty is a bound, not an estimated confidence interval. Tolerance/uncertainty determine within, exceeds and uncertain cases. Insufficient pairs/coverage yield an inconclusive result. Shared errors, a bad reference, placement differences, units or clock alignment can mislead. Reference accuracy/provenance are unverified; a rising signal alone never proves drift. Repeat-run differences describe change, not a sensor fault. Comparison readings are bounded to ±1 billion to preserve finite statistics.

The 120 engineering challenge cases use independent analytic signals and predeclared expectations. They test software decisions, not real sensor-fault accuracy. The UCI sample is environmental temperature, without smart-bandage or calibration ground truth. Injected copies are clearly labelled modifications of unchanged originals.

## Historical synthetic evidence

Only immutable internal factory traces can access the inherited classifier. CSV imports/restored workspaces never regain ownership, even if metadata says synthetic. Generated pattern labels are not disease or risk labels.

The historical fault benchmark uses two fixed scenario families. Seed 42 detects 75/100 injected faults and misses all 25 smooth-drift cases, with 0/100 false holds. Reference tests do not replace these counts. No measured competitor comparison is available.

## Privacy, reproducibility and scale

No network API, telemetry, accounts, billing or hidden persistence. A strict content policy disallows network connections; bundled sample data are a same-origin static module. Closing the tab loses unexported state. Downloads are ordinary user-controlled data files; this structure is not a regulatory certification.

Reports snapshot actual source, readings, operations, protocol and findings. Comparison exports retain applied settings, not unapplied edits. Workspace restore validates dependent evidence before replacing current state, recomputes quality/comparison and forces kind to imported. Restored operation descriptions are unverified metadata, not witnessed execution. Files are neither signed nor tamper-proof. Only the documented version-2 workspace/protocol schemas are accepted.

Checks and matching are linear over a fixed channel set. Display reduction retains missing breaks; checks/exports use every row. The 5,000-row bound is tested, and timing evidence names the runtime/scope. Streaming, shared editing, very large files and enterprise load testing are not implemented. Static distribution separates user computation, but hosting capacity is not guaranteed.

## Business evidence

Users, buyers, $300 pilot and $99 recurring pricing remain hypotheses. No interviews, measured savings, customers, commitments or partnerships are recorded. Research citations show an active domain, not purchasing demand. The free browser tools do not enforce paid licenses; maintained-workflow service is a proposed offer.

The calculator includes labor, fees, shared overhead, acquisition/onboarding and constant-size replacement churn. First-month scenarios charge all new customers once without also charging replacement. Taxes, refunds, bad debt and procurement/other costs are omitted. Pilot delivery includes onboarding; combining models requires reconciling overlap. Lifetime/LTV and customer time value are illustrative. Numerically unbounded or nonpositive payback/break-even results are unavailable. Default hypothetical buyer value is $40/month against $99 pricing; the price requires validation.

## Buyer worksheet evidence

Task times and costs are entered by the user; choosing user-measured is a self-reported label, not independently verified observation. Both methods must complete the same task correctly. Setup is additional buyer labor/cash outside the full pilot fee; avoid counting the same cost twice. Only labor time is valued: no avoided-error, clinical or collaboration benefit is added. Positive estimates do not validate demand or guarantee payback; negative and zero results remain visible. The worksheet exports ordinary unsigned JSON and has no hidden persistence.
