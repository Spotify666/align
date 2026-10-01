# 10 · Phased plan, risks and exit criteria

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 · Foundation** (done) | Engine, fixtures, capture, report, storage, PDF, deploy | CI green; 0 pulls scored; E2E capture passes |
| **1 · Pilot** | 10 players, 2 coaches, real nets sessions; custom SMTP | ≥ 80% of sessions produce a usable capture; median flow ≤ 4 min |
| **2 · Data** | Labelled set (see 04); calibrate classifier; refit ranges | κ ≥ 0.8; ECE ≤ 0.05; false acceptance ≤ 1% |
| **3 · Assisted tracking** | Bat and ball detection with user confirmation | Marking time ≤ 20 s; keypoint error within tolerance |
| **4 · 3D Session** | Two-phone sync and calibration | Joint-angle agreement vs. lab reference published |
| **5 · Next shots** | Front-foot drive, then back-foot defence | Same gates as the defence, per shot |
| **6 · Bowling** | Action and delivery analysis | Separate ontology and validation plan |

## Risks

| Risk | Mitigation |
|---|---|
| Phone pose is noisy at low fps or in poor light | Quality gate refuses before processing; measures degrade to "not measured" |
| Users skip marking | Report stays "uncertain" and says which mark is missing |
| Provisional ranges mislead | Labelled provisional everywhere; personal baseline is shown separately |
| LLM invents numbers | Contract validator plus template fallback |
| Email rate limits block sign-in | Custom SMTP before Phase 1 |
| Child data | Parent confirmation for under-16 sharing; no birth dates |
