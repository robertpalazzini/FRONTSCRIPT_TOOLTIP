(async function () {
  "use strict";

  // ── Wait for eFront CodeMirror editor ─────────────────────────
  function waitForEfrontApp(timeout = 10000) {
    return new Promise((resolve) => {
      const check = () => {
        if (document.querySelector('.CodeMirror.cm-s-frontscript')) {
          resolve(true);
          return;
        }
        if ((timeout -= 100) <= 0) {
          resolve(false);
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  const found = await waitForEfrontApp();
  if (!found) return;

  // ── Tooltip enabled check ─────────────────────────────────────
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

  // ── Load tooltip definitions ──────────────────────────────────
  const rawData = await fetch(chrome.runtime.getURL('frontscript-tooltips.json')).then(r => r.json());
  const tooltipData = {};
  const allKeywords = []; // for autocomplete

  for (const category in rawData) {
    rawData[category].forEach(entry => {
      const key = entry.name.toUpperCase();
      tooltipData[key] = {
        description: entry.description,
        example: entry.example,
        category: category
      };
      allKeywords.push({
        name: entry.name,
        upperName: key,
        category: category,
        description: entry.description
      });
    });
  }

  // Sort for autocomplete display
  allKeywords.sort((a, b) => a.name.localeCompare(b.name));

  // ── Hover Tooltip ─────────────────────────────────────────────
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
    let node = range.startContainer;
    let offset = range.startOffset;
    if (node.nodeType !== Node.TEXT_NODE && node.childNodes[offset] && node.childNodes[offset].nodeType === Node.TEXT_NODE) {
      node = node.childNodes[offset];
      offset = 0;
    }
    const text = node.textContent || '';

    const charAtPoint = offset < text.length ? text[offset] : '';
    const charBefore = offset > 0 ? text[offset - 1] : '';
    if (!(/[\w%]/.test(charAtPoint))) {
      if (/[\w%]/.test(charBefore)) {
        offset--;
      } else {
        return { word: '', prevChar: '' };
      }
    }

    let start = offset;
    while (start > 0 && /[\w%]/.test(text[start - 1])) start--;
    let end = offset;
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
    tooltip.innerText = `${key}\n\n${description}\n\nExample:\n${example}`;
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY + 10}px`;
    tooltip.style.display = 'block';
  });

  document.addEventListener('mouseout', () => {
    tooltip.style.display = 'none';
  });

  // ── Autocomplete / IntelliSense ───────────────────────────────

  // Get the CodeMirror instance
  function getCodeMirrorInstance() {
    const cmEl = document.querySelector('.CodeMirror.cm-s-frontscript');
    return cmEl && cmEl.CodeMirror;
  }

  // Create autocomplete dropdown
  const acDropdown = document.createElement('div');
  acDropdown.className = 'fs-autocomplete';
  acDropdown.style.display = 'none';
  document.body.appendChild(acDropdown);

  let acItems = [];
  let acSelectedIndex = -1;
  let acVisible = false;
  let acPrefix = '';
  let acCursorToken = null;

  function showAutocomplete(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    const line = cm.getLine(cursor.line);

    // Get the current word being typed (from token start to cursor)
    let wordStart = token.start;
    let prefix = line.slice(wordStart, cursor.ch).toUpperCase();

    // Handle % prefix for macros
    if (wordStart > 0 && line[wordStart - 1] === '%') {
      wordStart--;
      prefix = '%' + prefix;
    }

    // Need at least 1 character to trigger
    if (prefix.length < 1 || prefix === '%') {
      hideAutocomplete();
      return;
    }

    acPrefix = prefix;
    acCursorToken = { line: cursor.line, start: wordStart, end: cursor.ch };

    // Filter matching keywords
    const matches = allKeywords.filter(kw => {
      const target = kw.upperName;
      return target.startsWith(acPrefix) && target !== acPrefix;
    });

    if (matches.length === 0) {
      hideAutocomplete();
      return;
    }

    acItems = matches.slice(0, 12); // limit to 12 items
    acSelectedIndex = 0;
    renderAutocomplete(cm);
  }

  function renderAutocomplete(cm) {
    const cursor = cm.getCursor();
    const coords = cm.cursorCoords(cursor, 'page');

    acDropdown.innerHTML = acItems.map((item, i) => {
      const catClass = item.category.toLowerCase();
      const sel = i === acSelectedIndex ? ' selected' : '';
      return `<div class="fs-ac-item${sel}" data-index="${i}">
        <span class="fs-ac-name">${escapeHtml(item.name)}</span>
        <span class="fs-ac-badge ${catClass}">${item.category}</span>
      </div>`;
    }).join('');

    acDropdown.style.left = coords.left + 'px';
    acDropdown.style.top = (coords.bottom + 2) + 'px';
    acDropdown.style.display = 'block';
    acVisible = true;
  }

  function hideAutocomplete() {
    acDropdown.style.display = 'none';
    acVisible = false;
    acItems = [];
    acSelectedIndex = -1;
  }

  function acceptAutocomplete(cm, index) {
    if (index < 0 || index >= acItems.length) return;
    const item = acItems[index];
    const tok = acCursorToken;
    if (!tok) return;

    // Replace the typed prefix with the full keyword
    cm.replaceRange(
      item.name,
      { line: tok.line, ch: tok.start },
      { line: tok.line, ch: tok.end }
    );

    hideAutocomplete();
  }

  // Attach autocomplete to CodeMirror
  function attachAutocomplete() {
    const cm = getCodeMirrorInstance();
    if (!cm) {
      // Retry after a short delay
      setTimeout(attachAutocomplete, 500);
      return;
    }

    // On text input changes
    cm.on('inputRead', (instance, changeObj) => {
      if (changeObj.origin === '+input' || changeObj.origin === '+completion') {
        showAutocomplete(instance);
      }
    });

    // On cursor activity (e.g., delete/backspace)
    cm.on('cursorActivity', (instance) => {
      if (acVisible) {
        // Re-evaluate autocomplete
        const cursor = instance.getCursor();
        const token = instance.getTokenAt(cursor);
        const line = instance.getLine(cursor.line);
        let wordStart = token.start;
        let prefix = line.slice(wordStart, cursor.ch).toUpperCase();
        if (wordStart > 0 && line[wordStart - 1] === '%') {
          prefix = '%' + prefix;
        }
        if (prefix.length < 1) {
          hideAutocomplete();
        } else {
          showAutocomplete(instance);
        }
      }
    });

    // Intercept keys for navigation in autocomplete
    cm.on('keydown', (instance, e) => {
      if (!acVisible) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acSelectedIndex = (acSelectedIndex + 1) % acItems.length;
        renderAutocomplete(instance);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acSelectedIndex = (acSelectedIndex - 1 + acItems.length) % acItems.length;
        renderAutocomplete(instance);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (acSelectedIndex >= 0) {
          e.preventDefault();
          acceptAutocomplete(instance, acSelectedIndex);
        }
      } else if (e.key === 'Escape') {
        hideAutocomplete();
      }
    });

    // Hide on blur/scroll
    cm.on('blur', () => hideAutocomplete());
    cm.on('scroll', () => hideAutocomplete());

    // Click on autocomplete item
    acDropdown.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent blur
      const itemEl = e.target.closest('.fs-ac-item');
      if (itemEl) {
        acceptAutocomplete(cm, parseInt(itemEl.dataset.index));
      }
    });
  }

  attachAutocomplete();

  // ── Snippet Insertion Handler ─────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "DO_INSERT_SNIPPET") {
      const cm = getCodeMirrorInstance();
      if (cm) {
        const cursor = cm.getCursor();
        cm.replaceRange(message.code + '\n', cursor);
        cm.focus();
      }
    }
  });

  // ── Helper ────────────────────────────────────────────────────
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
