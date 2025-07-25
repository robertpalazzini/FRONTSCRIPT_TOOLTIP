
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
    if (!range || !range.startContainer) return { word: '', prevChar: '' };
    const node = range.startContainer;
    const text = node.textContent || '';

    let start = range.startOffset;
    while (start > 0 && /[\w%]/.test(text[start - 1])) start--;
    let end = range.startOffset;
    while (end < text.length && /[\w%]/.test(text[end])) end++;

    let word = text.slice(start, end);
    let prevChar = '';

    if (start === 0) {
      let prev = node.previousSibling;
      while (prev && prev.textContent && /[\w%]$/.test(prev.textContent)) {
        const prevText = prev.textContent;
        let i = prevText.length;
        let segment = '';
        while (i > 0 && /[\w%]/.test(prevText[i - 1])) {
          segment = prevText[i - 1] + segment;
          i--;
        }
        word = segment + word;
        if (i > 0) {
          prevChar = prevText[i - 1] || '';
          break;
        }
        prev = prev.previousSibling;
      }
      if (!prevChar) {
        while (prev && (!prev.textContent || prev.textContent.length === 0)) {
          prev = prev.previousSibling;
        }
        if (prev && prev.textContent) {
          prevChar = prev.textContent.slice(-1);
        }
      }
    } else {
      prevChar = text[start - 1];
    }

    if (end === text.length && /[\w%]$/.test(word)) {
      let next = node.nextSibling;
      while (next && next.textContent && /^[\w%]/.test(next.textContent)) {
        const nextText = next.textContent;
        let i = 0;
        let segment = '';
        while (i < nextText.length && /[\w%]/.test(nextText[i])) {
          segment += nextText[i];
          i++;
        }
        word += segment;
        if (i < nextText.length) break;
        next = next.nextSibling;
      }
    }

    return { word, prevChar };
  }

  document.addEventListener('mousemove', event => {
    if (!event.target.closest('.CodeMirror')) {
      tooltip.style.display = 'none';
      return;
    }

    const { word, prevChar } = getWordFromPoint(event.clientX, event.clientY);
    let key = word.toUpperCase();
    if (prevChar === '%' && tooltipData['%' + key]) {
      key = '%' + key;
    }
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
