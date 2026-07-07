chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "XERXES_SIGNAL") {
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                // Relays metrics out to all tabs except the core tracking dashboard instance
                if (tab.id && (!sender.tab || tab.id !== sender.tab.id)) {
                    chrome.tabs.sendMessage(tab.id, message).catch(() => {
                        // Suppresses errors safely on secure browser pages
                    });
                }
            });
        });
    }
});