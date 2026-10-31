// Mobile menu toggle.
const toggle = document.querySelector(".menu-toggle");
toggle?.addEventListener("click", () => {
  const open = document.body.classList.toggle("nav-open");
  toggle.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".site-header")) {
    document.body.classList.remove("nav-open");
    toggle?.setAttribute("aria-expanded", "false");
  }
});

// Copy buttons on code blocks.
for (const pre of document.querySelectorAll(".prose pre")) {
  const btn = document.createElement("button");
  btn.className = "copy";
  btn.type = "button";
  btn.textContent = "Copy";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector("code")?.innerText ?? pre.innerText);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Failed";
    }
    setTimeout(() => (btn.textContent = "Copy"), 1500);
  });
  pre.append(btn);
}

// Search: Pagefind index (built into /pagefind/), loaded on first open.
const dialog = document.querySelector("dialog.search");
if (dialog) {
  const input = dialog.querySelector("input");
  const list = dialog.querySelector(".search-results");
  const status = dialog.querySelector(".search-status");
  const filterBox = dialog.querySelector(".search-filters");
  const selected = { section: new Set(), tag: new Set() };
  let pagefind = null;
  let items = [];
  let active = -1;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  async function load() {
    if (pagefind) return pagefind;
    pagefind = await import("/pagefind/pagefind.js");
    await pagefind.options({ excerptLength: 22 });
    pagefind.init();
    renderFilters(await pagefind.filters());
    return pagefind;
  }

  function renderFilters(all) {
    const chips = [];
    for (const [key, label] of [["section", ""], ["tag", "#"]]) {
      const values = Object.entries(all[key] ?? {}).sort((a, b) => b[1] - a[1]);
      for (const [value] of values.slice(0, key === "tag" ? 12 : Infinity)) {
        chips.push(`<button type="button" class="chip" data-key="${key}" data-value="${esc(value)}" aria-pressed="false">${label}${esc(value)}</button>`);
      }
    }
    filterBox.innerHTML = chips.join("");
  }

  filterBox.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const set = selected[chip.dataset.key];
    const on = !set.has(chip.dataset.value);
    on ? set.add(chip.dataset.value) : set.delete(chip.dataset.value);
    chip.setAttribute("aria-pressed", String(on));
    run();
    input.focus();
  });

  function setActive(i) {
    const links = list.querySelectorAll("a");
    if (!links.length) return;
    active = (i + links.length) % links.length;
    links.forEach((a, j) => a.setAttribute("aria-selected", String(j === active)));
    links[active].scrollIntoView({ block: "nearest" });
  }

  async function run() {
    const q = input.value.trim();
    const filters = {};
    for (const [key, set] of Object.entries(selected)) if (set.size) filters[key] = { any: [...set] };
    let pf;
    try {
      pf = await load();
    } catch {
      status.textContent = "Search index not found. Run a full build first.";
      return;
    }
    if (!q && !Object.keys(filters).length) {
      list.innerHTML = "";
      status.textContent = "";
      items = [];
      return;
    }
    const search = await pf.debouncedSearch(q || null, { filters }, 120);
    if (search === null) return; // superseded by a newer keystroke
    items = await Promise.all(search.results.slice(0, 10).map((r) => r.data()));
    list.innerHTML = items
      .map((d) => {
        const meta = [d.filters?.section?.[0], d.meta?.date].filter(Boolean).map(esc).join(" · ");
        return `<li><a href="${esc(d.url)}" role="option" aria-selected="false">
          ${meta ? `<span class="result-meta">${meta}</span>` : ""}
          <span class="result-title">${esc(d.meta?.title ?? d.url)}</span>
          <span class="result-excerpt">${d.excerpt}</span>
        </a></li>`;
      })
      .join("");
    const n = search.results.length;
    status.textContent = n ? (n > items.length ? `Showing ${items.length} of ${n} results` : `${n} result${n === 1 ? "" : "s"}`) : "No results.";
    active = -1;
    if (items.length) setActive(0);
  }

  function open() {
    document.body.classList.remove("nav-open");
    dialog.showModal();
    input.select();
    load().catch(() => (status.textContent = "Search index not found. Run a full build first."));
  }

  input.addEventListener("input", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(active + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      list.querySelectorAll("a")[Math.max(active, 0)]?.click();
    }
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close(); // backdrop
  });
  for (const btn of document.querySelectorAll(".search-toggle")) btn.addEventListener("click", open);
  document.addEventListener("keydown", (e) => {
    if (dialog.open) return;
    const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
    if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      open();
    }
  });
}
