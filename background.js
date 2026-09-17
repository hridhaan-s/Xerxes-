/**
 * Xerxes service worker.
 *
 * Owns every decision about *when the user is interrupted*. The dashboard
 * reports what the body is doing; this file decides whether that is worth a
 * notification. Keeping the policy here means the tab can be throttled,
 * reloaded or closed without the alert logic losing its memory.
 *
 * MV3 note: every listener is registered at top level. A listener registered
 * inside a callback is lost the moment the worker is torn down (~30s idle).
 */

const DASHBOARD_URL = "https://xerxes.bitbuzz.app/";

const DEFAULTS = {
  notificationsEnabled: true,
  alertCooldownSec: 120,   // minimum gap between posture notifications
  stallGraceSec: 90,       // silence from the dashboard before we call it stalled
  breakOverlayEnabled: false
};

// Volatile, rebuilt from chrome.storage.session after a worker restart.
let live = {
  sessionActive: false,
  state: "IDLE",           // IDLE | NOMINAL | DRIFT | ALERT | LOW_CONFIDENCE
  score: null,
  lastSignalAt: 0,
  lastNotifyAt: 0,
  snoozeUntil: 0,
  tabId: null
};

const ALARM_WATCHDOG = "xerxes-watchdog";

/* ------------------------------------------------------------------ setup */

chrome.runtime.onInstalled.addListener(async (details) => {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set({ ...DEFAULTS, ...stored });
  chrome.alarms.create(ALARM_WATCHDOG, { periodInMinutes: 1 });
  if (details.reason === "install") {
    chrome.tabs.create({ url: DASHBOARD_URL });
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_WATCHDOG, { periodInMinutes: 1 });
});

/* --------------------------------------------------------------- messaging */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.source !== "xerxes" || msg.v !== 2) return;

  // Content-script traffic must come from a real tab, never another extension.
  if (msg.channel === "page" && !sender.tab) return;

  handleMessage(msg, sender).then(sendResponse).catch((err) => {
    console.error("[xerxes] message failed", err);
    sendResponse({ ok: false });
  });
  return true; // async response
});

async function handleMessage(msg, sender) {
  await restore();

  switch (msg.type) {
    case "SESSION_START":
      live.sessionActive = true;
      live.tabId = sender.tab ? sender.tab.id : live.tabId;
      live.lastSignalAt = Date.now();
      live.state = "NOMINAL";
      live.score = null;
      await persist();
      await paintBadge();
      return { ok: true };

    case "SESSION_END":
      live.sessionActive = false;
      live.state = "IDLE";
      live.score = typeof msg.payload?.score === "number" ? msg.payload.score : live.score;
      await persist();
      await paintBadge();
      if (msg.payload?.summary) {
        await notify("session-summary", "Session ended", msg.payload.summary, false);
      }
      return { ok: true };

    case "STATE":
      live.lastSignalAt = Date.now();
      live.tabId = sender.tab ? sender.tab.id : live.tabId;
      live.state = String(msg.payload?.state || "NOMINAL");
      live.score = Number.isFinite(msg.payload?.score) ? msg.payload.score : live.score;
      live.sessionActive = true;
      await persist();
      await paintBadge();
      return { ok: true };

    case "ALERT":
      live.lastSignalAt = Date.now();
      return await raiseAlert(msg.payload || {});

    case "GET_STATUS":
      return { ok: true, live, settings: await chrome.storage.sync.get(DEFAULTS) };

    case "SNOOZE": {
      const minutes = Math.max(1, Math.min(120, Number(msg.payload?.minutes) || 20));
      live.snoozeUntil = Date.now() + minutes * 60_000;
      await persist();
      await paintBadge();
      return { ok: true, until: live.snoozeUntil };
    }

    case "CLEAR_SNOOZE":
      live.snoozeUntil = 0;
      await persist();
      await paintBadge();
      return { ok: true };

    case "OPEN_DASHBOARD":
      await focusDashboard();
      return { ok: true };

    default:
      return { ok: false, reason: "unknown-type" };
  }
}

/* ------------------------------------------------------------------ alerts */

async function raiseAlert(payload) {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  const now = Date.now();

  if (!settings.notificationsEnabled) return { ok: false, reason: "muted" };
  if (now < live.snoozeUntil) return { ok: false, reason: "snoozed" };

  const cooldown = (payload.kind === "break" ? 0 : settings.alertCooldownSec) * 1000;
  if (now - live.lastNotifyAt < cooldown) return { ok: false, reason: "cooldown" };

  const title = payload.title || "Posture drifted";
  const body = payload.body || "Reset against your calibrated baseline.";
  await notify(`alert-${now}`, title, body, true);

  live.lastNotifyAt = now;
  await persist();

  if (payload.kind === "break" && settings.breakOverlayEnabled) {
    await showBreakOverlay(payload.seconds || 40);
  }
  return { ok: true };
}

