---
name: ui-snapshots
description: Visually check a UI by rendering it (real Chromium, iOS Simulator, Android) and reviewing screenshots; includes baseline/compare visual regression.
---
# UI snapshots and visual review

1. **Start the app** if it is not running: `bash` in the background (e.g. `npm run dev > /tmp/dev.log 2>&1 &`), then wait and confirm the port answers with `http_request`.
2. **Capture** with the `screenshot` tool. Always look at more than one size: `web` with `device` desktop, tablet, iphone; add `full_page: true` for long pages. For real mobile engines use `target: ios` (iOS Simulator, WebKit/Safari) and `target: android` (emulator; localhost is rewritten to 10.0.2.2).
3. **Review what you see**: layout and overflow, clipped or overlapping text, spacing, alignment, contrast, tap-target size, empty/error/loading states, dark mode if supported. Be specific about where (element, region) and what is wrong.
4. **Fix**, then recapture the same views and confirm the problem is gone. Do not claim it looks right without looking at the new screenshot.
5. **Regression guard**: capture with `baseline: "<name>"` and `mode: "save_baseline"` once the UI is good. Later use `mode: "compare"` with the same name: the result reports the percent of pixels changed and shows a diff image (red = changed). Investigate any unexpected change.
6. For native apps, `target: ios` with `bundle_id`, or `target: android` with `package`, launches the app first.

Report: which views you checked, what was wrong, what you changed, and the before/after result.
