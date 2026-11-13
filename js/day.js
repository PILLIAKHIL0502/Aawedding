/* ==========================================================
   day.js — "The Day": a pinned horizontal story in four panels.
     01 Sunday   giant outlined word that fills with gold
     02 Date     November 2026 calendar, the 29th circled by hand
     03 Time     analog clock whose hands sweep from 12:00 to 9:05
     04 Venue    line-art garden gate that draws itself + a bouncing map pin
   Vertical scroll drives the track sideways (pin + scrub). Reduced motion
   (or no GSAP) keeps the static, stacked layout from day.css.
   ========================================================== */
(function () {
  "use strict";
  const App = window.App;
  if (!App) return;

  App.module("day", (App) => {
    const root = document.getElementById("day");
    if (!root) return;

    const gsap = App.gsap;
    const ST = App.ScrollTrigger;
    const q = (s, r = root) => r.querySelector(s);
    const qa = (s, r = root) => Array.from(r.querySelectorAll(s));

    const track = q(".day__track");
    const panels = qa(".day__panel");
    const N = panels.length;
    const [pSun, pCal, pClock, pVenue] = panels;

    /* ---------- directions link (static href in HTML as a fallback) ---------- */
    const dir = q(".day__directions");
    const venue = App.WEDDING && App.WEDDING.venue;
    if (dir && venue && venue.directionsUrl) dir.href = venue.directionsUrl;

    /* ---------- clock: hands are driven from one time value (minutes after 12:00) ---------- */
    const TARGET = 9 * 60 + 5;
    const hands = { h: q(".day__hand--h"), m: q(".day__hand--m"), s: q(".day__hand--s") };
    const clock = { t: TARGET, spin: 0, sec: 0 };
    const rot = (el, a) => el && el.setAttribute("transform", `rotate(${a.toFixed(2)} 200 200)`);
    function renderClock() {
      const t = clock.t + clock.spin;
      rot(hands.h, (t / 720) * 360);
      rot(hands.m, t * 6);
      rot(hands.s, clock.sec);
    }
    renderClock();

    const motion = !!(gsap && ST) && !App.reduceMotion;

    /* ---------- the pinned story's moving parts (set inside the media context) ---------- */
    let main = null;      // the pinning ScrollTrigger
    let pinTL = null;     // pin drop timeline
    let secT = null;      // the clock's ticking second hand (infinite)
    let ping = null;      // the map pin's ping ring (infinite)
    let pinPing = null;

    /* section visibility: tilt, timers and infinite CSS animations only run while it's on screen.
       (The venue panel stays "on" after the pin ends, so this is what stops its loops further down.) */
    let inView = false;
    function setInView(v) {
      inView = v;
      root.classList.toggle("is-inview", v);
      syncLoops();
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => setInView(es[es.length - 1].isIntersecting), { threshold: 0 }).observe(root);
    } else {
      setInView(true);
    }
    // the infinite GSAP loops follow the same rule as the CSS ones
    function syncLoops() {
      if (secT) {
        if (inView && pClock.classList.contains("is-on")) secT.play(); else secT.pause();
      }
      if (ping) {
        const live = inView && pVenue.classList.contains("is-on") && pinTL && pinTL.time() >= 0.75;
        if (live) { if (ping.paused()) ping.restart(); }
        else if (!ping.paused()) { ping.pause(); gsap.set(pinPing, { opacity: 0 }); }
      }
    }

    /* ---------- interactions that work in every mode ---------- */
    setupDateTap();
    setupClockTap();
    setupPinTap();
    if (motion) setupTilt();

    if (!motion) return;   // static, stacked, fully readable layout

    /* ---------- the pinned horizontal story ---------- */
    // scroll the page so panel i rests in view (2px inside the pin so the pill stays up)
    function goToPanel(i, duration = 1.2) {
      if (!main) return;
      const y = main.start + (main.end - main.start) * (i / (N - 1));
      App.scrollTo(Math.min(main.end - 2, Math.max(main.start + 2, y)), { duration });
    }
    const panelAt = (y) => Math.round(Math.min(1, Math.max(0, (y - main.start) / (main.end - main.start || 1))) * (N - 1));

    /* ---------- progress pill: 01 / 04, a bar and jump dots ---------- */
    const countCur = q(".day__count-cur");
    const barFill = q(".day__bar-fill");
    const dots = qa(".day__dot");
    const labels = qa(".day__plabels > span");
    let cur = 0;
    function progressUI(p) {
      if (barFill) gsap.set(barFill, { scaleX: p });
      const i = Math.min(N - 1, Math.max(0, Math.round(p * (N - 1))));
      if (i === cur) return;
      const prev = cur;
      cur = i;
      if (countCur) {
        countCur.textContent = String(i + 1).padStart(2, "0");
        if (prev >= 0) gsap.fromTo(countCur, { yPercent: i > prev ? 100 : -100 }, { yPercent: 0, duration: 0.45, ease: "power3.out", overwrite: true });
      }
      dots.forEach((d, k) => {
        d.classList.toggle("is-active", k === i);
        d.classList.toggle("is-past", k < i);
        if (k === i) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current");
      });
      labels.forEach((l, k) => l.classList.toggle("is-active", k === i));
    }
    // a tap goes to the dot nearest the finger (the 44px targets touch, and may overlap if spacing shrinks)
    dots.forEach((d) => d.addEventListener("click", (e) => {
      if (!main) return;
      let i = Number(d.dataset.i) || 0;
      if (e.detail > 0 && e.clientX) {
        let best = Infinity;
        dots.forEach((o, k) => {
          const r = o.getBoundingClientRect();
          const dist = Math.abs(r.left + r.width / 2 - e.clientX);
          if (dist < best) { best = dist; i = k; }
        });
      }
      App.haptic(8);
      goToPanel(i);
    }));
    dots[0] && dots[0].setAttribute("aria-current", "step");

    /* ---------- touch: a sideways swipe on the pinned track turns the page ----------
       Passive listeners only; day.css sets touch-action: pan-y on the pinned section, so a
       gesture that starts vertical still scrolls natively and only sideways ones reach us. */
    const SWIPE_MIN = 60;
    let swipeTo = -1, swipeUntil = 0;
    (function setupSwipe() {
      let x0 = 0, y0 = 0, axis = null, live = false;
      const near = () => {
        if (!main) return false;
        const y = window.scrollY, slack = window.innerHeight * 0.25;
        return y >= main.start - slack && y <= main.end + slack;
      };
      root.addEventListener("touchstart", (e) => {
        live = e.touches.length === 1 && near();
        if (!live) return;
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; axis = null;
      }, { passive: true });
      root.addEventListener("touchmove", (e) => {
        if (!live || axis || e.touches.length !== 1) { if (e.touches.length !== 1) live = false; return; }
        const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }, { passive: true });
      root.addEventListener("touchend", (e) => {
        if (!live) return;
        live = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - x0, dy = t.clientY - y0;
        if (axis !== "x" || Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        const now = performance.now();
        const from = now < swipeUntil && swipeTo >= 0 ? swipeTo : panelAt(window.scrollY);
        const to = Math.min(N - 1, Math.max(0, from + (dx < 0 ? 1 : -1)));
        if (to === from) return;
        swipeTo = to; swipeUntil = now + 900;
        App.haptic(8);
        // next frame: Lenis' own touchend handler (on window, after ours) stops any running scroll
        requestAnimationFrame(() => goToPanel(to, 0.9));
      }, { passive: true });
      root.addEventListener("touchcancel", () => { live = false; }, { passive: true });
    })();

    /* ---------- keyboard: focus in an off-screen panel brings that panel into view ---------- */
    root.addEventListener("focusin", (e) => {
      if (!main) return;
      const el = e.target;
      const panel = el.closest && el.closest(".day__panel");
      let i;
      if (panel) {
        i = panels.indexOf(panel);
        const left = panel.getBoundingClientRect().left;
        const shown = main.isActive && Math.abs(left) < 4;
        // a tap on something already on screen focuses it too: leave those alone
        const tapped = !el.matches(":focus-visible") && main.isActive && Math.abs(left) < root.clientWidth * 0.5;
        if (shown || tapped) return;
      } else if (el.closest && el.closest(".day__progress")) {
        if (main.isActive) return;        // the pill is up: focusing a dot doesn't move anything
        i = Number(el.dataset.i) || 0;    // reached from outside (e.g. Shift+Tab): show the pill
      } else return;
      if (i < 0) return;
      requestAnimationFrame(() => goToPanel(i, 1));
    });

    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      root.classList.add("day--h");
      const W = () => root.clientWidth;
      let panelW = W();
      const dist = () => Math.max(0, track.scrollWidth - root.clientWidth);

      /* gold hairlines between chapters: each fades out as its boundary nears a screen edge */
      const dividers = panels.slice(1).map((p, k) => {
        const d = document.createElement("span");
        d.className = "day__divider";
        d.setAttribute("aria-hidden", "true");
        d.style.left = (k + 1) * 100 + "%";
        track.appendChild(d);
        return d;
      });
      function dividerUI() {
        const x = gsap.getProperty(track, "x") || 0;
        const fade = Math.max(1, panelW * 0.12);
        dividers.forEach((d, k) => {
          const pos = (k + 1) * panelW + x;
          const o = Math.round(Math.min(1, Math.max(0, (Math.min(pos, panelW - pos) - 6) / fade)) * 100) / 100;
          if (d._o !== o) { d._o = o; d.style.opacity = o; }
        });
      }

      const htween = gsap.to(track, {
        x: () => -dist(),
        ease: "none",
        onUpdate() { progressUI(this.progress()); dividerUI(); },
        scrollTrigger: {
          trigger: root,
          pin: true,
          start: "top top",
          end: () => "+=" + dist(),
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onToggle: (self) => root.classList.toggle("is-pinned", self.isActive),
        },
      });
      main = htween.scrollTrigger;
      // a refresh (resize, language switch) can restore the track silently: resync the pill
      const resync = () => { panelW = W(); cur = -1; progressUI(htween.progress()); dividerUI(); };
      ST.addEventListener("refresh", resync);
      const inPanel = (panel, vars) => ({ trigger: panel, containerAnimation: htween, ...vars });

      /* panels know when they're on screen (hint nudge, twinkling lights, ticking seconds, ping).
         Sunday counts as "on" until it has slid away, including while the section rises into view. */
      secT = gsap.to(clock, { sec: "+=360", duration: 60, ease: "none", repeat: -1, paused: true, onUpdate: renderClock });
      pSun.classList.add("is-on");
      panels.forEach((p, i) => {
        ST.create(inPanel(p, {
          // a panel resting exactly on a screen edge (its neighbour is the one in view) is off
          start: "left right-=2", end: "right left+=2",
          onToggle: (self) => {
            p.classList.toggle("is-on", i === 0 ? self.progress < 1 : self.isActive);
            syncLoops();
          },
        }));
      });

      /* ===== 01 · Sunday: the outline fills with gold as the section rises into view ===== */
      const fillTL = gsap.timeline({
        scrollTrigger: { trigger: root, start: "top 55%", end: "top top", scrub: true },
      });
      fillTL
        .fromTo(q(".day__word-mask", pSun), { yPercent: 100 }, { yPercent: 0, ease: "none", duration: 1 }, 0)
        .fromTo(q(".day__word-fill", pSun), { yPercent: -100 }, { yPercent: 0, ease: "none", duration: 1 }, 0)
        .from(qa(".day__reveal", pSun), { y: 26, opacity: 0, stagger: 0.12, duration: 0.5, ease: "power2.out" }, 0.25)
        .from(q(".day__sunmark", pSun), { y: 40, opacity: 0, scale: 0.6, duration: 0.6, ease: "power2.out" }, 0.1)
        .fromTo(q(".day__sunmark-rays", pSun), { rotation: -120, svgOrigin: "32 32" }, { rotation: 0, svgOrigin: "32 32", ease: "none", duration: 1 }, 0);

      // leaving: the word lingers behind (parallax) and the hint fades
      gsap.timeline({ scrollTrigger: inPanel(pSun, { start: "left left", end: "right left", scrub: true, invalidateOnRefresh: true }) })
        .to(q(".day__sunday", pSun), { x: () => W() * 0.32, opacity: 0.2, ease: "none", duration: 1 }, 0)
        .to(q(".day__hint", pSun), { opacity: 0, duration: 0.2, ease: "none" }, 0)
        .to(q(".day__sunmark-rays", pSun), { rotation: 90, svgOrigin: "32 32", ease: "none", duration: 1 }, 0)
        .to(q(".day__branch--a", pSun), { x: () => W() * 0.1, rotation: -14, ease: "none", duration: 1 }, 0)
        .to(q(".day__branch--b", pSun), { x: () => W() * 0.42, rotation: 186, ease: "none", duration: 1 }, 0);

      /* ===== 02 · the calendar card ===== */
      const ring = q(".day__ring path", pCal);
      const ringLen = dash(ring, 4);
      gsap.timeline({ scrollTrigger: inPanel(pCal, { start: "left 92%", end: "left 6%", scrub: true }) })
        .from(q(".day__cal-card", pCal), { y: 90, rotation: -7, scale: 0.9, opacity: 0, duration: 0.42, ease: "power2.out" }, 0)
        .from(qa(".day__cal-head > *, .day__cal-dow", pCal), { y: 14, opacity: 0, stagger: 0.05, duration: 0.2 }, 0.16)
        .from(qa(".day__cal-days li", pCal), { y: 12, opacity: 0, scale: 0.6, stagger: 0.011, duration: 0.18, ease: "back.out(2)" }, 0.26)
        .from(q(".day__cal-foot", pCal), { opacity: 0, duration: 0.15 }, 0.55)
        .fromTo(ring, { strokeDashoffset: ringLen }, { strokeDashoffset: 0, duration: 0.3, ease: "power1.inOut" }, 0.62)
        .from(q(".day__heart", pCal), { scale: 0, rotation: -40, opacity: 0, transformOrigin: "50% 60%", duration: 0.1, ease: "back.out(3)" }, 0.9)
        .from(qa(".day__reveal", pCal), { y: 30, opacity: 0, stagger: 0.06, duration: 0.3, ease: "power2.out" }, 0.1);

      /* ===== 03 · the clock sweeps from 12:00 to 9:05 ===== */
      gsap.timeline({ scrollTrigger: inPanel(pClock, { start: "left 96%", end: "left 4%", scrub: true }) })
        .from(q(".day__clock", pClock), { scale: 0.82, rotation: -24, opacity: 0, duration: 0.3, ease: "power2.out" }, 0)
        .from(q(".day__clock-dial", pClock), { rotation: -90, opacity: 0, svgOrigin: "200 200", duration: 0.35, ease: "power2.out" }, 0.05)
        .fromTo(clock, { t: 0 }, { t: TARGET, duration: 0.72, ease: "power2.inOut", onUpdate: renderClock }, 0.24)
        .from(qa(".day__reveal", pClock), { y: 30, opacity: 0, stagger: 0.07, duration: 0.3, ease: "power2.out" }, 0.3);
      renderClock();

      /* ===== 04 · the garden gate draws itself, then the pin drops ===== */
      const draws = qa("[data-draw]", pVenue);
      draws.forEach((p) => dash(p, 3));
      gsap.timeline({ scrollTrigger: inPanel(pVenue, { start: "left 96%", end: "left 4%", scrub: true }) })
        .from(q(".day__sun", pVenue), { scale: 0.3, opacity: 0, transformOrigin: "50% 50%", duration: 0.4 }, 0)
        .to(draws, { strokeDashoffset: 0, duration: 0.36, stagger: 0.02, ease: "power1.inOut" }, 0.02)
        .from(qa(".day__leaves use", pVenue), { scale: 0, transformOrigin: "0% 50%", stagger: 0.016, duration: 0.14, ease: "back.out(2.4)" }, 0.5)
        .from(qa(".day__blooms circle", pVenue), { scale: 0, transformOrigin: "50% 50%", stagger: 0.02, duration: 0.12, ease: "back.out(3)" }, 0.6)
        .from(q(".day__lights", pVenue), { opacity: 0, duration: 0.15 }, 0.62)
        .from(qa(".day__reveal", pVenue), { y: 30, opacity: 0, stagger: 0.07, duration: 0.3, ease: "power2.out" }, 0.34);

      const pinDrop = q(".day__pin-drop", pVenue);
      const pinShadow = q(".day__pin-shadow", pVenue);
      pinPing = q(".day__pin-ping", pVenue);
      gsap.set(pinDrop, { y: -170, opacity: 0 });
      gsap.set(pinShadow, { scale: 0, opacity: 0, transformOrigin: "50% 50%" });
      ping = gsap.fromTo(pinPing, { scale: 0.4, opacity: 0.85, transformOrigin: "50% 50%" },
        { scale: 3.2, opacity: 0, duration: 1.7, ease: "power2.out", repeat: -1, repeatDelay: 0.5, paused: true, immediateRender: false });
      pinTL = gsap.timeline({ paused: true })
        .to(pinDrop, { opacity: 1, duration: 0.15 }, 0)
        .to(pinDrop, { y: 0, duration: 1.1, ease: "bounce.out" }, 0)
        .to(pinShadow, { scale: 1, opacity: 0.22, duration: 1.1, ease: "bounce.out" }, 0)
        .add(syncLoops, 0.75);
      ST.create(inPanel(pVenue, {
        start: "left 40%",
        onEnter: () => pinTL.restart(),
        onLeaveBack: () => { pinTL.pause(0); syncLoops(); },
      }));

      return () => {
        root.classList.remove("day--h", "is-pinned");
        panels.forEach((p) => p.classList.remove("is-on"));
        dividers.forEach((d) => d.remove());
        clock.t = TARGET; clock.sec = 0; clock.spin = 0;
        renderClock();
        ST.removeEventListener("refresh", resync);
        main = null; pinTL = null; secT = null; ping = null;
      };
    });

    /* ---------- helpers ---------- */
    // prime an SVG path for a stroke "draw"; returns the hidden offset
    function dash(path, pad) {
      if (!path || !path.getTotalLength) return 0;
      let len = 0;
      try { len = path.getTotalLength(); } catch (_) {}
      const off = len + pad;
      gsap.set(path, { strokeDasharray: `${len} ${len + pad * 2}`, strokeDashoffset: off });
      return off;
    }
    function setupTilt() {
      const items = [
        [q(".day__cal-card"), 9],
        [q(".day__clock"), 7],
        [q(".day__word"), 6],
      ].filter(([el]) => el).map(([el, deg]) => ({
        deg,
        rx: gsap.quickTo(el, "rotationX", { duration: 0.9, ease: "power3" }),
        ry: gsap.quickTo(el, "rotationY", { duration: 0.9, ease: "power3" }),
      }));
      App.on("tilt", (t) => {
        if (!inView || !t) return;
        items.forEach((s) => { s.ry(t.x * s.deg); s.rx(-t.y * s.deg); });
      });
    }

    /* tap the 29th: hearts, a toast and a buzz */
    function setupDateTap() {
      const btn = q(".day__d29");
      const card = q(".day__cal-card");
      if (!btn || !card) return;
      const heartSVG = q(".day__heart").outerHTML.replace('class="day__heart"', "");
      btn.addEventListener("click", () => {
        App.haptic([10, 40, 14]);
        App.toast(App.t("It's a date!", "తేదీ ఖరారు!"));
        if (!gsap || App.reduceMotion) return;
        gsap.fromTo(q(".day__d29-num"), { scale: 1.5 }, { scale: 1, duration: 0.7, ease: "elastic.out(1, .45)", overwrite: true });
        const cr = card.getBoundingClientRect();
        const br = btn.getBoundingClientRect();
        const cx = br.left + br.width / 2 - cr.left;
        const cy = br.top + br.height / 2 - cr.top;
        for (let k = 0; k < 9; k++) {
          const s = document.createElement("span");
          s.className = "day__spark";
          s.innerHTML = heartSVG;
          s.style.left = cx + "px";
          s.style.top = cy + "px";
          card.appendChild(s);
          const a = (-90 + (k - 4) * 19 + gsap.utils.random(-8, 8)) * (Math.PI / 180);
          const r = gsap.utils.random(50, 110);
          gsap.fromTo(s, { x: 0, y: 0, scale: 0.2, opacity: 1, rotation: gsap.utils.random(-30, 30) }, {
            x: Math.cos(a) * r, y: Math.sin(a) * r - 20, scale: gsap.utils.random(0.7, 1.25),
            rotation: gsap.utils.random(-40, 40), opacity: 0,
            duration: gsap.utils.random(1, 1.5), ease: "power2.out",
            onComplete: () => s.remove(),
          });
        }
      });
    }

    /* tap the clock: the hands whirl once around the dial and settle back on 9:05 */
    function setupClockTap() {
      const c = q(".day__clock");
      if (!c) return;
      let busy = false;
      c.addEventListener("click", () => {
        App.haptic(10);
        if (!gsap || App.reduceMotion || busy) return;
        busy = true;
        gsap.fromTo(clock, { spin: 0 }, {
          spin: 720, duration: 2, ease: "power3.inOut", onUpdate: renderClock,
          onComplete: () => { clock.spin = 0; renderClock(); busy = false; },
        });
      });
    }

    /* tap the map pin: it hops and lands again */
    function setupPinTap() {
      const pin = q(".day__pin");
      if (!pin) return;
      pin.addEventListener("click", () => {
        App.haptic(12);
        if (!gsap || App.reduceMotion) return;
        const drop = q(".day__pin-drop");
        if (pinTL && pinTL.isActive()) return;
        gsap.timeline()
          .to(drop, { y: -46, duration: 0.32, ease: "power2.out" })
          .to(drop, { y: 0, duration: 0.9, ease: "bounce.out" });
      });
    }
  });
})();
