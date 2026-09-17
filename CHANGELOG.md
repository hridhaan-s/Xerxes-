# Changelog

## 2.0.0 — 17 Sep 2026

Rewrite. Breaking: requires dashboard v2 (protocol v2).

### Fixed
- `chrome.notifications` was called without the `notifications` permission, so
  the API was undefined and every alert threw. Permission added.
- Removed the `tabs` permission. It was never needed — `chrome.tabs.create()`
  works without it — and it widened the install prompt for nothing.
- Content script no longer matches `<all_urls>`. It is scoped to the dashboard
  origin. The broad permission is now optional and requested at runtime.

### Added
- Cooldown, snooze and escalation policy owned by the service worker, so it
  survives tab throttling and worker teardown.
- Watchdog alarm: silence from the dashboard is reported as "tracking stopped"
  instead of being mistaken for good posture.
- Toolbar badge reflecting live state.
- Popup with status, snooze and settings.
- Optional break card injected into the active tab.
- Message schema validation on the bridge.
- Icons at all four required sizes.

### Removed
- `overlay.css` — the in-page overlay is now a self-contained shadow-DOM
  injection, so there is no stylesheet to leak into other people's pages.
