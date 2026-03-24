// FrontScript Side Panel — Reference & Snippets
(function () {
  "use strict";

  let tooltipData = {};   // { category: [{ name, description, example }] }
  let snippetsData = {};  // { categories: [{ name, snippets: [...] }] }
  let flatEntries = [];   // [{ name, description, example, category }]
  let activeCategory = "all";
  let searchTerm = "";

  // DOM refs
  const searchInput    = document.getElementById("searchInput");
  const clearBtn       = document.getElementById("clearSearch");
  const referenceList  = document.getElementById("referenceList");
  const referenceCount = document.getElementById("referenceCount");
  const snippetCatsEl  = document.getElementById("snippetCategories");

  // ── Data Loading ──────────────────────────────────────────────

  async function loadData() {
    const [ttRaw, snRaw] = await Promise.all([
      fetch(chrome.runtime.getURL("frontscript-tooltips.json")).then(r => r.json()),
      fetch(chrome.runtime.getURL("snippets.json")).then(r => r.json())
    ]);

    tooltipData = ttRaw;
    snippetsData = snRaw;

    // Build flat list with category tags
    flatEntries = [];
    for (const cat of Object.keys(ttRaw)) {
      for (const entry of ttRaw[cat]) {
        flatEntries.push({
          name: entry.name,
          description: entry.description,
          example: entry.example || "",
          category: cat
        });
      }
    }

    flatEntries.sort((a, b) => a.name.localeCompare(b.name));

    renderReference();
    renderSnippets();
  }

  // ── Reference Tab ─────────────────────────────────────────────

  function renderReference() {
    const q = searchTerm.toLowerCase().trim();
    let filtered = flatEntries;

    // Filter by category
    if (activeCategory !== "all") {
      filtered = filtered.filter(e => e.category === activeCategory);
    }

    // Filter by search
    if (q) {
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      );
    }

    referenceCount.textContent = `${filtered.length} item${filtered.length !== 1 ? "s" : ""}`;

    if (filtered.length === 0) {
      referenceList.innerHTML = '<div class="sp-empty">No matching entries found.</div>';
      return;
    }

    referenceList.innerHTML = filtered.map(entry => {
      const badgeClass = entry.category.toLowerCase();
      const nameHtml = q ? highlightText(entry.name, q) : escapeHtml(entry.name);
      const descHtml = q ? highlightText(entry.description, q) : escapeHtml(entry.description);

      return `
        <div class="sp-entry" data-name="${escapeAttr(entry.name)}">
          <div class="sp-entry-header">
            <span class="sp-entry-name">${nameHtml}</span>
            <span class="sp-entry-badge ${badgeClass}">${entry.category}</span>
            <span class="sp-entry-chevron">&#9654;</span>
          </div>
          <div class="sp-entry-body">
            <div class="sp-entry-desc">${descHtml}</div>
            ${entry.example ? `
              <div class="sp-entry-example">
                <pre>${escapeHtml(entry.example)}</pre>
                <button class="sp-copy-btn" data-code="${escapeAttr(entry.example)}" title="Copy to clipboard">Copy</button>
                <button class="sp-insert-btn" data-code="${escapeAttr(entry.example)}" title="Insert into editor">&#8629;</button>
              </div>
            ` : ""}
          </div>
        </div>`;
    }).join("");
  }

  // ── Snippets Tab ──────────────────────────────────────────────

  function renderSnippets() {
    const q = searchTerm.toLowerCase().trim();
    let cats = snippetsData.categories || [];

    if (q) {
      cats = cats.map(cat => ({
        ...cat,
        snippets: cat.snippets.filter(s =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q)
        )
      })).filter(cat => cat.snippets.length > 0);
    }

    if (cats.length === 0) {
      snippetCatsEl.innerHTML = '<div class="sp-empty">No matching snippets found.</div>';
      return;
    }

    snippetCatsEl.innerHTML = cats.map(cat => `
      <div class="sp-snippet-cat">
        <div class="sp-snippet-cat-header">
          <span class="sp-snippet-cat-name">${escapeHtml(cat.name)}</span>
          <span class="sp-snippet-cat-count">(${cat.snippets.length})</span>
          <span class="sp-snippet-cat-chevron">&#9654;</span>
        </div>
        <div class="sp-snippet-cat-items">
          ${cat.snippets.map(sn => {
            const titleHtml = q ? highlightText(sn.title, q) : escapeHtml(sn.title);
            return `
              <div class="sp-snippet-item">
                <div class="sp-snippet-item-header">
                  <span class="sp-snippet-title">${titleHtml}</span>
                  <span class="sp-snippet-desc">${escapeHtml(sn.description)}</span>
                  <span class="sp-snippet-item-chevron">&#9654;</span>
                </div>
                <div class="sp-snippet-body">
                  <pre>${escapeHtml(sn.code)}</pre>
                  <div class="sp-snippet-actions">
                    <button class="copy-btn" data-code="${escapeAttr(sn.code)}">Copy</button>
                    <button class="insert-btn" data-code="${escapeAttr(sn.code)}">Insert into Editor</button>
                  </div>
                </div>
              </div>`;
          }).join("")}
        </div>
      </div>
    `).join("");
  }

  // ── Event Handling ────────────────────────────────────────────

  // Tab switching
  document.querySelectorAll(".sp-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".sp-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".sp-tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
    });
  });

  // Category filters
  document.querySelector(".sp-filters").addEventListener("click", e => {
    const btn = e.target.closest(".sp-filter");
    if (!btn) return;
    document.querySelectorAll(".sp-filter").forEach(f => f.classList.remove("active"));
    btn.classList.add("active");
    activeCategory = btn.dataset.category;
    renderReference();
  });

  // Search input
  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value;
    clearBtn.classList.toggle("visible", searchTerm.length > 0);
    renderReference();
    renderSnippets();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchTerm = "";
    clearBtn.classList.remove("visible");
    searchInput.focus();
    renderReference();
    renderSnippets();
  });

  // Expand/collapse — delegated clicks
  document.addEventListener("click", e => {
    // Reference entry toggle
    const entryHeader = e.target.closest(".sp-entry-header");
    if (entryHeader) {
      entryHeader.parentElement.classList.toggle("open");
      return;
    }

    // Snippet category toggle
    const catHeader = e.target.closest(".sp-snippet-cat-header");
    if (catHeader) {
      catHeader.parentElement.classList.toggle("open");
      return;
    }

    // Snippet item toggle
    const itemHeader = e.target.closest(".sp-snippet-item-header");
    if (itemHeader) {
      itemHeader.parentElement.classList.toggle("open");
      return;
    }

    // Copy button
    const copyBtn = e.target.closest(".sp-copy-btn, .copy-btn");
    if (copyBtn) {
      const code = copyBtn.dataset.code;
      navigator.clipboard.writeText(code).then(() => showToast("Copied to clipboard"));
      return;
    }

    // Insert button
    const insertBtn = e.target.closest(".sp-insert-btn, .insert-btn");
    if (insertBtn) {
      const code = insertBtn.dataset.code;
      chrome.runtime.sendMessage({ type: "INSERT_SNIPPET", code });
      showToast("Inserted into editor");
      return;
    }
  });

  // Listen for search-from-editor messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "HIGHLIGHT_IN_PANEL") {
      searchInput.value = message.keyword;
      searchTerm = message.keyword;
      clearBtn.classList.toggle("visible", searchTerm.length > 0);
      // Switch to reference tab
      document.querySelectorAll(".sp-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".sp-tab-content").forEach(c => c.classList.remove("active"));
      document.querySelector('[data-tab="reference"]').classList.add("active");
      document.getElementById("tab-reference").classList.add("active");
      renderReference();
      renderSnippets();
    }
  });

  // Keyboard shortcut: focus search
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // ── Toast ─────────────────────────────────────────────────────

  const toast = document.createElement("div");
  toast.className = "sp-toast";
  document.body.appendChild(toast);

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("visible");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("visible"), 1800);
  }

  // ── Helpers ───────────────────────────────────────────────────

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "&#10;");
  }

  function highlightText(text, query) {
    const escaped = escapeHtml(text);
    const qEsc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.replace(
      new RegExp(`(${qEsc})`, "gi"),
      '<span class="sp-highlight">$1</span>'
    );
  }

  // ── Init ──────────────────────────────────────────────────────
  loadData();
})();
