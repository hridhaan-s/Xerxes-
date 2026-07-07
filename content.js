const hudWarn = document.createElement('div');
hudWarn.id = 'xerxes-hud-warn';
hudWarn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
        <rect x="1" y="1" width="14" height="14" stroke="#FF3333" stroke-width="1.5" style="background:transparent;"/>
        <path d="M8 4V9" stroke="#FF3333" stroke-width="1.5" stroke-linecap="square" style="background:transparent;"/>
        <rect x="7.25" y="11" width="1.5" height="1.5" fill="#FF3333" style="background:transparent;"/>
    </svg>
    <div class="xerxes-hud-text">
        <p class="xerxes-hud-title">SPINE DEVIATION</p>
        <p class="xerxes-hud-desc" id="xerxes-hud-desc-msg">Slouch vector detected.</p>
    </div>
`;

const interceptZone = document.createElement('div');
interceptZone.id = 'xerxes-intercept';
interceptZone.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">
        <circle cx="16" cy="16" r="14" stroke="#ffffff" stroke-width="1" stroke-dasharray="4 4" style="background:transparent;"/>
        <circle cx="16" cy="16" r="6" stroke="#ffffff" stroke-width="1.5" style="background:transparent;"/>
        <path d="M16 0V6M16 26V32M0 16H6M26 16H32" stroke="#ffffff" stroke-width="1.5" style="background:transparent;"/>
    </svg>
    <div class="xerxes-intercept-box">
        <h2>CRITICAL SPINE DEVIATION</h2>
    </div>
`;

if (!window.location.protocol.startsWith('chrome')) {
    document.body.appendChild(hudWarn);
    document.body.appendChild(interceptZone);
}

// 1. Catches messages from the local dashboard loop running on the same tab
window.addEventListener("message", (event) => {
    if (event.source === window && event.data && event.data.type === "XERXES_SIGNAL") {
        chrome.runtime.sendMessage(event.data).catch(() => {});
    }
});

// 2. Catches background script broadcasts on standard browsing tabs
chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "XERXES_SIGNAL") {
        const state = message.state;
        if (state === "OPTIMAL") {
            hudWarn.classList.remove('visible');
            interceptZone.classList.remove('visible');
        } else if (state === "WARNING") {
            const descElement = document.getElementById('xerxes-hud-desc-msg');
            if (descElement) descElement.innerText = message.msg;
            hudWarn.classList.add('visible');
            interceptZone.classList.remove('visible');
        } else if (state === "CRITICAL") {
            hudWarn.classList.remove('visible');
            interceptZone.classList.add('visible');
        }
    }
});