async function notify(id, title, message, requireInteraction) {
  try {
    await chrome.notifications.create(id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title,
      message,
      priority: requireInteraction ? 2 : 0,
      requireInteraction: Boolean(requireInteraction),
      silent: false
    });
  } catch (err) {
    // Chrome throws here if the OS focus-assist setting blocks notifications.
    console.warn("[xerxes] notification suppressed by the OS", err);
  }
}

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  await focusDashboard();
});

/* ----------------------------------------------------------- break overlay */

/**
 * Optional: paints a break card over whatever page the user is actually
 * looking at. Requires <all_urls>, which is opt-in from the popup, so the
 * default install prompt stays clean.
 */
async function showBreakOverlay(seconds) {
  const granted = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  if (!granted) return;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: paintOverlay,
      args: [Math.max(10, Math.min(600, seconds))]
    });
  } catch (err) {
    console.warn("[xerxes] overlay injection refused", err);
  }
}

// Runs in the page. Self-contained: no imports, no CSS file, cleans up after itself.
function paintOverlay(seconds) {
  const ID = "xerxes-break-overlay";
  if (document.getElementById(ID)) return;

  const host = document.createElement("div");
  host.id = ID;
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:auto;";
  const root = host.attachShadow({ mode: "closed" });

  root.innerHTML = `
    <style>
      .scrim{position:fixed;inset:0;background:rgba(8,9,11,.82);backdrop-filter:blur(6px);
        display:grid;place-items:center;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}
      .card{width:min(420px,88vw);background:#0e1013;border:1px solid #23262b;border-radius:14px;
        padding:28px 30px;color:#e8e6e1;box-shadow:0 30px 80px rgba(0,0,0,.6)}
      h2{margin:0 0 6px;font-size:19px;font-weight:600;letter-spacing:-.01em}
      p{margin:0 0 20px;font-size:14px;line-height:1.55;color:#9aa0a8}
      .count{font-variant-numeric:tabular-nums;font-size:46px;font-weight:300;color:#e3b23c;
        font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-bottom:18px}
      button{all:unset;cursor:pointer;padding:9px 16px;border:1px solid #33373d;border-radius:8px;
        font-size:13px;color:#e8e6e1}
      button:hover{background:#1a1d21}
      button:focus-visible{outline:2px solid #e3b23c;outline-offset:2px}
    </style>
    <div class="scrim" role="dialog" aria-label="Break reminder">
      <div class="card">
        <h2>Look away from the screen</h2>
        <p>Eyes on something 6 metres out. Roll your shoulders back and drop them.</p>
        <div class="count" id="c">${seconds}</div>
        <button id="skip">Skip this break</button>
      </div>
    </div>`;

  document.documentElement.appendChild(host);
  const el = root.getElementById("c");
  let left = seconds;
  const tick = setInterval(() => {
    left -= 1;
    if (el) el.textContent = String(left);
    if (left <= 0) close();
  }, 1000);

  function close() {
    clearInterval(tick);
    host.remove();
    document.removeEventListener("keydown", onKey, true);
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  root.getElementById("skip").addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);
}

/* ---------------------------------------------------------------- watchdog */

/**
 * The failure this catches: the dashboard tab is discarded, crashed or the
 * camera was revoked, so tracking silently stopped while the user believes
 * they are being monitored. Silence is reported, never assumed to be good.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_WATCHDOG) return;
  await restore();
  if (!live.sessionActive) return;

  const settings = await chrome.storage.sync.get(DEFAULTS);
  const silentFor = (Date.now() - live.lastSignalAt) / 1000;

  if (silentFor > settings.stallGraceSec) {
    live.sessionActive = false;
    live.state = "IDLE";
    await persist();
    await paintBadge();
    await notify(
      "stalled",
      "Tracking stopped",
      "Xerxes lost the camera feed, so nothing is being measured. Open the dashboard to restart.",
      true
    );
  }
});

/* ------------------------------------------------------------------- badge */

const BADGE = {
  IDLE:            { text: "",    color: "#6b6f76" },
  NOMINAL:         { text: "OK",  color: "#3f7d62" },
  DRIFT:           { text: "··",  color: "#e3b23c" },
  ALERT:           { text: "!",   color: "#d9524a" },
  LOW_CONFIDENCE:  { text: "?",   color: "#6b6f76" }
};

async function paintBadge() {
  const snoozed = Date.now() < live.snoozeUntil;
  const b = snoozed ? { text: "z", color: "#6b6f76" } : (BADGE[live.state] || BADGE.IDLE);
  await chrome.action.setBadgeText({ text: live.sessionActive || snoozed ? b.text : "" });
  await chrome.action.setBadgeBackgroundColor({ color: b.color });
}

/* ------------------------------------------------------- state persistence */

async function persist() {
  await chrome.storage.session.set({ live });
}

async function restore() {
  const { live: saved } = await chrome.storage.session.get("live");
  if (saved) live = { ...live, ...saved };
}

async function focusDashboard() {
  const tabs = await chrome.tabs.query({ url: [`${DASHBOARD_URL}*`, "http://localhost/*"] });
  const existing = tabs.find((t) => t.id === live.tabId) || tabs[0];
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: DASHBOARD_URL });
  }
}
