/* ==========================================================
   fx.js — app-wide effects (every class is prefixed fx-)
   - scroll progress: a 2px gold bar at the very top
   - side dot navigation built from section[data-nav] (desktop: labels on hover;
     touch: a slim indicator rail that wakes while scrolling; hidden on short screens)
   - html.fx-on-dark while a [data-theme="dark"] block is under the viewport centre
   - custom cursor (fine pointers only): gold dot + lagging ring, labels from
     [data-cursor] / [data-te-cursor], tiny sparkles on click
   - touch ripple: a gold ring at each tap (pooled nodes)
   - magnetic: [data-magnetic] (optional strength, e.g. data-magnetic="0.4") follows the pointer
   - App.fx.burst(x, y, opts): sparkle burst in viewport coordinates, for any module
   ========================================================== */
(function () {
  const App = window.App;
  if (!App) return;

  App.module("fx", (App) => {
    const gsap = App.gsap;
    const ST = App.ScrollTrigger;
    const html = document.documentElement;
    const motion = !!gsap && !App.reduceMotion;

    const root = document.createElement("div");
    root.className = "fx-root";
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);

    App.fx = App.fx || {};
    App.fx.burst = burst;

    setupProgress();
    setupNav();
    setupTheme();
    if (motion && App.finePointer) {
      setupCursor();
      setupMagnetic();
    }
    if (motion && App.isTouch) setupRipple();

    /* ---------- helpers ---------- */
    // Sections may be pinned by other modules: measure the pin-spacer, which keeps the full scroll length.
    function boxOf(node) {
      const p = node.parentElement;
      return p && p.classList.contains("pin-spacer") ? p : node;
    }
    function centreEdge(node, edge) {
      const r = boxOf(node).getBoundingClientRect();
      return (edge === "top" ? r.top : r.bottom) + window.scrollY - window.innerHeight / 2;
    }
    function onOpen(fn) { if (App.state.opened) fn(); else App.on("open", fn); }

    /* ---------- sparkle burst (pooled) ---------- */
    const sparkPool = [];
    let sparkIdx = 0;
    function sparkNode() {
      if (sparkPool.length < 48) {
        const n = document.createElement("i");
        root.appendChild(n);
        sparkPool.push(n);
        return n;
      }
      const n = sparkPool[sparkIdx++ % sparkPool.length];
      gsap.killTweensOf(n);
      return n;
    }
    function burst(x, y, opts = {}) {
      if (!motion || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const count = Math.min(opts.count || 10, 24);
      const spread = opts.spread || 60;
      const dur = opts.duration || .9;
      const gravity = opts.gravity == null ? 12 : opts.gravity;
      const dark = !!opts.dark;
      for (let i = 0; i < count; i++) {
        const n = sparkNode();
        const star = Math.random() < .45;
        n.className = "fx-spark" + (star ? " fx-spark--star" : "") + (dark ? " fx-spark--dark" : "");
        const size = (opts.size || 5) * (star ? 1.6 : 1) * (.7 + Math.random() * .6);
        n.style.width = n.style.height = size.toFixed(1) + "px";
        const a = (i / count) * Math.PI * 2 + Math.random() * .7;
        const d = spread * (.45 + Math.random() * .55);
        gsap.fromTo(n,
          { x, y, xPercent: -50, yPercent: -50, scale: 1, opacity: 1, rotation: 0 },
          {
            x: x + Math.cos(a) * d,
            y: y + Math.sin(a) * d + gravity,
            scale: 0, opacity: 0, rotation: (Math.random() - .5) * 220,
            duration: dur * (.7 + Math.random() * .5), ease: "power3.out",
          });
      }
    }

    /* ---------- scroll progress ---------- */
    function setupProgress() {
      const wrap = document.createElement("div");
      wrap.className = "fx-progress";
      wrap.innerHTML = '<div class="fx-progress__bar"></div>';
      root.appendChild(wrap);
      const bar = wrap.firstChild;
      if (!ST || !gsap) { wrap.hidden = true; return; }
      const set = gsap.quickSetter(bar, "scaleX");
      set(0);
      ST.create({
        start: 0,
        end: "max",
        refreshPriority: -1,
        onUpdate: (self) => set(self.progress),
        onRefresh: (self) => set(self.progress),
      });
    }

    /* ---------- side dot navigation ---------- */
    function setupNav() {
      const sections = App.$$("section[data-nav]");
      if (sections.length < 2) return;
      const rail = !App.finePointer;           // touch: indicator only
      const nav = document.createElement("nav");
      nav.className = "fx-nav" + (rail ? " fx-nav--rail" : "");
      if (rail) nav.setAttribute("aria-hidden", "true");
      const list = document.createElement("ol");
      list.className = "fx-nav__list";
      nav.appendChild(list);

      const items = sections.map((section) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "fx-nav__item";
        if (rail) b.tabIndex = -1;
        b.innerHTML = '<span class="fx-nav__label"></span><span class="fx-nav__dot"></span>';
        b.addEventListener("click", () => {
          App.haptic(8);
          App.scrollTo(boxOf(section));
        });
        li.appendChild(b);
        list.appendChild(li);
        return { section, b, label: b.firstChild };
      });

      function renderLabels() {
        nav.setAttribute("aria-label", App.t("Sections", "విభాగాలు"));
        items.forEach((it) => {
          const text = App.t(it.section.dataset.nav, it.section.dataset.teNav);
          it.label.textContent = text;
          it.b.setAttribute("aria-label", text);
        });
      }
      renderLabels();
      App.on("lang", renderLabels);

      let active = -1;
      function setActive(i) {
        if (i === active) return;
        active = i;
        items.forEach((it, j) => {
          it.b.classList.toggle("is-active", i === j);
          if (i === j) it.b.setAttribute("aria-current", "true");
          else it.b.removeAttribute("aria-current");
        });
      }
      setActive(0);

      document.body.appendChild(nav);

      if (ST) {
        items.forEach((it, i) => {
          ST.create({
            start: () => centreEdge(it.section, "top"),
            end: () => centreEdge(it.section, "bottom"),
            refreshPriority: -1,
            onToggle: (self) => { if (self.isActive) setActive(i); },
          });
        });
      }

      if (rail) {
        // the rail wakes while the page moves, then fades away
        let t;
        window.addEventListener("scroll", () => {
          if (!App.state.opened) return;
          nav.classList.add("is-awake");
          clearTimeout(t);
          t = setTimeout(() => nav.classList.remove("is-awake"), 1400);
        }, { passive: true });
      }
    }

    /* ---------- dark sections under the viewport centre ---------- */
    function setupTheme() {
      if (!ST) return;
      const darks = App.$$('[data-theme="dark"]').filter((d) => {
        if (d.closest("#intro")) return false;
        if (d.parentElement && d.parentElement.closest('[data-theme="dark"]')) return false;
        const pos = getComputedStyle(d).position;
        return pos !== "fixed" && pos !== "sticky";
      });
      const on = new Set();
      darks.forEach((d) => {
        ST.create({
          start: () => centreEdge(d, "top"),
          end: () => centreEdge(d, "bottom"),
          refreshPriority: -1,
          onToggle: (self) => {
            if (self.isActive) on.add(d); else on.delete(d);
            html.classList.toggle("fx-on-dark", on.size > 0);
          },
        });
      });
    }

    /* ---------- custom cursor ---------- */
    function setupCursor() {
      const c = document.createElement("div");
      c.className = "fx-pointer";
      c.innerHTML =
        '<div class="fx-pointer__ring"><div class="fx-pointer__ring-in"></div><span class="fx-pointer__label"></span></div>' +
        '<div class="fx-pointer__dot"><i></i></div>';
      root.appendChild(c);
      const ring = c.querySelector(".fx-pointer__ring");
      const dot = c.querySelector(".fx-pointer__dot");
      const label = c.querySelector(".fx-pointer__label");

      gsap.set([ring, dot], { xPercent: -50, yPercent: -50, x: -200, y: -200 });
      const dotX = gsap.quickTo(dot, "x", { duration: .1, ease: "power3" });
      const dotY = gsap.quickTo(dot, "y", { duration: .1, ease: "power3" });
      const ringX = gsap.quickTo(ring, "x", { duration: .5, ease: "power3" });
      const ringY = gsap.quickTo(ring, "y", { duration: .5, ease: "power3" });

      const HOVER = 'a[href], button, input, textarea, select, label[for], summary, [role="button"], [data-cursor]';
      const TEXT = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]), textarea, select, [contenteditable]:not([contenteditable="false"])';

      let enabled = false;
      let visible = false;
      let hoverEl = null;
      let last = null;

      onOpen(() => {
        enabled = true;
        html.classList.add("fx-cursor");
        if (last) show(last.x, last.y);
      });

      function show(x, y) {
        if (!visible) {
          gsap.set([dot, ring], { x, y });
          visible = true;
        }
        c.classList.add("is-on");
      }
      function hide() {
        visible = false;
        c.classList.remove("is-on");
      }

      // Elements stacked above the cursor layer (player, toast, language toggle, intro) keep the native cursor.
      function aboveCursorLayer(node) {
        for (let n = node; n && n !== document.body && n !== html; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.position === "fixed") {
            const z = parseInt(cs.zIndex, 10);
            return Number.isFinite(z) && z > 65;
          }
        }
        return false;
      }
      function labelFor(node) {
        if (!node || !node.hasAttribute("data-cursor")) return "";
        const te = node.getAttribute("data-te-cursor");
        return (App.lang === "te" && te) ? te : node.getAttribute("data-cursor") || "";
      }

      window.addEventListener("pointermove", (e) => {
        if (e.pointerType === "touch") return;
        last = { x: e.clientX, y: e.clientY };
        if (!enabled) return;
        if (!visible) show(e.clientX, e.clientY);
        dotX(e.clientX); dotY(e.clientY);
        ringX(e.clientX); ringY(e.clientY);
      }, { passive: true });

      document.addEventListener("pointerover", (e) => {
        if (e.pointerType === "touch") return;
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        const native = t.tagName === "IFRAME" || aboveCursorLayer(t);
        html.classList.toggle("fx-native", native);
        c.classList.toggle("is-native", native);
        const text = t.closest(TEXT);
        hoverEl = text ? null : t.closest(HOVER);
        const lbl = labelFor(hoverEl);
        label.textContent = lbl;
        c.classList.toggle("is-text", !!text);
        c.classList.toggle("is-hover", !!hoverEl);
        c.classList.toggle("has-label", !!lbl);
        c.classList.toggle("is-dark", !!t.closest('[data-theme="dark"]'));
      }, { passive: true });

      App.on("lang", () => {
        const lbl = labelFor(hoverEl);
        label.textContent = lbl;
        c.classList.toggle("has-label", !!lbl);
      });

      document.addEventListener("mouseout", (e) => { if (!e.relatedTarget) hide(); });
      window.addEventListener("blur", hide);

      window.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "touch" || !enabled) return;
        c.classList.add("is-down");
        const t = e.target instanceof Element ? e.target : null;
        if (t && (t.closest(TEXT) || aboveCursorLayer(t))) return;
        burst(e.clientX, e.clientY, { count: 9, spread: 40, size: 4.2, duration: .75, gravity: 8, dark: c.classList.contains("is-dark") });
      }, { passive: true });
      window.addEventListener("pointerup", () => c.classList.remove("is-down"), { passive: true });
    }

    /* ---------- magnetic elements (springy, uses the CSS `translate` property) ---------- */
    function setupMagnetic() {
      const springs = new Map();
      const K = 190, D = 15, MAX = 22;
      let current = null;
      let ticking = false;

      const state = (node) => {
        let s = springs.get(node);
        if (!s) { s = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }; springs.set(node, s); }
        return s;
      };
      const release = (node) => { const s = springs.get(node); if (s) { s.tx = 0; s.ty = 0; } start(); };
      const start = () => { if (!ticking) { ticking = true; gsap.ticker.add(tick); } };

      function tick(time, deltaMs) {
        const h = Math.min(deltaMs || 16, 32) / 1000;
        springs.forEach((s, node) => {
          s.vx += ((s.tx - s.x) * K - s.vx * D) * h;
          s.vy += ((s.ty - s.y) * K - s.vy * D) * h;
          s.x += s.vx * h;
          s.y += s.vy * h;
          const rest = s.tx === 0 && s.ty === 0 && Math.abs(s.x) < .05 && Math.abs(s.y) < .05 &&
            Math.abs(s.vx) < .5 && Math.abs(s.vy) < .5;
          if (rest) { node.style.translate = ""; springs.delete(node); }
          else node.style.translate = `${s.x.toFixed(2)}px ${s.y.toFixed(2)}px`;
        });
        if (!springs.size) { ticking = false; gsap.ticker.remove(tick); }
      }

      window.addEventListener("pointermove", (e) => {
        if (e.pointerType === "touch") return;
        const t = e.target instanceof Element ? e.target.closest("[data-magnetic]") : null;
        if (t !== current) { if (current) release(current); current = t; }
        if (!current) return;
        const s = state(current);
        const r = current.getBoundingClientRect();
        const cx = r.left + r.width / 2 - s.x;     // centre of the element at rest
        const cy = r.top + r.height / 2 - s.y;
        const k = parseFloat(current.dataset.magnetic) || .3;
        const max = Math.min(MAX, Math.max(r.width, r.height) * .3);
        s.tx = App.clamp((e.clientX - cx) * k, -max, max);
        s.ty = App.clamp((e.clientY - cy) * k, -max, max);
        start();
      }, { passive: true });
      document.addEventListener("mouseout", (e) => { if (!e.relatedTarget && current) { release(current); current = null; } });
    }

    /* ---------- touch ripple ---------- */
    function setupRipple() {
      const pool = Array.from({ length: 6 }, () => {
        const n = document.createElement("i");
        n.className = "fx-ripple";
        root.appendChild(n);
        return n;
      });
      let i = 0;
      window.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" || !App.state.opened) return;
        const n = pool[i++ % pool.length];
        const t = e.target instanceof Element ? e.target : null;
        n.classList.toggle("fx-ripple--dark", !!(t && t.closest('[data-theme="dark"]')));
        gsap.killTweensOf(n);
        gsap.fromTo(n,
          { x: e.clientX, y: e.clientY, xPercent: -50, yPercent: -50, scale: .12, opacity: .9 },
          { scale: 1, opacity: 0, duration: .75, ease: "power2.out" });
      }, { passive: true, capture: true });
    }
  });
})();
