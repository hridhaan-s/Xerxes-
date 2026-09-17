/**
 * Bridge between the Xerxes dashboard page and the service worker.
 *
 * This script is injected only on the dashboard origin (see manifest
 * `matches`). It is deliberately dumb: validate, forward, nothing else.
 * Anything that looks like a decision belongs in background.js.
 */

const PROTOCOL_VERSION = 2;
const ALLOWED_TYPES = new Set([
  "SESSION_START", "SESSION_END", "STATE", "ALERT"
]);

/* page -> extension */
window.addEventListener("message", (event) => {
  // Only trust messages this window posted to itself.
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const data = event.data;
  if (!data || data.source !== "xerxes" || data.v !== PROTOCOL_VERSION) return;

  // The page asks whether the bridge exists; it may load after we do.
  if (data.type === "BRIDGE_PING") return announce();
  if (!ALLOWED_TYPES.has(data.type)) return;

  try {
    chrome.runtime.sendMessage({
      source: "xerxes",
      v: PROTOCOL_VERSION,
      channel: "page",
      type: data.type,
      payload: sanitise(data.payload)
    });
  } catch (err) {
    // Fires when the extension is reloaded mid-session. The page keeps
    // running standalone; it just loses cross-tab notifications.
    console.debug("[xerxes] bridge unavailable", err);
  }
}, false);

/* extension -> page (popup commands: snooze, end session) */
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.source !== "xerxes" || msg.channel !== "command") return;
  window.postMessage(
    { source: "xerxes-ext", v: PROTOCOL_VERSION, type: "COMMAND", command: msg.command },
    window.location.origin
  );
});

/**
 * Whitelist the payload shape. The page is same-origin and trusted, but a
 * bridge that forwards arbitrary structures is how an XSS on the dashboard
 * turns into an extension problem.
 */
function sanitise(payload) {
  if (!payload || typeof payload !== "object") return {};
  const out = {};
  if (typeof payload.state === "string") out.state = payload.state.slice(0, 24);
  if (typeof payload.kind === "string") out.kind = payload.kind.slice(0, 24);
  if (typeof payload.title === "string") out.title = payload.title.slice(0, 80);
  if (typeof payload.body === "string") out.body = payload.body.slice(0, 220);
  if (typeof payload.summary === "string") out.summary = payload.summary.slice(0, 220);
  if (Number.isFinite(payload.score)) out.score = Math.round(payload.score);
  if (Number.isFinite(payload.seconds)) out.seconds = Math.round(payload.seconds);
  return out;
}

/* Let the page know the bridge is live so it can show connection state. */
function announce() {
  window.postMessage(
    { source: "xerxes-ext", v: PROTOCOL_VERSION, type: "BRIDGE_READY" },
    window.location.origin
  );
}

announce();
document.addEventListener("DOMContentLoaded", announce, { once: true });
