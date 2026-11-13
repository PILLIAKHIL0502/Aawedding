/* ==========================================================
   intro.js — "The Rolled Scroll"

   sealed ──tap seal / tap scroll──▶ opening ──▶ unrolled ──Enter / swipe / wheel──▶ leaving ──▶ done
      │                                 ▲
      └──pull the scroll down──▶ pulling ┤ (released past 40%: finishes)
                                    └──▶ broken (released early: springs back closed; tap or pull again)

   The first tap/press is the user gesture that starts the music and asks for
   motion permission (both need to run synchronously inside that gesture on iOS).
   App.open() is called exactly once, while the curtain lifts.
   ========================================================== */
(function () {
  const App = window.App;
  if (!App) return;

  App.module("intro", (App) => {
    const root = document.getElementById("intro");
    if (!root || App.skipIntro) return;   // core removes the overlay and opens the page

    const gsap = App.gsap;
    const reduce = App.reduceMotion;
    const q = (s) => root.querySelector(s);
    const qa = (s) => Array.from(root.querySelectorAll(s));

    const el = {
      curtain: q(".intro__curtain"),
      dust: q(".intro__dust"),
      halo: q(".intro__halo"),
      labels: qa(".intro__label"),
      head: q(".intro__head"),
      dear: q(".intro__dear"),
      hint: q(".intro__hint"),
      tap: q(".intro__tap"),
      retry: q(".intro__retry"),
      scroll: q(".intro__scroll"),
      zoom: q(".intro__zoom"),
      tilt: q(".intro__tilt"),
      float: q(".intro__float"),
      shadow: q(".intro__sheet-shadow"),
      mask: q(".intro__mask"),
      content: q(".intro__content"),
      stack: q(".intro__stack"),
      names: q(".intro__names"),
      glint: q(".intro__glint"),
      trackTop: q(".intro__track--top"),
      trackBottom: q(".intro__track--bottom"),
      rollers: qa(".intro__track .intro__roll"),
      fibersTop: q(".intro__roll--top .intro__fibers"),
      fibersBottom: q(".intro__roll--bottom .intro__fibers"),
      bottomRoll: q(".intro__roll--bottom"),
      bundle: q(".intro__roll--bundle"),
      band: q(".intro__band"),
      bow: q(".intro__bow"),
      loops: qa(".intro__loop"),
      tails: qa(".intro__tail"),
      seal: q(".intro__seal"),
      sealMag: q(".intro__seal-mag"),
      sealGlow: q(".intro__seal-glow"),
      sealRing: q(".intro__seal-ring"),
      sealRipple: q(".intro__seal-ripple"),
      halfL: q(".intro__seal-half--l"),
      halfR: q(".intro__seal-half--r"),
      crack: q(".intro__crack path"),
      flash: q(".intro__flash"),
      shards: qa(".intro__shards i"),
      enter: q(".intro__enter"),
    };
    if (!el.seal || !el.enter || !el.scroll) return;

    /* ---------------- state ---------------- */
    let state = "sealed";
    let drag = null, floatTw = null;
    let offTilt = () => {}, offLang = () => {}, offResize = () => {};
    const setState = (s) => { state = s; root.dataset.state = s; };
    const closed = () => state === "sealed" || state === "broken";
    setState("sealed");

    /* ---------------- guest greeting (textContent only) ---------------- */
    function renderDear() {
      const g = App.guest;
      if (!g || !el.dear) return;
      // Built from text nodes (never innerHTML). The name stays together with its suffix when it's short.
      const [pre, post] = App.t({ en: ["Dear ", ","], te: ["ప్రియమైన ", " గారికి,"] });
      const keep = document.createElement("span");
      if (g.length <= 18) keep.className = "intro__keep";
      keep.textContent = g + post;
      el.dear.replaceChildren(document.createTextNode(pre), keep);
      el.dear.classList.toggle("is-long", g.length > 14);
      el.dear.hidden = false;
    }
    renderDear();

    /* ---------------- fit the parchment text to the sheet ----------------
       CSS sizes the type from the sheet (container units); this is the safety net that
       scales the whole stack down if a long line (often Telugu) would still overflow. */
    function fit() {
      const box = el.content, s = el.stack;
      if (!box || !s) return;
      const bw = box.clientWidth, bh = box.clientHeight;
      if (!bw || !bh) return;
      s.style.setProperty("--fit", "1");
      let w = el.names ? el.names.scrollWidth : 0;
      qa(".intro__stack .intro__line").forEach((n) => { w = Math.max(w, n.offsetWidth, n.scrollWidth); });
      const k = Math.min(1, bh / s.offsetHeight, bw / Math.max(1, w));
      if (k < 0.995) s.style.setProperty("--fit", (k * 0.98).toFixed(3));
    }
    fit();

    /* ---------------- a11y: the page behind the dialog is inert until it opens ---------------- */
    const inerted = [];
    (function setInert() {
      const parent = root.parentElement;
      if (!parent) return;
      Array.from(parent.children).forEach((c) => {
        if (c === root || c.inert || c.tagName === "SCRIPT") return;
        c.inert = true;
        inerted.push(c);
      });
    })();
    const releaseInert = () => { inerted.splice(0).forEach((c) => { c.inert = false; }); };
    try { root.focus({ preventScroll: true }); } catch (_) {}

    /* ---------------- the user gesture: music, motion permission, haptic ---------------- */
    let gestured = false;
    function gesture() {
      // Runs synchronously inside the tap/press handler, which iOS needs for audio and motion.
      if (!gestured || !App.music.playing) {
        try { App.music.start(); } catch (e) { console.warn("[intro] music.start failed", e); }
      }
      if (!gestured || !App.state.motionGranted) {
        try { App.requestMotionPermission(); } catch (_) {}
      }
      if (!gestured) App.haptic(20);
      gestured = true;
    }

    /* ---------------- open once, leave once ---------------- */
    let opened = false;
    function callOpen() {
      if (opened) return;
      opened = true;
      releaseInert();
      if (window.scrollY > 0) { try { window.scrollTo(0, 0); } catch (_) {} }
      App.open();
    }

    const dust = makeDust();

    /* ======================================================================
       No GSAP: a CSS-only path driven by data-state (see .is-simple in intro.css)
       ====================================================================== */
    if (!gsap) {
      root.classList.add("is-simple");
      el.seal.addEventListener("click", () => {
        if (!closed()) return;
        gesture();
        setState("unrolled");
        App.emit("intro:unrolled");
        el.enter.focus({ preventScroll: true });
      });
      el.enter.addEventListener("click", () => {
        if (state !== "unrolled") return;
        setState("leaving");
        callOpen();
        setTimeout(finish, 420);
      });
      return;
    }

    /* ======================================================================
       The unroll timeline (paused). Rollers and mask are linear so a drag maps
       1:1 onto the bottom roller; the auto-play eases the whole timeline.
       ====================================================================== */
    const ROLL = 1.25;   // nominal seconds for the rollers to reach the sheet edges
    const lineIn = { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" };
    const rise = (d = 12) => ({ opacity: 0, y: d });
    const wipeFrom = { opacity: 0, clipPath: "inset(-40% 100% -40% -12%)" };
    const wipeTo = { opacity: 1, clipPath: "inset(-40% -12% -40% -12%)", duration: 0.75, ease: "power2.inOut" };
    const L = {
      crest: q(".intro__crest"),
      crestRing: q(".intro__crest-ring"),
      orn: q(".intro__orn"),
      ornPaths: qa(".intro__orn path[pathLength]"),
      together: q(".intro__together"),
      nameA: q(".intro__name--a"),
      amp: q(".intro__amp"),
      nameB: q(".intro__name--b"),
      invite: q(".intro__invite"),
      divider: q(".intro__divider"),
      dividerPaths: qa(".intro__divider path[pathLength]"),
      date: q(".intro__date"),
      venue: q(".intro__venue"),
    };

    gsap.set(el.mask, { visibility: "visible" });
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(el.bundle, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.14, ease: "none" }, 0)
      .fromTo(el.rollers, { opacity: 0 }, { opacity: 1, duration: 0.1, ease: "none" }, 0)
      .fromTo(el.trackTop, { yPercent: 0 }, { yPercent: -100, duration: ROLL, ease: "none" }, 0)
      .fromTo(el.trackBottom, { yPercent: 0 }, { yPercent: 100, duration: ROLL, ease: "none" }, 0)
      .fromTo(el.mask, { clipPath: "inset(50% 0% 50% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: ROLL, ease: "none" }, 0)
      .fromTo(el.shadow, { scaleY: 0 }, { scaleY: 1, duration: ROLL, ease: "none" }, 0)
      .fromTo(el.fibersTop, { y: 0 }, { y: -33, duration: ROLL, ease: "none" }, 0)
      .fromTo(el.fibersBottom, { y: 0 }, { y: 33, duration: ROLL, ease: "none" }, 0)
      // The words surface line by line, centre-out, as the paper uncovers them:
      // the names first, then the lines above and below, then the edges.
      .fromTo(L.nameA, wipeFrom, wipeTo, 0.16)
      .fromTo(L.amp, { opacity: 0, scale: 0.3, rotation: -25 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.55, ease: "back.out(2.2)" }, 0.36)
      .fromTo(L.nameB, wipeFrom, { ...wipeTo, duration: 0.85 }, 0.38)
      .fromTo(L.together, rise(), lineIn, 0.5)
      .fromTo(L.invite, rise(-12), lineIn, 0.58)
      .fromTo(L.orn, rise(8), { ...lineIn, duration: 0.5 }, 0.7)
      .fromTo(L.ornPaths, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" }, 0.7)
      .fromTo(L.divider, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "none" }, 0.76)
      .fromTo(L.dividerPaths, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut" }, 0.76)
      .fromTo(L.crest, { opacity: 0, scale: 0.6, rotation: -30 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.7, ease: "back.out(1.8)" }, 0.84)
      .fromTo(L.crestRing, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" }, 0.84)
      .fromTo(L.date, rise(-12), lineIn, 0.9)
      .fromTo(L.venue, rise(-12), lineIn, 1.0)
      .fromTo(el.glint, { x: 0, xPercent: -130 }, { x: 0, xPercent: 230, duration: 1.1, ease: "power1.inOut" }, 0.85)
      // the last line has landed: offer the button while the foil glint finishes its sweep
      // (a hand pull only reaches ROLL, so this fires only once the scroll is finishing on its own)
      .call(() => unrolled(), null, 1.5);
    const D = tl.duration();

    /* ---------------- idle motion (float, tilt, magnetic seal) ---------------- */
    if (!reduce) {
      floatTw = gsap.to(el.float, { y: -7, rotation: 0.5, duration: 2.8, ease: "sine.inOut", yoyo: true, repeat: -1 });
    }
    function settleFloat() {
      if (!floatTw) return;
      floatTw.kill();
      floatTw = null;
      gsap.to(el.float, { y: 0, rotation: 0, duration: 0.5, ease: "power2.out" });
    }

    if (!reduce && el.tilt) {
      const rx = gsap.quickTo(el.tilt, "rotationX", { duration: 0.9, ease: "power3" });
      const ry = gsap.quickTo(el.tilt, "rotationY", { duration: 0.9, ease: "power3" });
      offTilt = App.on("tilt", (t) => {
        if (state === "pulling" || state === "leaving" || state === "done") return;
        rx(t.y * -5);
        ry(t.x * 7);
      });
    }

    if (!reduce && App.finePointer) {
      const mx = gsap.quickTo(el.sealMag, "x", { duration: 0.5, ease: "power3" });
      const my = gsap.quickTo(el.sealMag, "y", { duration: 0.5, ease: "power3" });
      root.addEventListener("pointermove", (e) => {
        if (state !== "sealed") return;
        const r = el.seal.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const near = Math.hypot(dx, dy) < r.width * 1.5;
        mx(near ? dx * 0.22 : 0);
        my(near ? dy * 0.22 : 0);
      }, { passive: true });
    }

    /* ---------------- engaging: stop the CSS entrance animations, fade the copy ---------------- */
    function hideCopy() {
      root.classList.add("is-engaged");
      gsap.to([el.head, el.hint], { autoAlpha: 0, y: -10, duration: 0.35, ease: "power2.in", overwrite: "auto" });
      if (sealBroken) gsap.to([el.sealGlow, el.sealRing], { autoAlpha: 0, duration: 0.25, overwrite: "auto" });
    }
    function showRetry() {
      if (el.tap) el.tap.hidden = true;
      if (el.retry) el.retry.hidden = false;
      gsap.to([el.head, el.hint], { autoAlpha: 1, y: 0, duration: 0.5, ease: "power2.out", overwrite: "auto" });
      gsap.to([el.sealGlow, el.sealRing], { autoAlpha: 0.75, duration: 0.6, overwrite: "auto" });
    }

    /* ---------------- the seal cracks, its halves fly apart, the ribbon unties ---------------- */
    let sealBroken = false;
    function breakSeal(fast) {
      if (sealBroken) return;
      sealBroken = true;
      root.classList.add("is-engaged");
      const s = el.seal.offsetWidth || 90;
      const t = gsap.timeline({ defaults: { ease: "power2.out" } });
      t.to(el.sealMag, { scale: 0.88, x: 0, y: 0, rotation: 0, duration: 0.12, ease: "power2.in" })
        .to(el.crack, { strokeDashoffset: 0, duration: 0.16, ease: "none" }, 0.05)
        .to(el.sealMag, { scale: 1.06, duration: 0.22, ease: "back.out(3)" }, 0.17)
        .fromTo(el.flash, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1.1, duration: 0.12 }, 0.17)
        .to(el.flash, { opacity: 0, scale: 1.7, duration: 0.5 }, 0.29)
        .to([el.sealGlow, el.sealRing, el.sealRipple], { autoAlpha: 0, duration: 0.3, overwrite: "auto" }, 0.12)
        .addLabel("split", 0.2)
        .to(el.crack, { opacity: 0, duration: 0.1 }, "split")
        .to(el.halfL, { x: -s * 0.8, rotation: -38, duration: 0.75, ease: "power3.out" }, "split")
        .to(el.halfL, { y: s * 0.95, duration: 0.75, ease: "power2.in" }, "split")
        .to(el.halfR, { x: s * 0.8, rotation: 34, duration: 0.75, ease: "power3.out" }, "split")
        .to(el.halfR, { y: s * 0.85, duration: 0.75, ease: "power2.in" }, "split")
        .to([el.halfL, el.halfR], { opacity: 0, duration: 0.3, ease: "power1.in" }, "split+=0.42");
      el.shards.forEach((sh, i) => {
        const a = (i / el.shards.length) * Math.PI * 2 + gsap.utils.random(-0.35, 0.35);
        const d = s * gsap.utils.random(0.55, 1.1);
        t.fromTo(sh, { x: 0, y: 0, opacity: 1, rotation: 0, scale: 1 }, {
          x: Math.cos(a) * d, y: Math.sin(a) * d + s * 0.3, rotation: gsap.utils.random(-220, 220),
          opacity: 0, scale: 0.6, duration: gsap.utils.random(0.55, 0.85), ease: "power3.out",
        }, "split");
      });
      // ribbon: the loops slip through the knot, the band and tails fall away
      t.to(el.loops[0], { scale: 0.15, rotation: -50, opacity: 0, svgOrigin: "100 100", duration: 0.45, ease: "power2.in" }, "split-=0.05")
        .to(el.loops[1], { scale: 0.15, rotation: 50, opacity: 0, svgOrigin: "100 100", duration: 0.45, ease: "power2.in" }, "split-=0.05")
        .to(el.tails[0], { y: 70, rotation: -28, opacity: 0, svgOrigin: "100 104", duration: 0.7, ease: "power2.in" }, "split+=0.1")
        .to(el.tails[1], { y: 80, rotation: 24, opacity: 0, svgOrigin: "100 104", duration: 0.7, ease: "power2.in" }, "split+=0.14")
        .to(el.band, { y: () => (el.band.offsetHeight || 60) * 0.9, scaleY: 0.4, opacity: 0, duration: 0.5, ease: "power2.in" }, "split+=0.1");
      if (fast) t.timeScale(1.5);
      const r = el.seal.getBoundingClientRect();
      dust.burst(r.left + r.width / 2, r.top + r.height / 2);
      gsap.delayedCall(fast ? 0.12 : 0.17, () => App.haptic(14));   // the crack
    }

    /* ---------------- tap: play the whole thing ---------------- */
    function open() {
      if (!closed()) return;
      const wasSealed = state === "sealed";
      setState("opening");
      el.seal.tabIndex = -1;
      if (drag) drag.disable();
      settleFloat();
      if (reduce) return openReduced();
      hideCopy();
      if (wasSealed) breakSeal(false);
      gsap.killTweensOf(tl);
      gsap.to(tl, {
        time: D, duration: Math.max(0.8, (D - tl.time()) * 1.1), ease: "power1.inOut",
        delay: wasSealed ? 0.3 : 0.05, onComplete: unrolled,
      });
    }

    function openReduced() {
      // Short, simple fades: no seal physics and no unrolling motion.
      const parts = [el.mask, el.shadow, el.trackTop, el.trackBottom];
      gsap.timeline({ onComplete: unrolled })
        .to([el.bundle, el.band, el.bow, el.seal, el.head, el.hint], { autoAlpha: 0, duration: 0.25 }, 0)
        .call(() => {
          gsap.set(parts, { opacity: 0 });
          tl.progress(1, true);
          gsap.set(el.glint, { opacity: 0 });
        }, null, 0.25)
        .to(parts, { opacity: 1, duration: 0.4 }, 0.26);
    }

    /* ---------------- drag: pull the scroll open by hand ---------------- */
    const Draggable = window.Draggable;
    if (Draggable && !reduce) {
      const proxy = document.createElement("div");
      proxy.className = "intro__proxy";
      proxy.setAttribute("aria-hidden", "true");
      proxy.style.cssText = "position:absolute;left:0;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none";
      root.appendChild(proxy);
      let dist = 200;
      drag = Draggable.create(proxy, {
        type: "y",
        trigger: [el.bundle, el.bottomRoll],
        minimumMovement: 4,
        zIndexBoost: false,
        onPress() {
          if (!closed()) return;
          gesture();   // the first press is the user gesture
          gsap.killTweensOf(tl);
          dist = Math.max(80, el.scroll.offsetHeight / 2);
          this.applyBounds({ minY: 0, maxY: dist });
          gsap.set(proxy, { y: App.clamp(tl.time() / ROLL, 0, 1) * dist });
          this.update();
        },
        onDragStart() {
          if (!closed()) return;
          if (state === "sealed") breakSeal(true);
          setState("pulling");
          el.seal.tabIndex = -1;
          settleFloat();
          hideCopy();
        },
        onDrag() {
          if (state !== "pulling") return;
          tl.time(App.clamp(this.y / dist, 0, 1) * ROLL);
        },
        onRelease() {
          if (state !== "pulling") return;   // a plain tap is handled by onClick
          if (!App.music.playing) gesture();   // pointerup counts as a gesture where pointerdown didn't
          const p = App.clamp(this.y / dist, 0, 1);
          if (p >= 0.4) {
            setState("opening");
            this.disable();
            gsap.to(tl, { time: D, duration: Math.max(0.6, (D - tl.time()) * 0.75), ease: "power2.out", onComplete: unrolled });
          } else {
            setState("broken");
            el.seal.tabIndex = 0;
            gsap.to(tl, { time: 0, duration: 0.55, ease: "power3.out", onComplete: showRetry });
          }
        },
        onClick() {
          if (!closed()) return;
          gesture();
          open();
        },
      })[0];
    }

    /* ---------------- fully unrolled ---------------- */
    function unrolled() {
      if (state === "unrolled" || state === "leaving" || state === "done") return;
      setState("unrolled");
      if (drag) drag.disable();
      // The mask is fully open: drop its clip so the exit zoom doesn't drag a clip/mask layer along.
      gsap.set(el.mask, { clipPath: "none" });
      gsap.delayedCall(0.8, retireClosed);
      App.emit("intro:unrolled");
      gsap.to(el.labels, { opacity: 0, duration: 0.4 });   // the hashtag would crowd the button
      gsap.set(el.enter, { visibility: "visible" });
      try { el.enter.focus({ preventScroll: true }); } catch (_) {}
      gsap.fromTo(el.enter, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
    }

    /* The closed scroll (roll, ribbon, seal) and its copy are invisible once the sheet is open.
       Take them out of rendering so the exit zoom doesn't re-lay-out the seal's SVG text or
       repaint its drop-shadow filters on every frame, and their CSS loops stop ticking. */
    let retired = false;
    function retireClosed() {
      if (retired) return;
      retired = true;
      gsap.set([el.bundle, el.band, el.bow, el.seal, el.head, el.hint], { display: "none" });
    }

    /* ---------------- exit: parchment zooms toward you, the curtain lifts ----------------
       Only transform and opacity move. data-state="leaving" promotes the moving layers
       (will-change) and pauses the ambient CSS loops for the length of the exit. */
    function leave() {
      if (state !== "unrolled") return;
      setState("leaving");
      if (App.beginOpen) App.beginOpen();   // pay the unlock re-layout now, on a still frame
      if (!App.music.playing) gesture();
      App.haptic(12);
      offTilt();
      retireClosed();
      if (reduce) {
        callOpen();
        gsap.to(root, { autoAlpha: 0, duration: 0.35, ease: "power1.out", onComplete: finish });
        return;
      }
      gsap.timeline({ onComplete: finish })
        .to(el.enter, { opacity: 0, y: 12, duration: 0.25, ease: "power2.in" }, 0)
        .to(el.zoom, { scale: 1.5, y: -24, duration: 1.15, ease: "power2.in" }, 0.05)
        .to(el.zoom, { opacity: 0, duration: 0.55, ease: "power1.in" }, 0.62)
        .to([el.halo, el.dust, ...el.labels], { opacity: 0, duration: 0.45 }, 0.1)
        .call(() => dust.stop(), null, 0.56)   // faded out: stop drawing and free its bitmap now
        .to(el.curtain, { yPercent: -100, duration: 1.15, ease: "power3.inOut" }, 0.32)
        .to(el.curtain, { opacity: 0.4, duration: 0.6, ease: "power1.in" }, 0.85)
        .call(callOpen, null, 0.55);
    }

    function finish() {
      if (state === "done") return;
      setState("done");
      callOpen();
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      dust.stop();
      offTilt();
      if (floatTw) floatTw.kill();
      if (drag) drag.kill();
      offLang();
      offResize();
      document.removeEventListener("keydown", onKey);
      document.fonts && document.fonts.removeEventListener && document.fonts.removeEventListener("loadingdone", fit);
      // hand keyboard focus to the page
      const main = document.getElementById("main");
      if (main) {
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        main.style.outline = "none";
        try { main.focus({ preventScroll: true }); } catch (_) {}
      }
    }

    /* ---------------- nudge: wheel/keys before opening wiggle the seal ---------------- */
    let nudging = false;
    function nudge() {
      if (nudging || reduce || state !== "sealed") return;
      nudging = true;
      gsap.timeline({ onComplete: () => { nudging = false; } })
        .to(el.sealMag, { rotation: -9, duration: 0.07, ease: "power1.out" })
        .to(el.sealMag, { rotation: 7, duration: 0.1, ease: "power1.inOut" })
        .to(el.sealMag, { rotation: -4, duration: 0.1, ease: "power1.inOut" })
        .to(el.sealMag, { rotation: 0, duration: 0.3, ease: "elastic.out(1, 0.5)" })
        .fromTo(el.tap, { opacity: 0.45 }, { opacity: 1, duration: 0.6, ease: "power1.out" }, 0);
    }

    /* ---------------- wiring ---------------- */
    el.seal.addEventListener("click", () => {
      if (!closed()) return;
      gesture();   // same synchronous handler as the tap: music, motion permission, haptic
      open();
    });
    el.enter.addEventListener("click", leave);

    let wheelAcc = 0, wheelT = 0;
    root.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (state === "unrolled") {
        clearTimeout(wheelT);
        wheelT = setTimeout(() => { wheelAcc = 0; }, 220);
        wheelAcc += Math.abs(e.deltaY);
        if (wheelAcc > 40) leave();
      } else if (state === "sealed" && Math.abs(e.deltaY) > 8) {
        nudge();
      }
    }, { passive: false });

    let swipeY = null;
    root.addEventListener("pointerdown", (e) => { swipeY = e.clientY; }, true);
    root.addEventListener("pointerup", (e) => {
      if (swipeY != null && state === "unrolled" && swipeY - e.clientY > 48) leave();
      swipeY = null;
    }, true);
    root.addEventListener("pointercancel", () => { swipeY = null; }, true);

    // On the document, not the dialog: after unrolling, focus can sit outside #intro (e.g. the
    // language toggle) and the keys must still open the page. Removed in finish().
    function onKey(e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key, t = e.target;
      const control = t && t !== root && t.closest ? t.closest("button, a[href], input, select, textarea, [contenteditable]") : null;
      if (state === "unrolled" && (k === "ArrowDown" || k === "PageDown" || (k === " " && !control))) {
        // Space on a focused control keeps its own meaning (it presses that button)
        e.preventDefault();
        leave();
      } else if (state === "sealed" && (k === "ArrowDown" || k === "PageDown")) {
        e.preventDefault();
        nudge();
      }
    }
    document.addEventListener("keydown", onKey);

    offLang = App.on("lang", () => {
      renderDear();
      fit();
      requestAnimationFrame(fit);
      setTimeout(fit, 400);   // after the Telugu fonts settle
    });
    offResize = App.on("resize", () => { fit(); dust.resize(); });
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", fit);
    // if anything else opens the page, get out of the way
    App.on("open", () => {
      releaseInert();
      if (state !== "leaving" && state !== "done") {
        setState("leaving");
        gsap.to(root, { autoAlpha: 0, duration: 0.3, onComplete: finish });
      }
    });

    /* ======================================================================
       Drifting gold dust (one small canvas, DPR ≤ 2, paused when hidden)
       ====================================================================== */
    function makeDust() {
      const c = el.dust;
      let ctx = c && c.getContext ? c.getContext("2d") : null;
      const noop = { stop() {}, resize() {}, burst() {} };
      if (!ctx) return noop;
      let w = 0, h = 0, raf = 0, last = 0, stopped = false;
      let parts = [];
      let sparks = [];
      // pre-rendered glow sprite: one drawImage per particle
      let sprite = document.createElement("canvas");
      sprite.width = sprite.height = 32;
      const sctx = sprite.getContext("2d");
      const g = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(244,231,196,1)");
      g.addColorStop(0.25, "rgba(228,210,166,.75)");
      g.addColorStop(1, "rgba(200,169,106,0)");
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, 32, 32);

      const spawn = (anywhere) => ({
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 12,
        r: 0.7 + Math.random() * 1.9,
        vx: (Math.random() - 0.5) * 6,
        vy: -(5 + Math.random() * 16),
        a: 0.25 + Math.random() * 0.55,
        tw: Math.random() * 6.28,
        ts: 0.8 + Math.random() * 2.2,
      });
      function resize() {
        if (stopped) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        w = c.clientWidth || window.innerWidth;
        h = c.clientHeight || window.innerHeight;
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const n = Math.round(App.clamp((w * h) / 24000, 16, 48));
        parts = Array.from({ length: n }, () => spawn(true));
        if (reduce) draw(0);
      }
      function draw(dt) {
        ctx.clearRect(0, 0, w, h);
        for (const p of parts) {
          p.x += p.vx * dt; p.y += p.vy * dt; p.tw += p.ts * dt;
          if (p.y < -12 || p.x < -12 || p.x > w + 12) Object.assign(p, spawn(false));
          const s = p.r * 7;
          ctx.globalAlpha = p.a * (0.55 + 0.45 * Math.sin(p.tw));
          ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const p = sparks[i];
          p.life -= dt;
          if (p.life <= 0) { sparks.splice(i, 1); continue; }
          p.vx *= 1 - 2.2 * dt; p.vy = p.vy * (1 - 2.2 * dt) + 60 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          const s = p.r * 7;
          ctx.globalAlpha = Math.min(1, p.life / p.max * 1.4);
          ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
      }
      function frame(t) {
        raf = 0;
        if (stopped || document.hidden) return;
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
        last = t;
        draw(dt);
        raf = requestAnimationFrame(frame);
      }
      function run() {
        if (reduce || stopped || raf || document.hidden) return;
        last = 0;
        raf = requestAnimationFrame(frame);
      }
      const onVis = () => { if (!document.hidden) run(); };
      document.addEventListener("visibilitychange", onVis);
      resize();
      run();
      return {
        resize,
        burst(x, y) {
          if (reduce || stopped) return;
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 90 + Math.random() * 260;
            const max = 0.6 + Math.random() * 0.7;
            sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: 0.8 + Math.random() * 1.8, life: max, max });
          }
        },
        stop() {
          if (stopped) return;
          stopped = true;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          document.removeEventListener("visibilitychange", onVis);
          // Free the full-screen backing store (and the sprite) instead of keeping a cleared bitmap.
          c.width = c.height = 0;
          sprite.width = sprite.height = 0;
          ctx = sprite = null;
          parts = [];
          sparks = [];
        },
      };
    }
  });
})();
