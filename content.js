
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

  const rawData = await fetch(chrome.runtime.getURL('frontscript-tooltips.json')).then(r => r.json());
  const tooltipData = {};

  for (const category in rawData) {
    rawData[category].forEach(entry => {
      tooltipData[entry.name.toUpperCase()] = {
        description: entry.description,
        example: entry.example
      };
    });
  }

  const tooltip = document.createElement('div');
  tooltip.className = "frontscript-tooltip";
  document.body.appendChild(tooltip);

  function getWordFromPoint(x, y) {
    const range = document.caretRangeFromPoint ?
      document.caretRangeFromPoint(x, y) :
      (function() {
        const pos = document.caretPositionFromPoint && document.caretPositionFromPoint(x, y);
        if (!pos) return null;
        const r = document.createRange();
        r.setStart(pos.offsetNode, pos.offset);
        r.setEnd(pos.offsetNode, pos.offset);
        return r;
      })();
    if (!range || !range.startContainer) return '';
    const node = range.startContainer;
    const text = node.textContent || '';

    let start = range.startOffset;
    while (start > 0 && /[\w%]/.test(text[start - 1])) start--;
    let end = range.startOffset;
    while (end < text.length && /[\w%]/.test(text[end])) end++;

    let word = text.slice(start, end);

    if (start === 0 && node.previousSibling && node.previousSibling.nodeType === Node.TEXT_NODE) {
      const prevText = node.previousSibling.textContent;
      if (prevText && prevText.endsWith('%')) {
        word = '%' + word;
      }
    }

    if (word === '%' && node.nextSibling && node.nextSibling.nodeType === Node.TEXT_NODE) {
      const match = /^([\w]+)/.exec(node.nextSibling.textContent || '');
      if (match) {
        word += match[1];
      }
    }

    return word;
  }

  document.addEventListener('mousemove', event => {
    if (!event.target.closest('.CodeMirror')) {
      tooltip.style.display = 'none';
      return;
    }

    const word = getWordFromPoint(event.clientX, event.clientY);
    const key = word.toUpperCase();
    if (!key || !tooltipData[key]) {
      tooltip.style.display = 'none';
      return;
    }

    const { description, example } = tooltipData[key];
    tooltip.innerText = `${key}

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
