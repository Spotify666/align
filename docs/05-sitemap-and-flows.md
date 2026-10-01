# 05 · Sitemap and flows

## Sitemap

| Route | Purpose |
|---|---|
| `/` | What Align does, sample report, the four outcomes |
| `/guide` | Seven illustrated steps and FAQ |
| `/analyse` | Capture flow |
| `/report/[id]` | Report from this device (or cloud when signed in) |
| `/sample`, `/sample/[key]` | DEMO DATA reports for every outcome |
| `/sessions` | Shot library with search and filters |
| `/progress` | Trends per measure, baseline |
| `/profile` | Batting details, baseline, account, consent, data controls |
| `/coach` | Invite codes, review queue, notes |
| `/science` | Thresholds, ranges, index weights, versions |
| `/privacy` | What is stored, where, for how long |
| `/design-system` | Tokens and components |
| `/signin`, `/auth/callback` | Magic-link sign-in |

## Capture flow (one screen to add, then automatic)

**Add** — upload a video (any length) or 1–12 photos, or record. On-device processing consent is a checkbox on the same screen; filming tips are collapsed below it.

**Automatic run**, shown as a live list of named stages, each with what was decided:

| Stage | What Align decides | Correction |
|---|---|---|
| Reading the video | size, real frame rate, codec | — |
| Finding the shot | best verified shot window; camera cuts, replays and close-ups skipped | "Change" → shot picker |
| Finding the batter | the person batting: both hands together on a handle, not crouched, bat seen at the hands, in view through the shot | "Change" → tap the batter (only when several people) |
| Camera position | side-on / bowler's end / behind, from 3D pose | "Change" → camera picker |
| Checking the recording | quality gate; if a shot fails, the next-best shot is tried automatically (up to 3) | only on failure: concrete fixes, nothing processed |
| Tracking the body | crop follows the batter frame by frame (pans, zooms); lost → re-anchored on the scan or the person detector; GPU → CPU fallback | — |
| Building your report | engine, keyframes, local save | — |

Photos: Reading the photos → Finding the batter → Camera position → Building your report.

**Optional, from the report**: when the ball or bat wasn't seen, "Add ball and bat" opens marking (stumps, bounce, contact, ball after, bat) on the same clip while it is still open in this session, then updates the same report.

## Report reading order

Verdict and whether a score is allowed → evidence viewer → strength and priority → delivery context → six domains → measures → drill plan → limits → versions.
