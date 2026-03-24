// Page-world script — runs in the page's JS context so it can access CodeMirror instances.
// Communicates with the content script (isolated world) via CustomEvents on document.
(function () {
  "use strict";

  let cm = null;
  let allKeywords = [];
  let acItems = [];
  let acSelectedIndex = -1;
  let acVisible = false;
  let acPrefix = "";
  let acCursorToken = null;
  let acDropdown = null;

  // ── Get the CodeMirror instance ─────────────────────────────
  function getCodeMirrorInstance() {
    const el = document.querySelector(".CodeMirror.cm-s-frontscript");
    return el && el.CodeMirror;
  }

  // ── Wait for CM then initialise ─────────────────────────────
  function waitAndInit(timeout) {
    if (timeout <= 0) return;
    cm = getCodeMirrorInstance();
    if (cm) {
      init();
    } else {
      setTimeout(() => waitAndInit(timeout - 200), 200);
    }
  }

  // ── Receive keyword list from content script ────────────────
  document.addEventListener("__FS_SET_KEYWORDS", (e) => {
    allKeywords = e.detail || [];
    waitAndInit(10000);
  });

  // ── Receive snippet insertion request from content script ───
  document.addEventListener("__FS_INSERT_SNIPPET", (e) => {
    const code = e.detail;
    const editor = cm || getCodeMirrorInstance();
    if (editor && code) {
      const cursor = editor.getCursor();
      editor.replaceRange(code + "\n", cursor);
      editor.focus();
    }
  });

  // ── Init autocomplete ───────────────────────────────────────
  function init() {
    // Create autocomplete dropdown
    acDropdown = document.createElement("div");
    acDropdown.className = "fs-autocomplete";
    acDropdown.style.display = "none";
    document.body.appendChild(acDropdown);

    // On text input
    cm.on("inputRead", (instance, changeObj) => {
      if (changeObj.origin === "+input" || changeObj.origin === "+completion") {
        showAutocomplete(instance);
      }
    });

    // On cursor activity (backspace, arrow keys while ac open)
    cm.on("cursorActivity", (instance) => {
      if (acVisible) {
        showAutocomplete(instance);
      }
    });

    // Keyboard navigation inside autocomplete
    cm.on("keydown", (instance, e) => {
      if (!acVisible) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        acSelectedIndex = (acSelectedIndex + 1) % acItems.length;
        renderDropdown();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        acSelectedIndex = (acSelectedIndex - 1 + acItems.length) % acItems.length;
        renderDropdown();
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (acSelectedIndex >= 0) {
          e.preventDefault();
          acceptItem(acSelectedIndex);
        }
      } else if (e.key === "Escape") {
        hideDropdown();
      }
    });

    cm.on("blur", () => hideDropdown());
    cm.on("scroll", () => hideDropdown());

    // Mouse click on item
    acDropdown.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep editor focus
      const el = e.target.closest(".fs-ac-item");
      if (el) acceptItem(parseInt(el.dataset.index));
    });

    // Let content script know we're ready
    document.dispatchEvent(new CustomEvent("__FS_PAGE_READY"));
  }

  // ── Autocomplete logic ──────────────────────────────────────
  function showAutocomplete(editor) {
    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);
    const line = editor.getLine(cursor.line);

    let wordStart = token.start;
    let prefix = line.slice(wordStart, cursor.ch).toUpperCase();

    // Handle % for macros
    if (wordStart > 0 && line[wordStart - 1] === "%") {
      wordStart--;
      prefix = "%" + prefix;
    }

    if (prefix.length < 1 || prefix === "%") {
      hideDropdown();
      return;
    }

    acPrefix = prefix;
    acCursorToken = { line: cursor.line, start: wordStart, end: cursor.ch };

    const matches = allKeywords.filter(
      (kw) => kw.upperName.startsWith(acPrefix) && kw.upperName !== acPrefix
    );

    if (matches.length === 0) {
      hideDropdown();
      return;
    }

    acItems = matches.slice(0, 12);
    acSelectedIndex = 0;

    // Position dropdown
    const coords = editor.cursorCoords(cursor, "page");
    acDropdown.style.left = coords.left + "px";
    acDropdown.style.top = coords.bottom + 2 + "px";

    renderDropdown();
    acDropdown.style.display = "block";
    acVisible = true;
  }

  function renderDropdown() {
    acDropdown.innerHTML = acItems
      .map((item, i) => {
        const catClass = item.category.toLowerCase();
        const sel = i === acSelectedIndex ? " selected" : "";
        return `<div class="fs-ac-item${sel}" data-index="${i}">
          <span class="fs-ac-name">${esc(item.name)}</span>
          <span class="fs-ac-badge ${catClass}">${item.category}</span>
        </div>`;
      })
      .join("");
  }

  function hideDropdown() {
    if (!acDropdown) return;
    acDropdown.style.display = "none";
    acVisible = false;
    acItems = [];
    acSelectedIndex = -1;
  }

  function acceptItem(index) {
    if (index < 0 || index >= acItems.length) return;
    const item = acItems[index];
    const tok = acCursorToken;
    if (!tok || !cm) return;

    cm.replaceRange(item.name, { line: tok.line, ch: tok.start }, { line: tok.line, ch: tok.end });
    hideDropdown();
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
})();
