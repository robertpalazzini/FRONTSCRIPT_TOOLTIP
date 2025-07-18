(async function () {
  const tooltipEnabled = await new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "GET_TOOLTIP_ENABLED" }, (response) => {
        resolve(response?.tooltipEnabled !== false);
      });
    } catch (e) {
      resolve(true);
    }
  });

  if (!tooltipEnabled) return;
  const tooltipData = await fetch(chrome.runtime.getURL('frontscript-tooltips.json')).then(r => r.json());

  const tooltip = document.createElement('div');
  tooltip.className = "frontscript-tooltip";
  document.body.appendChild(tooltip);

  document.addEventListener('mouseover', event => {
    const text = event.target.textContent;
    if (!text) {
      tooltip.style.display = 'none';
      return;
    }

    const words = text.trim().split(/[^\w_\.]+/);
    const hoveredWord = words.find(w => tooltipData[w.toUpperCase()]);
    if (!hoveredWord) {
      tooltip.style.display = 'none';
      return;
    }

    const { description, example } = tooltipData[hoveredWord.toUpperCase()];
    tooltip.innerText = `${hoveredWord.toUpperCase()}

${description}

Example:
${example}`;
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY + 10}px`;
    tooltip.style.display = 'block';
  });

  document.addEventListener('mouseout', () => {
    tooltip.style.display = 'none';
  });
})();