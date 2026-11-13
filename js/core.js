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
   ========================================================== */
(function () {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (gsap) {
    const plugins = [ScrollTrigger, window.Draggable, window.InertiaPlugin, window.SplitText].filter(Boolean);
    gsap.registerPlugin(...plugins);
  }

  const params = new URLSearchParams(location.search);
  const mq = (q) => window.matchMedia(q).matches;

  /* ---------- wedding data (single source of truth) ---------- */
  const venueQuery = "Royal Regency Gardens, Asif Nagar, Hyderabad";
  const enc = encodeURIComponent;
  const WEDDING = {
    groom: {
      first: "Akhil", full: "Pilli Akhil",
      relation: "Elder son of", parents: ["Mr. Pilli Mareswara Rao", "Mrs. Arunasri"],
    },
    bride: {
      first: "Alekhya Sree", full: "Tappetla Alekhya Sree",
      relation: "Elder daughter of", parents: ["Mr. Tappetla Ganesh Kumar", "Mrs. Swarnalatha"],
    },
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
  const on = (evt, fn) => ((listeners[evt] ||= []).push(fn), () => off(evt, fn));
  const off = (evt, fn) => { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); };
  const emit = (evt, data) => (listeners[evt] || []).slice().forEach((fn) => {
    try { fn(data); } catch (e) { console.error(`[App] listener for "${evt}" failed`, e); }
  });

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
    unlock() {
      document.documentElement.classList.remove("is-locked");
      App.lenis && App.lenis.start();
      ScrollTrigger && ScrollTrigger.refresh();
    },

    scrollTo(target, opts = {}) {
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
    open() {
      if (App.state.opened) return;
      App.state.opened = true;
      App.unlock();
      document.documentElement.classList.add("is-open");
      emit("open");
    },

    async start() {
      if (gsap && !App.reduceMotion) document.documentElement.classList.add("js-anim");
      setupSmoothScroll();
      setupPointerTilt();
      setupResize();

      try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (_) {}

      for (const m of modules) {
        try { m.init(App); }
        catch (e) { console.error(`[App] module "${m.name}" failed to init`, e); }
      }

      setupReveals();

      const intro = document.getElementById("intro");
      if (App.skipIntro || !intro) {
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
        const chars = el.dataset.split === "chars";
        const split = new window.SplitText(el, {
          type: chars ? "lines,words,chars" : "lines,words",
          linesClass: "split-line", wordsClass: "split-word", charsClass: "split-char",
        });
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
