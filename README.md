# XERXES // CORE COGNITIVE SHIELD (CHROME EXTENSION)

The background communication layer for the XERXES workspace engine. This extension captures messaging signals from your hosted tracking dashboard tab and creates native browser warnings and alerts when you work on other tabs.

**Engine Architect:** HRIDHAAN  
**Target Routing Link:** [bitbuzz.app/Xerxes](https://bitbuzz.app/Xerxes)

---

## 🛠️ How to Setup and Test Locally

Before submitting to the Chrome Web Store, you can run and test the extension directly on your computer:

1. Open Google Chrome and type `chrome://extensions/` in your address bar.
2. Turn on the **Developer mode** toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select your `xerxes-extension` folder (the folder containing `manifest.json`).
5. The extension is now active! If you update any files later, just click the **Rotate/Reload** icon on the extension card.

---

## 📦 How to Deploy to the Chrome Web Store

When you are ready to make the extension public so anyone can install it with one click:

### Step 1: Prepare the Package
1. Open `content.js` or `background.js` and make sure your notification click handler is pointing to your final live dashboard URL:
   ```javascript
   chrome.notifications.onClicked.addListener(() => {
       chrome.tabs.create({ url: "[https://bitbuzz.app/Xerxes](https://bitbuzz.app/Xerxes)" });
   });
