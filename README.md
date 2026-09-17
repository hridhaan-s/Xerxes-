# Xerxes — posture monitor (Chrome extension)

The alerting half of [Xerxes](https://xerxes.bitbuzz.app/). The dashboard watches
your posture through the webcam; this extension is what makes an alert reach you
when you have already tabbed away to something else.

Nothing is measured here. No camera access, no page content, no network calls.
This extension receives a state signal from the dashboard tab and decides whether
that state is worth interrupting a human being over.

---

## Install for development

1. Open `chrome://extensions/`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this folder (the one holding `manifest.json`)
4. Open the dashboard and run a calibration. The extension badge turns on.

Requires Chrome 116+ (`chrome.storage.session` and MV3 service-worker behaviour).

---

## What it does

| Behaviour | Why it exists |
|---|---|
| Desktop notification when posture stays out of range | The dashboard tab is hidden; an on-page banner would be invisible |
| Minimum gap between alerts, default 2 minutes | An alert per frame is an alarm. Alarms get uninstalled |
| Snooze | A meeting is not a posture failure |
| Watchdog | If the dashboard goes silent for 90s mid-session, you are told tracking **stopped** rather than left believing it is running |
| Toolbar badge | Current state at a glance without switching tabs |
| Optional break card | Draws a break prompt over the page you are actually looking at |

### Alert policy lives here, not in the page

All timing state — last alert, cooldown, snooze window — is held by the service
worker and mirrored to `chrome.storage.session`. The dashboard tab can be
throttled, reloaded or discarded without the alert logic losing its memory or
firing a burst of catch-up notifications.

---

## Permissions, and why each one is present

| Permission | Used for |
|---|---|
| `notifications` | The entire point of the extension |
| `storage` | Settings (sync) and live session state (session) |
| `alarms` | The 60s watchdog that detects stalled tracking |
| `scripting` | Injecting the optional break card |
| `<all_urls>` — **optional** | Break card only. Requested when you enable it, revoked when you disable it |

There is no `tabs` permission. `chrome.tabs.create()` and `chrome.tabs.query()`
with a `url` filter work without it, and asking for it would put "read your
browsing history" on the install prompt for no benefit.

The content script is scoped to the dashboard origin only. It is not injected
into your bank, your email, or anything else.

---

## Message protocol (v2)

Page → content script → service worker. The content script validates
`event.source === window`, the origin, the protocol version, the message type,
and then copies a whitelist of fields. It forwards nothing it does not recognise.

```js
// dashboard → extension
window.postMessage({
  source: "xerxes",
  v: 2,
  type: "STATE",              // SESSION_START | STATE | ALERT | SESSION_END
  payload: { state: "DRIFT", score: 82 }
}, window.location.origin);

// extension → dashboard (popup commands)
{ source: "xerxes-ext", v: 2, type: "COMMAND", command: "snooze" }
```

States: `NOMINAL`, `DRIFT`, `ALERT`, `LOW_CONFIDENCE`, `IDLE`.
`LOW_CONFIDENCE` means your shoulders left the frame — the dashboard reports it
instead of scoring guesswork, and the extension stays quiet.

---

## Files

```
manifest.json    MV3 config
background.js    Service worker — alert policy, badge, watchdog, overlay injection
content.js       Validating bridge, dashboard origin only
popup.html/css/js  Status readout and settings
icons/           16, 32, 48, 128
```

---

## Before submitting to the Chrome Web Store

- [ ] Set your real dashboard origin in `manifest.json` (`matches`) and
      `background.js` (`DASHBOARD_URL`). They must agree.
- [ ] Remove the `localhost` entries from `matches`.
- [ ] Bump `version`.
- [ ] Host `PRIVACY.md` at a public URL and paste that URL in the listing.
- [ ] In the listing's permission justification box, state plainly: notifications
      for alerts, scripting for the optional break card, optional `<all_urls>`
      requested at runtime only. Reviewers reject vague justifications.
- [ ] Screenshots at 1280×800.
- [ ] `zip -r xerxes-extension.zip . -x '*.git*' '*.DS_Store'` and upload.

## Known limits

Chrome throttles background tabs. The dashboard samples at a reduced rate when
hidden, and the watchdog exists because Chrome can discard the tab entirely under
memory pressure. If that happens you get a "tracking stopped" notification rather
than silence.

MIT licensed. Built by Hridhaan.
