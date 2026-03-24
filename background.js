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
    chrome.sidePanel.open({ tabId: sender.tab?.id || message.tabId });
    return;
  }

  if (message.type === "INSERT_SNIPPET") {
    // Forward snippet insertion to the active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "DO_INSERT_SNIPPET",
          code: message.code
        });
      }
    });
    return;
  }

  if (message.type === "SEARCH_KEYWORD") {
    // Forward search request to side panel
    chrome.runtime.sendMessage({
      type: "HIGHLIGHT_IN_PANEL",
      keyword: message.keyword
    });
    return;
  }
});

// Set side panel behavior - open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
  .catch(() => {});
