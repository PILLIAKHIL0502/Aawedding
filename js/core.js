/* ==========================================================
   core.js — the shared App contract every module builds on.

   Modules register with:   App.module("name", (App) => { ... })
   They are initialised in script order by App.start() (called from main.js),
   after fonts are ready. A module that throws is logged and skipped, so one
   broken feature never takes the rest of the page down.

   Events (App.on / App.emit):
     "open"          intro finished; page is revealed and scroll unlocked
     "intro:unrolled" the scroll has fully unrolled (before "open")
     "music:play" / "music:pause"
     "tilt"          {x, y} in -1..1 from pointer (desktop) or gyroscope (phones)
     "resize"        debounced window resize
     "lang"          "en" | "te" after the language switch (see js/i18n.js)
   ========================================================== */
(function () {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (gsap) {
    const plugins = [ScrollTrigger, window.Draggable, window.InertiaPlugin, window.SplitText].filter(Boolean);
    gsap.registerPlugin(...plugins);
  }

  // Each visit starts at the top (with the intro); don't restore an old scroll position on reload.
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (_) {}

  const params = new URLSearchParams(location.search);
  const mq = (q) => window.matchMedia(q).matches;

  /* ---------- wedding data (single source of truth) ---------- */
  const venueQuery = "Royal Regency Gardens, Asif Nagar, Hyderabad";
  const enc = encodeURIComponent;
  const WEDDING = {
    // The couple are shown without surnames ("Akhil", "Alekhya Sree"); surnames appear only with the parents.
    groom: {
      first: "Akhil", full: "Akhil", family: "Pilli",
      relation: "Elder son of", parents: ["Mr. Pilli Mareswara Rao", "Mrs. Arunasri"],
    },
    bride: {
      first: "Alekhya Sree", full: "Alekhya Sree", family: "Tappetla",
      relation: "Elder daughter of", parents: ["Mr. Tappetla Ganesh Kumar", "Mrs. Swarnalatha"],
    },
    couple: "Akhil & Alekhya Sree",
    families: "the Pilli & Tappetla families",
    hashtag: "#AkhilWedsAlekhya",
    start: new Date("2026-11-29T09:05:00+05:30"),
    end: new Date("2026-11-29T13:05:00+05:30"),
    dateLong: "Sunday, 29 November 2026",
    time: "9:05 AM",
    venue: {
      name: "Royal Regency Gardens",
      line1: "Opp. Indian Oil Petrol Pump, Mehdipatnam Road",
      line2: "Asif Nagar, Hyderabad",
      full: "Royal Regency Gardens, Opp. Indian Oil Petrol Pump, Mehdipatnam Road, Asif Nagar, Hyderabad",
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${enc(venueQuery)}`,
      directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${enc(venueQuery)}`,
      appleMapsUrl: `https://maps.apple.com/?q=${enc("Royal Regency Gardens")}&address=${enc("Asif Nagar, Hyderabad")}`,
      embedUrl: `https://maps.google.com/maps?q=${enc(venueQuery)}&z=16&output=embed`,
    },
  };

  /* ---------- personalised guest name: ?to=Ravi%20Uncle ---------- */
  const rawGuest = (params.get("to") || "").replace(/[<>{}"`]/g, "").trim().slice(0, 40);
  const guest = rawGuest || null;

  /* ---------- tiny event bus ---------- */
  const listeners = {};
  let registering = null;   // module currently initialising (tags its listeners)
  const on = (evt, fn) => {
    if (registering && !fn.__module) fn.__module = registering;
    (listeners[evt] ||= []).push(fn);
    return () => off(evt, fn);
  };
  const off = (evt, fn) => { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); };
  const emit = (evt, data) => (listeners[evt] || []).slice().forEach((fn) => {
    try { fn(data); } catch (e) { console.error(`[App] listener for "${evt}" failed`, e); }
  });

  /* While the unrolled parchment covers the page, measure the real (unlocked) layout once.
     The guest is reading, the page behind is hidden, so the ~50-190 ms refresh is invisible here
     instead of stalling the curtain lift or the hero entrance. */
  let prerefreshed = false;
  let prerefreshHeight = 0;
  const prerefresh = () => {
    if (prerefreshed || App.state.opened || !ScrollTrigger) return;
    const html = document.documentElement;
    const t0 = performance.now();
    html.classList.remove("is-locked");
    ScrollTrigger.refresh();
    prerefreshHeight = document.documentElement.scrollHeight;
    html.classList.add("is-locked");
    prerefreshed = true;
    if (App.params.has("debugperf")) console.log(`[perf] prerefresh ${(performance.now() - t0).toFixed(1)}ms`);
  };
  on("intro:unrolled", () => setTimeout(prerefresh, 120));

  // Modules whose "open" work is visible immediately after the curtain lifts.
  const ABOVE_FOLD = new Set(["intro", "hero", "player", "fx", "particles"]);

  // Run each listener in its own animation frame, then call done().
  const runSpread = (fns, done) => {
    const queue = fns.slice();
    const next = () => {
      const fn = queue.shift();
      if (!fn) return done && done();
      const t0 = performance.now();
      try { fn(); } catch (e) { console.error('[App] "open" listener failed', e); }
      if (App.params.has("debugperf")) console.log(`[perf] open:${fn.__module || "core"} ${(performance.now() - t0).toFixed(1)}ms @${t0.toFixed(0)}`);
      requestAnimationFrame(next);
    };
    next();
  };

  // Call fn once the intro overlay has finished leaving (hidden or removed), or after 2.5 s.
  const afterIntroGone = (fn) => {
    const intro = document.getElementById("intro");
    let fired = false;
    const fire = () => { if (!fired) { fired = true; fn(); } };
    const gone = () => !intro || !intro.isConnected || intro.hidden || getComputedStyle(intro).display === "none";
    if (gone()) return fire();
    const mo = new MutationObserver(() => { if (gone()) { mo.disconnect(); fire(); } });
    mo.observe(intro, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
    mo.observe(intro.parentNode, { childList: true });
    setTimeout(() => { mo.disconnect(); fire(); }, 2500);
  };

  /* ---------- module registry ---------- */
  const modules = [];
  const module = (name, init) => modules.push({ name, init });

  const App = {
    WEDDING,
    guest,
    params,
    gsap,
    ScrollTrigger,
    reduceMotion: mq("(prefers-reduced-motion: reduce)"),
    isTouch: mq("(pointer: coarse)"),
    finePointer: mq("(hover: hover) and (pointer: fine)"),
    isMobile: () => window.innerWidth < 760,
    skipIntro: params.has("skipintro"),
    state: { opened: false, motionGranted: false },
    tilt: { x: 0, y: 0 },
    lenis: null,

    on, off, emit, module,

    /* ---- late-bound feature APIs: real implementations replace these stubs ---- */
    music: { start() {}, pause() {}, toggle() {}, playing: false, analyser: null },
    fx: { burst() {} },

    /* ---- helpers ---- */
    $: (sel, root = document) => root.querySelector(sel),
    $$: (sel, root = document) => Array.from(root.querySelectorAll(sel)),
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    lerp: (a, b, t) => a + (b - a) * t,

    haptic(pattern = 12) {
      try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
    },

    toast(msg, ms = 2600) {
      const t = document.getElementById("toast");
      if (!t) return;
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(App._toastT);
      App._toastT = setTimeout(() => t.classList.remove("show"), ms);
    },

    lock() {
      document.documentElement.classList.add("is-locked");
      App.lenis && App.lenis.stop();
    },
    unlock({ refresh = true } = {}) {
      const html = document.documentElement;
      const wasLocked = html.classList.contains("is-locked");
      html.classList.remove("is-locked");
      App.lenis && App.lenis.start();
      if (refresh && wasLocked && ScrollTrigger) ScrollTrigger.refresh();
    },

    scrollTo(target, opts = {}) {
      // Lenis cancels a scrollTo started in the same moment a finger lifts (its touchend
      // handler stops running animations), so defer one frame right after a touch ends.
      if (App.lenis && performance.now() - lastTouchEnd < 80 && !opts._deferred) {
        requestAnimationFrame(() => App.scrollTo(target, { ...opts, _deferred: true }));
        return;
      }
      if (App.lenis) App.lenis.scrollTo(target, { duration: 1.6, ...opts });
      else {
        const el = typeof target === "string" ? document.querySelector(target) : target;
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: App.reduceMotion ? "auto" : "smooth" });
        else if (typeof target === "number") window.scrollTo({ top: target, behavior: "smooth" });
      }
    },

    /* Must be called from inside a user gesture (tap) to work on iOS. */
    requestMotionPermission() {
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === "function") {
        DOE.requestPermission()
          .then((s) => { if (s === "granted") startGyro(); })
          .catch(() => {});
      } else {
        startGyro();
      }
    },

    /* Called by intro (or by core when the intro is skipped). */
    /* Called by the intro the instant the guest taps "Open", before anything moves. Unlocking
       re-lays-out the whole document (~100-200 ms on a slow phone); doing it here, on a still
       frame, keeps that cost out of the curtain animation. open() later skips it. */
    beginOpen() {
      if (App.state.opened) return;
      App.unlock({ refresh: false });
    },

    /* Called by the intro mid-way through its curtain lift (or by core when the intro is skipped).
       Every module sets up its entrance on "open"; running them all in one frame stalled the
       curtain animation on phones (~140 ms, ~400 ms on slow CPUs). So listeners run one per
       animation frame, and the single layout refresh waits until the intro overlay is gone. */
    open() {
      if (App.state.opened) return;
      App.state.opened = true;
      App.unlock({ refresh: false });
      document.documentElement.classList.add("is-open");
      // What's on screen at the start sets up during the curtain lift; sections further down
      // set up once the intro is gone (nobody can scroll to them before that anyway).
      const all = (listeners.open || []).slice();
      const now = all.filter((fn) => !fn.__module || ABOVE_FOLD.has(fn.__module));
      const later = all.filter((fn) => !now.includes(fn));
      runSpread(now, () => afterIntroGone(() => runSpread(later, () => {
        // Layout was already measured while the guest read the parchment (see prerefresh), so the
        // final tidy-up refresh can wait for an idle moment instead of interrupting the hero entrance.
        const go = () => {
          const t0 = performance.now();
          ScrollTrigger && ScrollTrigger.refresh();
          if (App.params.has("debugperf")) console.log(`[perf] refresh ${(performance.now() - t0).toFixed(1)}ms @${t0.toFixed(0)}`);
        };
        if (!prerefreshed) return go();
        // Only re-measure if something actually changed the page height since the pre-measure.
        const goIfChanged = () => {
          if (Math.abs(document.documentElement.scrollHeight - prerefreshHeight) > 2) go();
        };
        if ("requestIdleCallback" in window) requestIdleCallback(goIfChanged, { timeout: 6000 });
        else setTimeout(goIfChanged, 4000);
      })));
    },

    async start() {
      if (gsap && !App.reduceMotion) document.documentElement.classList.add("js-anim");
      setupSmoothScroll();
      setupPointerTilt();
      setupResize();

      try {
        await Promise.race([
          Promise.all([document.fonts.ready, App._fontsPending || Promise.resolve()]),
          new Promise((r) => setTimeout(r, 2500)),
        ]);
      } catch (_) {}

      const ready = new Set();
      for (const m of modules) {
        registering = m.name;
        try { m.init(App); ready.add(m.name); }
        catch (e) { console.error(`[App] module "${m.name}" failed to init`, e); }
        registering = null;
      }

      setupReveals();

      const intro = document.getElementById("intro");
      // If the intro's script is missing or crashed, never leave guests stuck behind the overlay.
      const introBroken = intro && !ready.has("intro");
      if (introBroken) console.warn("[App] intro module unavailable; opening the page directly");
      if (App.skipIntro || !intro || introBroken) {
        if (intro) intro.remove();
        App.open();
      } else {
        App.lock();
      }

      ScrollTrigger && ScrollTrigger.refresh();
      // late refresh once images/iframes settle
      window.addEventListener("load", () => ScrollTrigger && ScrollTrigger.refresh());
    },
  };

  let lastTouchEnd = -1e9;
  window.addEventListener("touchend", () => { lastTouchEnd = performance.now(); }, { passive: true, capture: true });

  /* ---------- smooth scroll (Lenis) wired into GSAP's ticker ---------- */
  function setupSmoothScroll() {
    if (!window.Lenis || App.reduceMotion) return;
    App.lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
    if (ScrollTrigger) App.lenis.on("scroll", ScrollTrigger.update);
    if (gsap) {
      gsap.ticker.add((time) => App.lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    }
    // in-page anchor links go through Lenis
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || a.getAttribute("href").length < 2) return;
      const el = document.querySelector(a.getAttribute("href"));
      if (!el) return;
      e.preventDefault();
      App.scrollTo(el);
    });
  }

  /* ---------- tilt: pointer on desktop, gyroscope on phones ---------- */
  function setTilt(x, y) {
    App.tilt.x = App.clamp(x, -1, 1);
    App.tilt.y = App.clamp(y, -1, 1);
    emit("tilt", App.tilt);
  }
  function setupPointerTilt() {
    if (!App.finePointer) return;
    window.addEventListener("pointermove", (e) => {
      setTilt((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
  }
  let gyroOn = false;
  function startGyro() {
    if (gyroOn || App.finePointer) return;
    gyroOn = true;
    App.state.motionGranted = true;
    let base = null;
    window.addEventListener("deviceorientation", (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (!base) base = { beta: e.beta, gamma: e.gamma };
      setTilt((e.gamma - base.gamma) / 25, (e.beta - base.beta) / 25);
    }, { passive: true });
  }

  function setupResize() {
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => emit("resize"), 150);
    });
    if (!ScrollTrigger) return;
    /* Rotating a phone can add or remove whole pinned scenes (short screens drop the pin), which
       shifts every later section. Remember where the reader is at the first resize event (before
       gsap.matchMedia reverts any pin) and put them back in the same scene after the refresh. */
    let anchor = null;
    const capture = () => {
      if (anchor || !App.state.opened) return;
      const pinned = ScrollTrigger.getAll().find((st) => st.pin && st.isActive);
      if (pinned) {
        anchor = { el: pinned.trigger.closest("section") || pinned.trigger, progress: pinned.progress, pinned: true };
        return;
      }
      const mid = window.innerHeight / 2;
      for (const el of document.querySelectorAll("main section, main footer")) {
        const r = el.getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) { anchor = { el, offset: (mid - r.top) / Math.max(1, r.height) }; break; }
      }
    };
    window.addEventListener("resize", capture, true);
    ScrollTrigger.addEventListener("refresh", () => {
      const a = anchor;
      anchor = null;
      if (!a || !a.el.isConnected) return;
      let y;
      const st = a.pinned && ScrollTrigger.getAll().find((s) => s.pin && a.el.contains(s.trigger));
      if (st) {
        y = st.start + a.progress * (st.end - st.start);           // same point in the pinned scene
      } else if (a.pinned) {
        const r = a.el.getBoundingClientRect();                      // pin gone: same share of the section
        y = r.top + window.scrollY + a.progress * Math.max(0, r.height - window.innerHeight);
      } else {
        const r = a.el.getBoundingClientRect();                      // keep the same spot at mid-screen
        y = r.top + window.scrollY + a.offset * r.height - window.innerHeight / 2;
      }
      y = Math.max(0, y);
      if (App.lenis) App.lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
    });
  }

  /* ---------- generic scroll reveals ----------
     [data-reveal]            fade up (default)
     [data-reveal="fade|left|right|zoom|up"]
     [data-reveal-delay="0.2"]
     [data-split]             split text into lines+words, words rise in on scroll
     [data-split="chars"]     split into characters
     Modules that animate an element themselves should NOT also put these attributes on it. */
  function setupReveals() {
    const els = App.$$("[data-reveal]");
    const splits = App.$$("[data-split]");
    if (!gsap || !ScrollTrigger || App.reduceMotion) {
      els.forEach((el) => (el.style.opacity = 1));
      return;
    }
    const from = {
      up: { y: 40 }, fade: {}, left: { x: -60 }, right: { x: 60 }, zoom: { scale: 0.88 },
    };
    els.forEach((el) => {
      const kind = el.dataset.reveal || "up";
      gsap.fromTo(el, { opacity: 0, ...(from[kind] || from.up) }, {
        opacity: 1, x: 0, y: 0, scale: 1,
        duration: 1.2, ease: "expo.out",
        delay: parseFloat(el.dataset.revealDelay || 0),
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });
    if (window.SplitText) {
      splits.forEach((el) => {
        // Telugu must never be split into characters (it breaks conjunct letters)
        const chars = el.dataset.split === "chars" && App.lang !== "te";
        const split = new window.SplitText(el, {
          type: chars ? "lines,words,chars" : "lines,words",
          linesClass: "split-line", wordsClass: "split-word", charsClass: "split-char",
        });
        el._split = split;   // lets the language switch revert it
        gsap.from(chars ? split.chars : split.words, {
          yPercent: 110, opacity: 0, rotate: chars ? 0 : 4,
          duration: 1.1, ease: "expo.out", stagger: chars ? 0.025 : 0.06,
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        });
      });
    }
  }

  window.App = App;
})();
