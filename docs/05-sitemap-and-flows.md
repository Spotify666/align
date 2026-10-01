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

## Capture flow (9 steps for video, 6 for photos, shown in a labelled stepper)

1. **Shot**: front-foot defence (other shots shown as coming after validation).
2. **Method**: Quick Check (one phone) or 3D Session (preview).
3. **Setup**: camera placement diagram; consent to on-device processing.
4. **Clip**: video of any length, or 1–12 photos; drag-and-drop on desktop.
5. **Moment**:
   - scan; pick the shot when there are several;
   - tap the batter when others are in view;
   - confirm the camera position (suggested).
   - Photos instead get a review screen: tag stance / stride / contact / finish, or remove a photo.
6. **Check**: quality gate on the chosen shot. Fail → concrete fixes, nothing processed; try another shot.
7. **Track**: body tracked on the device, on a crop around the batter.
8. **Mark**: stumps, bounce, contact, ball after, bat on 4 frames (each skippable).
9. **Report**: verdict first, then evidence, domains, measures, plan, limits, PDF.

## Report reading order

Verdict and whether a score is allowed → evidence viewer → strength and priority → delivery context → six domains → measures → drill plan → limits → versions.
