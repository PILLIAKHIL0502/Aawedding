/* ==========================================================
   couple.js — "The Couple"
   - intro line: SplitText words rise in on scroll (Telugu: words only)
   - the coming-together scene: pinned + scrubbed (gsap.matchMedia);
     groom and bride cards slide toward each other, two gold rings roll
     out of the cards, draw themselves and interlock with a glow bloom,
     then "Two families · One celebration" fades up.
     Short landscape screens: no pin, the scene plays once in view.
     Reduced motion: no pin, static final layout.
   - 3D flip cards (button + aria-pressed) with a spring, haptic tick,
     pointer tilt (desktop) or App.tilt (phones) and a moving glare.
   ========================================================== */
(function () {
  const App = window.App;
  if (!App) return;

  App.module("couple", (App) => {
    const root = document.getElementById("couple");
    if (!root) return;

    const gsap = window.gsap;
    const ST = window.ScrollTrigger;
    const SplitText = window.SplitText;
    const reduce = App.reduceMotion || !gsap;
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));

    const stage = $(".cpl-stage");
    const scene = $(".cpl-scene");
    const halo = $(".cpl-halo");
    const slotG = $(".cpl-slot--groom");
    const slotB = $(".cpl-slot--bride");
    const cards = $$(".cpl-card");
    const ringsBox = $(".cpl-rings");
    const caption = $(".cpl-caption");
    const lede = $(".cpl-lede");

    const state = { hinted: false, flippedOnce: false, inView: false };
    if (!gsap) root.classList.add("cpl-css-flip");
    let ledeSplit = null, ledeTrigger = null, ledeTween = null, ledeDone = false;

    // glare layers (decorative) on each face
    cards.forEach((card) => {
      card._inner = card.querySelector(".cpl-card__inner");
      card._fan = card.closest(".cpl-fan");
      card._glares = Array.from(card.querySelectorAll(".cpl-face")).map((face) => {
        const g = document.createElement("span");
        g.className = "cpl-glare";
        g.setAttribute("aria-hidden", "true");
        face.appendChild(g);
        return g;
      });
    });

    setupFlip();
    setupTilt();
    setupLede();
    setupScene();
    setupVisibility();
    fitNames();

    App.on("lang", () => {
      resetLede();
      fitNames();
      // Telugu fonts may still be arriving: fit again once they have
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNames);
    });
    App.on("resize", fitNames);
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", fitNames);

    /* ======================================================
       Flip
       ====================================================== */
    function setupFlip() {
      cards.forEach((card) => {
        card.addEventListener("click", () => {
          const next = card.getAttribute("aria-pressed") !== "true";
          setFlipped(card, next);
          App.haptic(next ? [10, 30, 6] : 8);
        });
      });
    }

    function setFlipped(card, flipped) {
      card.setAttribute("aria-pressed", String(flipped));
      card.classList.toggle("is-flipped", flipped);
      if (!state.flippedOnce) { state.flippedOnce = true; root.classList.add("has-flipped"); }
      const target = flipped ? 180 : 0;
      if (!gsap) return;   // CSS fallback rotates the inner via [aria-pressed]
      gsap.killTweensOf(card._inner);
      if (reduce) { gsap.set(card._inner, { rotationY: target }); return; }
      gsap.to(card._inner, { rotationY: target, duration: 1.25, ease: "elastic.out(1, 0.7)" });
      // lift the card off the table as it turns
      gsap.fromTo(card._fan, { scale: 1 }, {
        scale: 1.06, duration: 0.24, ease: "power2.out", yoyo: true, repeat: 1, overwrite: "auto",
      });
    }

    /* a one-off "peek" that hints the card can be turned */
    function peek(card) {
      if (reduce || !card || card.getAttribute("aria-pressed") === "true" || state.flippedOnce) return;
      gsap.timeline()
        .to(card._inner, { rotationY: 28, duration: 0.45, ease: "power2.out" })
        .to(card._inner, { rotationY: 0, duration: 1.1, ease: "elastic.out(1, 0.45)" });
    }

    /* ======================================================
       Tilt + glare
       desktop: the pointer over each card; phones: App.tilt (gyroscope)
       ====================================================== */
    function setupTilt() {
      if (reduce) return;
      const MAX = 11;
      const rigs = cards.map((card) => ({
        card,
        rx: gsap.quickTo(card, "rotationX", { duration: 0.7, ease: "power3.out" }),
        ry: gsap.quickTo(card, "rotationY", { duration: 0.7, ease: "power3.out" }),
        gx: card._glares.map((g) => gsap.quickTo(g, "xPercent", { duration: 0.6, ease: "power3.out" })),
        gy: card._glares.map((g) => gsap.quickTo(g, "yPercent", { duration: 0.6, ease: "power3.out" })),
        go: gsap.quickTo(card._glares, "opacity", { duration: 0.5, ease: "power2.out" }),
      }));

      const apply = (rig, px, py, glareAlpha) => {
        // px/py in -1..1 (pointer position relative to the card's centre)
        rig.rx(-py * MAX);
        rig.ry(px * MAX);
        rig.gx.forEach((fn, i) => fn((i === 0 ? px : -px) * 22));
        rig.gy.forEach((fn) => fn(py * 22));
        rig.go(glareAlpha);
      };

      if (App.finePointer) {
        rigs.forEach((rig) => {
          const ref = rig.card._fan;
          rig.card.addEventListener("pointermove", (e) => {
            if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
            const r = ref.getBoundingClientRect();
            const px = App.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
            const py = App.clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
            apply(rig, px, py, 1);
          });
          rig.card.addEventListener("pointerleave", () => apply(rig, 0, 0, 0));
        });
      } else {
        App.on("tilt", (t) => {
          if (!state.inView) return;
          rigs.forEach((rig) => apply(rig, App.clamp(t.x, -1, 1) * 0.8, App.clamp(t.y, -1, 1) * 0.8, 0.7));
        });
      }
    }

    /* ======================================================
       Intro line: words rise in once, on scroll
       ====================================================== */
    function setupLede() {
      if (reduce || !SplitText || !ST || !lede) return;
      splitLede();
      if (ledeDone) return;
      gsap.set(ledeSplit.words, { opacity: 0, yPercent: 70, rotate: 3 });
      ledeTrigger = ST.create({
        trigger: lede,
        start: "top 86%",
        once: true,
        onEnter: () => whenOpen(revealLede),
      });
    }

    function splitLede() {
      // words only: Telugu must never be split into characters
      ledeSplit = new SplitText(lede, { type: "words", wordsClass: "cpl-word" });
      lede._split = ledeSplit;   // i18n reverts this before swapping the text
    }

    function revealLede() {
      ledeDone = true;
      if (!ledeSplit) return;
      ledeTween = gsap.to(ledeSplit.words, {
        opacity: 1, yPercent: 0, rotate: 0,
        duration: 1.15, ease: "expo.out", stagger: 0.035,
      });
    }

    function resetLede() {
      // i18n has already reverted the old split and swapped the text
      if (ledeTween) { ledeTween.kill(); ledeTween = null; }
      if (ledeTrigger) { ledeTrigger.kill(); ledeTrigger = null; }
      if (ledeSplit && lede._split === ledeSplit) { try { ledeSplit.revert(); } catch (_) {} }
      ledeSplit = null; lede._split = null;
      setupLede();
    }

    function whenOpen(fn) {
      if (App.state.opened) fn();
      else App.on("open", fn);
    }

    /* ======================================================
       The coming-together scene
       ====================================================== */
    function setupScene() {
      if (reduce || !ST || !stage || !scene) {
        root.classList.add("is-linked");
        return;
      }
      const mm = gsap.matchMedia();
      mm.add({
        tall: "(min-height: 501px)",
        short: "(max-height: 500px)",
        row: "(min-width: 900px) and (min-height: 501px), (max-height: 500px) and (min-width: 560px)",
      }, (ctx) => {
        const { tall, row } = ctx.conditions;
        const tl = buildTimeline();
        tl.eventCallback("onUpdate", () => onProgress(tl.progress()));

        if (tall) {
          ST.create({
            trigger: stage,
            start: "top top",
            end: () => "+=" + Math.round(window.innerHeight * (row ? 1.5 : 1.1)),
            pin: true,
            scrub: 0.7,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            animation: tl,
          });
        } else {
          // short landscape: no pin; play the scene once when it scrolls into view
          tl.pause(0);
          tl.timeScale(1 / 2.6);
          ST.create({
            trigger: stage,
            start: "top 72%",
            once: true,
            invalidateOnRefresh: true,
            onEnter: () => whenOpen(() => tl.play()),
          });
        }
        return () => root.classList.remove("is-linked");
      });
    }

    function onProgress(p) {
      root.classList.toggle("is-linked", p > 0.7);
      if (p > 0.96 && !state.hinted) {
        state.hinted = true;
        gsap.delayedCall(0.35, () => peek(cards[0]));
      }
    }

    /* where things start: measured from the untransformed layout */
    function cardStartX(slot, dir) {
      const sceneLeft = scene.getBoundingClientRect().left;
      const left = sceneLeft + slot.offsetLeft;
      const vw = stage.clientWidth || window.innerWidth;
      // the card's centre starts on the screen edge, half off-screen
      return dir < 0 ? -(left + slot.offsetWidth * 0.5) : vw - left - slot.offsetWidth * 0.5;
    }
    function ringStart(dir) {
      // each ring rolls out from behind its own card (groom: left, bride: right); in px
      const r = ringsBox.getBoundingClientRect();
      const slot = dir < 0 ? slotG : slotB;
      const cardCentre = scene.getBoundingClientRect().left + slot.offsetLeft + slot.offsetWidth / 2;
      const ringCentre = r.left + ((dir < 0 ? 96 : 144) / 240) * r.width;
      return cardCentre - ringCentre;
    }
    // rolling: the ring turns by distance / radius (ring radius is 40 of the 240 units)
    function rollDeg(px) {
      const radius = (40 / 240) * (ringsBox.offsetWidth || 240);
      return (px / radius) * (180 / Math.PI);
    }

    function buildTimeline() {
      const ringA = $$(".cpl-ring--a");
      const ringB = $(".cpl-ring--b");
      const bands = $$(".cpl-ring:not(.cpl-ring--over) .cpl-ring__band");
      const inners = $$(".cpl-ring:not(.cpl-ring--over) .cpl-ring__inner");
      const shines = $$(".cpl-ring__shine");
      const over = $(".cpl-ring--over");
      const gem = $(".cpl-gem");
      const bloom = $(".cpl-bloom");
      const sparks = $$(".cpl-spark");
      const lines = $$(".cpl-caption__line");
      const amp = $(".cpl-and");

      const tl = gsap.timeline({ defaults: { ease: "none" } });
      tl
        // the room warms up
        .fromTo(halo, { scale: 0.55, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "power1.out" }, 0)
        // the "&" between their names dissolves as the rings arrive
        .fromTo(amp, { opacity: 0.9, scale: 1 }, { opacity: 0, scale: 0.55, duration: 0.2, ease: "power2.in" }, 0.1)
        // cards slide toward each other
        .fromTo(slotG,
          { x: () => cardStartX(slotG, -1), rotation: -14, y: 34, scale: 0.9 },
          { x: 0, rotation: 0, y: 0, scale: 1, duration: 0.5, ease: "power2.out" }, 0)
        .fromTo(slotB,
          { x: () => cardStartX(slotB, 1), rotation: 14, y: 34, scale: 0.9 },
          { x: 0, rotation: 0, y: 0, scale: 1, duration: 0.5, ease: "power2.out" }, 0)
        // rings roll out from behind the cards and draw themselves
        .fromTo(ringA,
          { x: () => ringStart(-1), y: 0, rotation: () => rollDeg(ringStart(-1)) },
          { x: 0, y: 0, rotation: 0, duration: 0.5, ease: "power3.out" }, 0.2)
        .fromTo(ringB,
          { x: () => ringStart(1), y: 0, rotation: () => rollDeg(ringStart(1)) },
          { x: 0, y: 0, rotation: 0, duration: 0.5, ease: "power3.out" }, 0.2)
        .fromTo(bands, { strokeDashoffset: 100 }, { strokeDashoffset: 0, autoRound: false, duration: 0.36, ease: "power1.inOut" }, 0.2)
        .fromTo(inners, { strokeDashoffset: 100 }, { strokeDashoffset: 0, autoRound: false, duration: 0.32, ease: "power1.inOut" }, 0.28)
        .fromTo(shines, { opacity: 0 }, { opacity: 0.9, duration: 0.1 }, 0.5)
        .fromTo(over, { opacity: 0 }, { opacity: 1, duration: 0.02 }, 0.56)
        // the click: gem, bloom and sparks
        .fromTo(gem, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.1, ease: "back.out(3)" }, 0.62)
        .fromTo(bloom, { scale: 0.3, opacity: 0 }, { scale: 1.2, opacity: 1, duration: 0.08, ease: "power2.out" }, 0.66)
        .to(bloom, { scale: 1, opacity: 0.75, duration: 0.12, ease: "power1.inOut" }, 0.74)
        .fromTo(sparks, { scale: 0, rotation: -90, opacity: 0 },
          { scale: 1, rotation: 0, opacity: 0.85, duration: 0.1, ease: "back.out(2.5)", stagger: 0.012 }, 0.67)
        // the caption
        .fromTo(caption, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.14, ease: "power2.out" }, 0.78)
        .fromTo(lines, { scaleX: 0 }, { scaleX: 1, duration: 0.12, ease: "power2.out" }, 0.82)
        .to({}, { duration: 0.06 }, 0.94);   // hold the finished scene for a beat
      return tl;
    }

    /* ======================================================
       Visibility: pause idle CSS loops off screen; gate phone tilt
       ====================================================== */
    function setupVisibility() {
      const set = (on) => {
        state.inView = on;
        root.classList.toggle("is-live", on && !document.hidden);
      };
      if ("IntersectionObserver" in window) {
        new IntersectionObserver((entries) => set(entries[0].isIntersecting), { rootMargin: "0px" }).observe(root);
      } else set(true);
      document.addEventListener("visibilitychange", () => set(state.inView));
    }

    /* ======================================================
       Names never overflow their card (the bride's is longer)
       ====================================================== */
    function fitNames() {
      $$(".cpl-name").forEach((el) => {
        const text = el.firstElementChild;
        if (!text) return;
        el.style.removeProperty("font-size");
        const face = el.parentElement;
        const cs = getComputedStyle(face);
        const avail = (face.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * 0.98;
        const w = text.offsetWidth;              // untransformed width of the name
        if (w > avail && avail > 0) {
          const size = parseFloat(getComputedStyle(el).fontSize);
          el.style.fontSize = Math.floor(size * (avail / w) * 10) / 10 + "px";
        }
      });
    }
  });
})();
