const toggleTooltips = document.getElementById('toggleTooltips');
const toggleAutocomplete = document.getElementById('toggleAutocomplete');
const openPanelBtn = document.getElementById('openPanel');

// Load saved states
chrome.storage.local.get(['tooltipEnabled', 'autocompleteEnabled'], (result) => {
  toggleTooltips.checked = result.tooltipEnabled !== false;
  toggleAutocomplete.checked = result.autocompleteEnabled !== false;
});

// Save toggle states
toggleTooltips.addEventListener('change', (e) => {
  chrome.storage.local.set({ tooltipEnabled: e.target.checked });
});

toggleAutocomplete.addEventListener('change', (e) => {
  chrome.storage.local.set({ autocompleteEnabled: e.target.checked });
});

// Open side panel
openPanelBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
  window.close();
});
