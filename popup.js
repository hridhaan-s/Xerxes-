const $ = (id) => document.getElementById(id);

const COPY = {
  IDLE:           ["Not tracking", "Open the dashboard and calibrate to start a session."],
  NOMINAL:        ["Tracking", "You are holding your calibrated baseline."],
  DRIFT:          ["Drifting", "Posture is sliding. One more step and you get a nudge."],
  ALERT:          ["Out of range", "Reset your shoulders and head against the baseline."],
  LOW_CONFIDENCE: ["Can't see you clearly", "Your shoulders need to be in frame for scoring to run."]
};

let snoozeUntil = 0;

init();

async function init() {
  wireSettings();
  await refresh();
  setInterval(refresh, 1000);

  $("open").addEventListener("click", () => {
    send("OPEN_DASHBOARD");
    window.close();
  });

  $("snooze").addEventListener("click", async () => {
    if (Date.now() < snoozeUntil) {
      await send("CLEAR_SNOOZE");
    } else {
      await send("SNOOZE", { minutes: 20 });
    }
    refresh();
  });
}

async function refresh() {
  const res = await send("GET_STATUS");
  if (!res || !res.ok) return;

  const { live, settings } = res;
  snoozeUntil = live.snoozeUntil || 0;

  const state = live.sessionActive ? live.state : "IDLE";
  const [title, detail] = COPY[state] || COPY.IDLE;

  $("dot").dataset.state = live.sessionActive ? state : "IDLE";
  $("state").textContent = title;

  if (Date.now() < snoozeUntil) {
    const mins = Math.ceil((snoozeUntil - Date.now()) / 60000);
    $("detail").textContent = `Alerts paused for ${mins} more minute${mins === 1 ? "" : "s"}.`;
    $("snooze").textContent = "Resume alerts";
    $("snooze").dataset.active = "true";
  } else {
    $("detail").textContent = detail;
    $("snooze").textContent = "Snooze 20 min";
    $("snooze").dataset.active = "false";
  }

  const hasScore = live.sessionActive && Number.isFinite(live.score);
  $("score-row").hidden = !hasScore;
  if (hasScore) $("score").textContent = `${live.score}`;

  $("notificationsEnabled").checked = settings.notificationsEnabled;
  $("breakOverlayEnabled").checked = settings.breakOverlayEnabled;
  $("alertCooldownSec").value = settings.alertCooldownSec;
  $("cooldown-value").textContent = formatGap(settings.alertCooldownSec);
}

function wireSettings() {
  $("notificationsEnabled").addEventListener("change", (e) => {
    chrome.storage.sync.set({ notificationsEnabled: e.target.checked });
  });

  $("alertCooldownSec").addEventListener("input", (e) => {
    const value = Number(e.target.value);
    $("cooldown-value").textContent = formatGap(value);
    chrome.storage.sync.set({ alertCooldownSec: value });
  });

  // The broad host permission is requested only when the user turns the
  // feature on, and handed straight back when they turn it off.
  $("breakOverlayEnabled").addEventListener("change", async (e) => {
    const wanted = e.target.checked;
    if (wanted) {
      const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
      if (!granted) {
        e.target.checked = false;
        $("perm-note").hidden = false;
        return;
      }
      $("perm-note").hidden = true;
    } else {
      await chrome.permissions.remove({ origins: ["<all_urls>"] });
    }
    chrome.storage.sync.set({ breakOverlayEnabled: wanted });
  });
}

function formatGap(seconds) {
  return seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
}

function send(type, payload) {
  return chrome.runtime.sendMessage({ source: "xerxes", v: 2, type, payload }).catch(() => null);
}
