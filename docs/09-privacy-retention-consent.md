# 09 · Privacy, retention and consent

## Default: nothing leaves the phone

Video is read, tracked and analysed in the browser. Reports, tracks and keyframes live in IndexedDB on the device. No account is needed.

## Optional cloud save (signed in)

| Data | Where | Retention |
|---|---|---|
| Analysis payload, metrics, report | Postgres (Mumbai), RLS | until deleted |
| Binary tracks (~20 KB) | private `tracks` bucket | until deleted |
| Evidence keyframes (WebP) | private `evidence` bucket | until deleted |
| Raw video (opt-in) | private `raw-video` bucket | 14 days by default (user-set), purged daily |

## Consent

Append-only `consents` table records:

- `video_processing` (on-device analysis)
- `cloud_storage`
- `coach_sharing`
- `model_training` (research use; off by default)
- `guardian` (parent or guardian confirmation)

Each consent carries a policy version (`privacy-2026-10`). Withdrawing coach sharing hides data from the coach immediately, because RLS checks current consent on every read.

## Under-18s

The age band is collected without a birth date. The schema holds a guardian email and a `guardian` consent; requiring it for under-16 coach sharing and research use is planned before public launch.

## User controls

- Export: PDF per report.
- Delete one analysis: removes it from the device and, if saved, its rows and storage objects from the account.
- Delete account: the `account-delete` edge function removes all rows, objects and the auth user.

## Security

- Private buckets with size and type limits.
- Payloads are immutable (trigger).
- Audit triggers on consent and coach-link changes.
- Registry rows are written by migrations only.
- The LLM route receives a compact payload: no video, no name.
