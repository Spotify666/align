# 07 · Design system

Live reference: `/design-system`. Source: `src/app/globals.css`.

## Themes

Light is the default. Dark follows the OS, or the user's choice (stored in `localStorage["align.theme"]`, applied before paint). The media **stage** (video, overlays, 3D) is always dark so tracked colours read the same in both themes.

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | #f7f7f5 | #0b0d0f | page |
| `surface` | #ffffff | #121518 | cards |
| `sunken` | #efeeea | #0e1113 | tracks, segmented controls |
| `line` / `line-strong` | #e4e2dc / #cfccc4 | #23282d / #353c43 | borders |
| `fg` / `fg-muted` / `fg-subtle` | #121417 / #4a5058 / #676d75 | #f2f2ef / #b4bac1 / #8d949c | text |
| `brand` | #0f6e4f | #3dbd8a | primary action, contact |
| `ok` / `bad` / `warn` / `neutral` | #11795a / #c1342a / #9a5b00 / #5b6470 | #47c38f / #f2675c / #f0b54a / #9ba5b0 | status only |
| `data` | #2563eb | #74aaff | measurements, baseline |

All text tokens meet WCAG AA (≥ 4.5:1) on `bg` and `surface` in both themes. Status colours always come with an icon and a word.

## Type

Geist for text and display (tabular numerals for values); Geist Mono for hashes only. Display headings use −0.035em tracking.

## Components

`.card`, `.btn` (`-primary`, `-ghost`, `-quiet`), `.chip`, `.field`, `.eyebrow`, `.demo-badge`, `.stage`, `.band`. Touch targets ≥ 36 px (44 px for primary actions).

## Motion

`motion/react` with `MotionConfig reducedMotion="user"`. Page fade, reveal on scroll, shared-layout nav pill and tab dot, step transitions in capture. Durations 150–300 ms, ease `[0.2, 0.8, 0.2, 1]`.

## Layout

Safe-area insets on all edges, bottom tab bar on phones, no horizontal scroll at 320 px. `scripts/qa-screens.mjs` checks overlap and overflow on phone, landscape, tablet and desktop in both themes.
