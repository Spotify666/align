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

## Capture flow (8 steps, shown in a labelled stepper)

1. **Shot** — front-foot defence (others shown as coming after validation).
2. **Tier** — Quick Check (one phone) or 3D Session (preview).
3. **Setup** — camera placement diagram; consent to on-device processing.
4. **Video** — pick or record; frame rate read from the file.
5. **Check** — quality gate. Fail → concrete fixes, nothing processed.
6. **Track** — choose a ≤ 2.5 s window; body tracked on the device.
7. **Mark** — bowler side, stumps, bounce, contact, ball after, bat on 4 frames (each skippable).
8. **Report** — verdict first, then evidence, domains, measures, plan, limits, PDF.

## Report reading order

Verdict and whether a score is allowed → evidence viewer → strength and priority → delivery context → six domains → measures → drill plan → limits → versions.
