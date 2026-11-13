/* ==========================================================
   i18n.js — English / Telugu (తెలుగు) language switch.

   HOW TO MAKE TEXT TRANSLATABLE
   In HTML partials, keep English as the element's normal content and
   put the Telugu alongside it:
     <p data-te="ఇరు కుటుంబాల ఆశీస్సులతో">Together with their families</p>
     <p data-te-html="శ్రీ ... <br/> ...">Elder son of<br/>...</p>   (trusted static markup only)
     <button aria-label="Play music" data-te-aria-label="సంగీతం ప్లే చేయండి">
     <input placeholder="Your name" data-te-placeholder="మీ పేరు">
   Put data-te on the innermost text element (a leaf), not on a wrapper
   whose children have their own listeners or animations.

   In JS, use App.t("English", "తెలుగు") or App.t({ en, te }) at render
   time, and re-render on App.on("lang", (lang) => ...).

   SplitText: if a module splits an element that also has data-te, it must
   store the instance on the element (el._split = split) so the switch can
   revert it first. Never split Telugu into characters: it breaks
   conjunct letters. Use words. App.splitChars() tells you if chars are OK.

   Language selection order: ?lang=te|en, then a saved choice, then English.
   ========================================================== */
(function () {
  const App = window.App;
  if (!App) return;

  const KEY = "aa-lang";
  const TE_FONTS =
    "https://fonts.googleapis.com/css2?family=NTR&family=Anek+Telugu:wght@400;500;600&display=swap";

  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (_) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (_) {} },
  };
  const valid = (l) => l === "en" || l === "te";
  const fromParam = App.params.get("lang");
  const initial = valid(fromParam) ? fromParam : valid(store.get()) ? store.get() : "en";

  App.lang = "en";
  App.t = (en, te) => {
    if (en && typeof en === "object") return App.lang === "te" && en.te != null ? en.te : en.en;
    return App.lang === "te" && te != null ? te : en;
  };
  App.splitChars = () => App.lang !== "te";

  /* ---------- Telugu copy for shared data (names, venue, date) ---------- */
  App.WEDDING.te = {
    groom: "అఖిల్",
    bride: "అలేఖ్య శ్రీ",
    couple: "అఖిల్ & అలేఖ్య శ్రీ",
    groomParents: ["శ్రీ పిల్లి మారేశ్వర రావు", "శ్రీమతి అరుణశ్రీ"],
    brideParents: ["శ్రీ తప్పెట్ల గణేష్ కుమార్", "శ్రీమతి స్వర్ణలత"],
    groomRelation: "గార్ల జ్యేష్ఠ పుత్రుడు",   // follows the parents' names in Telugu
    brideRelation: "గార్ల జ్యేష్ఠ పుత్రిక",
    families: "పిల్లి & తప్పెట్ల వారి కుటుంబాలు",
    dateLong: "ఆదివారం, 29 నవంబర్ 2026",
    time: "ఉదయం 9:05 గంటలకు",
    venue: {
      name: "రాయల్ రీజెన్సీ గార్డెన్స్",
      line1: "ఇండియన్ ఆయిల్ పెట్రోల్ బంక్ ఎదురుగా, మెహదీపట్నం రోడ్",
      line2: "ఆసిఫ్ నగర్, హైదరాబాద్",
    },
  };

  /* ---------- browser-tab title ---------- */
  const TITLE_EN = document.title;
  const TITLE_TE = "అఖిల్ & అలేఖ్య శ్రీ · 29.11.2026";

  /* ---------- swap engine ---------- */
  const ATTRS = ["aria-label", "placeholder", "title", "alt"];
  const camel = (a) => "te" + a.split("-").map((s) => s[0].toUpperCase() + s.slice(1)).join("");
  const SELECTOR = "[data-te],[data-te-html]," + ATTRS.map((a) => `[data-te-${a}]`).join(",");
  const originals = new WeakMap();

  function snapshot(el) {
    if (originals.has(el)) return originals.get(el);
    const o = { html: el.innerHTML, attrs: {} };
    ATTRS.forEach((a) => { if (el.hasAttribute(a)) o.attrs[a] = el.getAttribute(a); });
    originals.set(el, o);
    return o;
  }

  // Capture the English originals now, before any module splits or rewrites text.
  document.querySelectorAll(SELECTOR).forEach(snapshot);

  function applyDom(lang) {
    const reset = [];
    document.querySelectorAll(SELECTOR).forEach((el) => {
      const o = snapshot(el);
      const hasText = el.dataset.te != null || el.dataset.teHtml != null;
      if (hasText) {
        if (el._split) { try { el._split.revert(); } catch (_) {} el._split = null; }
        if (lang === "te") {
          if (el.dataset.teHtml != null) el.innerHTML = el.dataset.teHtml;
          else el.textContent = el.dataset.te;
        } else {
          el.innerHTML = o.html;
        }
        // anything a reveal had hidden mid-animation must stay readable (batched below)
        if (el.style.opacity || el.style.transform) reset.push(el);
      }
      ATTRS.forEach((a) => {
        const te = el.dataset[camel(a)];
        if (te == null) return;
        if (lang === "te") el.setAttribute(a, te);
        else if (o.attrs[a] != null) el.setAttribute(a, o.attrs[a]);
      });
    });
    if (reset.length && window.gsap) window.gsap.set(reset, { clearProps: "opacity,transform" });
  }

  let fontsLinked = false;
  function loadTeluguFonts() {
    if (fontsLinked) return Promise.resolve();
    fontsLinked = true;
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: TE_FONTS });
    document.head.appendChild(link);
    return new Promise((resolve) => {
      link.onload = () => {
        Promise.all(["NTR", "Anek Telugu"].map((f) => document.fonts.load(`1em "${f}"`, "అ")))
          .catch(() => {})
          .then(resolve);
      };
      link.onerror = resolve;
      setTimeout(resolve, 3000);
    });
  }

  function setLang(lang, { silent = false } = {}) {
    if (!valid(lang)) return;
    const changed = lang !== App.lang;
    App.lang = lang;
    const html = document.documentElement;
    html.lang = lang;
    html.classList.toggle("lang-te", lang === "te");
    const anchor = changed && !silent ? captureAnchor() : null;
    applyDom(lang);
    document.title = lang === "te" ? TITLE_TE : TITLE_EN;
    updateToggle();
    store.set(lang);
    if (changed && !silent) {
      App.emit("lang", lang);
      window.ScrollTrigger && window.ScrollTrigger.refresh();
      restoreAnchor(anchor);
    }
    if (lang === "te") {
      loadTeluguFonts().then(() => {
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        restoreAnchor(anchor);
      });
    }
  }

  /* Telugu text is taller, so switching language changes section heights above the reader.
     Keep the section they're looking at in the same place on screen. Inside a pinned scene,
     ScrollTrigger already preserves progress, so leave it alone. */
  function captureAnchor() {
    if (!App.state.opened) return null;
    const ST = window.ScrollTrigger;
    if (ST && ST.getAll().some((t) => t.pin && t.isActive)) return null;
    const blocks = document.querySelectorAll("main > section, main > footer, main > .pin-spacer > section");
    for (const el of blocks) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 1) return { el, top: r.top };
    }
    return null;
  }
  function restoreAnchor(a) {
    if (!a || !a.el.isConnected) return;
    const delta = a.el.getBoundingClientRect().top - a.top;
    if (Math.abs(delta) < 1) return;
    const y = window.scrollY + delta;
    if (App.lenis) App.lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }
  App.setLang = setLang;
  /* Resolves when the current language's fonts are ready. Re-split text (SplitText) only after
     this, or the split measures fallback-font glyphs. */
  App.fontsReady = () =>
    (App.lang === "te" ? loadTeluguFonts() : Promise.resolve()).then(() => document.fonts.ready);

  /* ---------- the toggle: plain text "EN | తె", fixed top-left on the intro and the page ---------- */
  let toggle;
  function buildToggle() {
    toggle = document.createElement("div");
    toggle.className = "lang-toggle";
    toggle.setAttribute("role", "group");
    toggle.setAttribute("aria-label", "Language / భాష");
    toggle.innerHTML =
      '<button type="button" data-lang="en" lang="en" aria-label="English">EN</button>' +
      '<span class="lang-toggle__sep" aria-hidden="true"></span>' +
      '<button type="button" data-lang="te" lang="te" aria-label="తెలుగు (Telugu)">తె</button>';
    toggle.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-lang]");
      if (!b || b.dataset.lang === App.lang) return;
      App.haptic(8);
      setLang(b.dataset.lang);
    });
    // first in the DOM so it's also first in the keyboard tab order (it sits top-left)
    document.body.insertBefore(toggle, document.body.firstChild);
    watchContrast();
  }
  function updateToggle() {
    if (!toggle) return;
    toggle.dataset.active = App.lang;
    toggle.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === App.lang)));
  }

  /* Green text vanishes on the dark-green sections (intro, date card, countdown, footer), so the
     toggle switches to a light mint palette over them. Instead of hit-testing every scroll frame,
     one ScrollTrigger per dark section reports when it passes under the toggle (pins included). */
  function watchContrast() {
    const ST = window.ScrollTrigger;
    const intro = document.getElementById("intro");
    const introShowing = () =>
      !!intro && intro.isConnected && !intro.hidden && getComputedStyle(intro).display !== "none" &&
      getComputedStyle(intro).visibility !== "hidden";
    const active = new Set();
    const update = () => toggle.classList.toggle("is-on-dark", introShowing() || active.size > 0);

    if (ST) {
      const y = () => {
        const r = toggle.getBoundingClientRect();
        return Math.round(r.top + r.height / 2) || 28;
      };
      document.querySelectorAll('main [data-theme="dark"]').forEach((el) => {
        if (getComputedStyle(el).position === "fixed") return;
        ST.create({
          trigger: el,
          start: () => `top ${y()}px`,
          end: () => `bottom ${y()}px`,
          refreshPriority: -1,           // measure after pinned scenes add their spacing
          onToggle: (self) => { self.isActive ? active.add(el) : active.delete(el); update(); },
        });
      });
    } else {
      // no ScrollTrigger: hit-test, throttled to one check per frame
      let queued = false;
      const check = () => {
        queued = false;
        const r = toggle.getBoundingClientRect();
        const under = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((el) => !toggle.contains(el));
        active.clear();
        if (under && under.closest('[data-theme="dark"]')) active.add(under);
        update();
      };
      window.addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(check); } }, { passive: true });
    }
    if (intro && "MutationObserver" in window) {
      new MutationObserver(update).observe(intro, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
      if (intro.parentNode) new MutationObserver(update).observe(intro.parentNode, { childList: true });
    }
    App.on("open", () => [50, 700, 1400, 2200].forEach((t) => setTimeout(update, t)));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", update);
    else update();
    window.addEventListener("load", update);
  }

  buildToggle();
  // Apply the initial language before modules initialise, so they render and split in it.
  if (initial === "te") {
    App._fontsPending = loadTeluguFonts();   // core.start() waits for this before modules init
    setLang("te", { silent: true });
    // Elements parsed after this script (if any) get translated once the DOM is complete.
    // This listener is registered before main.js's, so it runs before modules initialise.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => applyDom(App.lang));
    }
  } else {
    updateToggle();
  }
})();
