// Background service worker for FrontScript Tooltip Helper v2.0

// Open side panel when extension icon is clicked (with Alt/Option key)
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TOOLTIP_ENABLED") {
    chrome.storage.local.get("tooltipEnabled", ({ tooltipEnabled }) => {
      sendResponse({ tooltipEnabled: tooltipEnabled !== false });
    });
    return true;
  }

  if (message.type === "OPEN_SIDE_PANEL") {
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.sidePanel.open({ tabId: tabs[0].id });
        }
      });
    }
    return;
  }

  if (message.type === "INSERT_SNIPPET") {
    // Forward snippet insertion to the active tab's content script.
    // Use lastFocusedWindow (not currentWindow) so the query finds the browser
    // tab even when the side panel has focus — critical on Windows/Edge where
    // the side panel runs in its own window context.
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "DO_INSERT_SNIPPET",
          code: message.code
        }, () => { void chrome.runtime.lastError; });
      }
    });
    return;
  }

  if (message.type === "SEARCH_KEYWORD") {
    // Forward search request to side panel (panel may not be open — ignore errors)
    chrome.runtime.sendMessage({
      type: "HIGHLIGHT_IN_PANEL",
      keyword: message.keyword
    }).catch(() => {});
    return;
  }
});

// Set side panel behavior - open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
  .catch(() => {});
