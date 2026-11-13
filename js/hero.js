/* ==========================================================
   hero.js — "Welcome"
   - entrance on "open": SplitText names (chars in English, words in Telugu)
     rise from blur to sharp, the ampersand writes itself in, details stagger in
   - gold foil sheen sweeps the names on a slow loop once they have landed
   - 4-layer parallax (glow, rings, branches, sparkles) driven by App.tilt
   - scroll-out: names scale down and fade while the layers drift apart
   ========================================================== */
(function () {
  const App = window.App;
  if (!App) return;

  App.module("hero", (App) => {
    const hero = document.getElementById("hero");
    if (!hero) return;

    const gsap = App.gsap;
    const ST = App.ScrollTrigger;
    const Split = window.SplitText;
    const q = (s) => hero.querySelector(s);
    const qa = (s) => Array.from(hero.querySelectorAll(s));

    const el = {
      dear: q(".hero__dear"),
      top: q(".hero__top"),
      eyebrow: q(".hero__eyebrow"),
      content: q(".hero__content"),
      names: q(".hero__names"),
      nameEls: qa(".hero__name"),
      ampGlyph: q(".hero__amp-glyph"),
      ampRules: qa(".hero__amp-rule"),
      bottom: q(".hero__bottom"),
      tagline: q(".hero__tagline"),
      dateSides: qa(".hero__date-side"),
      dateSeps: qa(".hero__date-sep"),
      dateNum: q(".hero__date-num"),
      cue: q(".hero__cue"),
      cueIn: q(".hero__cue-in"),
      glow: q(".hero__glow"),
      rings: qa(".hero__ring[pathLength]"),
      gems: q(".hero__ring-gems"),
      spin: q(".hero__spin"),
      layerGlow: q(".hero__layer--glow"),
      layerRings: q(".hero__layer--rings"),
      layerSparks: q(".hero__layer--sparks"),
      branches: qa(".hero__branch"),
      branchIns: qa(".hero__branch-in"),
      sparksBox: q(".hero__sparks"),
    };

    const animate = !!gsap && !App.reduceMotion;
    let entered = false;
    let entrance = null;
    let inView = true;
    const idle = [];
    let sparks = [];

    renderGuest();
    sparks = buildSparks();
    setupCue();
    App.on("lang", onLang);

    if (!animate) {
      // Static, fully readable fallback: everything is visible as authored.
      return;
    }

    hero.classList.add("hero--armed", "hero--pre");
    setupParallax();
    setupScrollOut();
    setupVisibility();

    if (App.state.opened) enter();
    else App.on("open", enter);

    /* ---------------- guest greeting ---------------- */
    function renderGuest() {
      if (!el.dear) return;
      if (!App.guest) { el.dear.hidden = true; return; }
      el.dear.hidden = false;
      el.dear.textContent = App.t(`Dear ${App.guest},`, `ప్రియమైన ${App.guest} గారికి,`);
    }

    /* ---------------- sparkles (front layer) ---------------- */
    function buildSparks() {
      if (!el.sparksBox) return [];
      // deterministic layout, kept away from the names in the middle
      let seed = 29112026;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const count = App.isMobile() ? 11 : 18;
      const star = '<svg viewBox="0 0 20 20" focusable="false"><path d="M10 0C10.9 6.2 13.8 9.1 20 10 13.8 10.9 10.9 13.8 10 20 9.1 13.8 6.2 10.9 0 10 6.2 9.1 9.1 6.2 10 0Z"/></svg>';
      const out = [];
      let guard = 0;
      while (out.length < count && guard++ < 400) {
        const x = 4 + rnd() * 92;
        const y = 6 + rnd() * 88;
        const dx = (x - 50) / 30, dy = (y - 47) / 24;
        if (dx * dx + dy * dy < 1) continue;               // keep the centre clear
        if (Math.abs(x - 50) < 16 && y > 70) continue;      // ...and the scroll cue
        if (x < 30 && y < 14) continue;                     // ...and the language toggle
        const kind = rnd();
        const s = document.createElement("span");
        s.className = "hero__spark" + (kind < .28 ? " hero__spark--dot" : kind < .55 ? " hero__spark--soft" : "");
        const size = kind < .28 ? 6 + rnd() * 6 : 8 + rnd() * 12;
        s.style.cssText = `left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--s:${size.toFixed(1)}px`;
        s.innerHTML = `<span class="hero__spark-in">${kind < .28 ? "" : star}</span>`;
        el.sparksBox.appendChild(s);
        out.push(s);
      }
      return out;
    }

    /* ---------------- scroll cue ---------------- */
    function setupCue() {
      if (!el.cue) return;
      el.cue.addEventListener("click", () => {
        App.haptic(8);
        const y = hero.getBoundingClientRect().bottom + window.scrollY;
        App.scrollTo(Math.round(y));
      });
    }

    /* ---------------- SplitText ---------------- */
    function splitNames() {
      if (!Split) return [];
      const chars = App.splitChars();
      const parts = [];
      el.nameEls.forEach((n) => {
        if (n._split) { try { n._split.revert(); } catch (_) {} n._split = null; }
        n.classList.remove("is-sheen");
        const split = new Split(n, {
          type: chars ? "words,chars" : "words",
          tag: "span",
          wordsClass: "hero__word",
          charsClass: "hero__char",
        });
        n._split = split;   // the language switch reverts it (see js/i18n.js)
        parts.push(chars ? split.chars : split.words);
      });
      return parts;
    }
    function unsplitNames() {
      el.nameEls.forEach((n) => {
        if (n._split) { try { n._split.revert(); } catch (_) {} n._split = null; }
      });
    }

    /* ---------------- entrance ---------------- */
    function enter() {
      if (entered || entrance) return;
      const [partsA = [el.nameEls[0]], partsB = [el.nameEls[1]]] = splitNames();
      const words = !App.splitChars();
      const tl = gsap.timeline({ defaults: { ease: "expo.out" }, onComplete: finish });
      entrance = tl;

      // decoration
      tl.fromTo(el.glow, { opacity: 0, scale: .72 }, { opacity: 1, scale: 1, duration: 2.6, ease: "power2.out" }, 0);
      if (el.rings.length) {
        tl.fromTo(el.rings, { strokeDasharray: "1 1", strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 2.4, ease: "power2.inOut", stagger: .18 }, .05);
      }
      tl.fromTo([el.gems, el.spin], { opacity: 0 }, { opacity: 1, duration: 1.6, ease: "power1.out", stagger: .2 }, .6);
      tl.fromTo(el.branchIns,
        { opacity: 0, scale: .55, rotation: (i) => (i % 2 ? 14 : -14) },
        { opacity: 1, scale: 1, rotation: 0, duration: 2.2, stagger: .1 }, .1);

      // text
      if (el.dear && !el.dear.hidden) {
        tl.fromTo(el.dear, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.3 }, .2);
      }
      tl.fromTo(el.eyebrow, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.3 }, .3);

      const nameFrom = words
        ? { opacity: 0, yPercent: 45, rotation: 4, filter: "blur(14px)" }
        : { opacity: 0, yPercent: 65, rotation: (i) => (i % 2 ? 9 : -7), filter: "blur(12px)" };
      const nameTo = { opacity: 1, yPercent: 0, rotation: 0, filter: "blur(0px)", duration: words ? 1.6 : 1.4 };
      tl.fromTo(partsA, nameFrom, { ...nameTo, stagger: words ? .2 : .06 }, .45);

      // the ampersand writes itself in while its rules draw outward
      const ampAt = words ? .95 : .8;
      if (el.ampGlyph) {
        tl.fromTo(el.ampGlyph,
          { opacity: 0, clipPath: "inset(0% 100% 0% 0%)", scale: .8, rotation: -10 },
          { opacity: 1, clipPath: "inset(0% 0% 0% 0%)", scale: 1, rotation: 0, duration: 1.3, ease: "power3.inOut" }, ampAt);
      }
      if (el.ampRules.length) {
        tl.fromTo(el.ampRules, { scaleX: 0 }, { scaleX: 1, duration: 1.3, ease: "power3.inOut" }, ampAt + .25);
      }
      tl.fromTo(partsB, nameFrom, { ...nameTo, stagger: words ? .2 : .055 }, ampAt + .3);

      // details
      const at = ampAt + .7;
      tl.fromTo(el.tagline, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1.2 }, at);
      tl.fromTo(el.dateSides, { opacity: 0, x: (i) => (i ? -22 : 22) }, { opacity: 1, x: 0, duration: 1.2 }, at + .25);
      tl.fromTo(el.dateSeps, { scale: 0 }, { scale: 1, duration: .8, ease: "back.out(3)" }, at + .3);
      tl.fromTo(el.dateNum, { opacity: 0, yPercent: 40, scale: .85 }, { opacity: 1, yPercent: 0, scale: 1, duration: 1.3 }, at + .15);
      tl.fromTo(el.cueIn, { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: .9 }, at + .45);

      if (sparks.length) {
        tl.fromTo(sparks, { opacity: 0, scale: 0 },
          { opacity: 1, scale: 1, duration: 1.1, ease: "back.out(2)", stagger: { each: .04, from: "random" } }, .7);
      }

      // first paint of the from-states happens with the stage visible
      hero.classList.remove("hero--pre");
    }

    function finish() {
      if (entered) return;
      entered = true;
      entrance = null;
      unsplitNames();
      gsap.set(el.nameEls, { clearProps: "opacity,transform,filter" });
      if (el.ampGlyph) gsap.set(el.ampGlyph, { clearProps: "clipPath,filter" });
      el.nameEls.forEach((n) => n.classList.add("is-sheen"));
      startIdle();
    }

    /* ---------------- idle life: branches sway, sparkles drift and twinkle ---------------- */
    function startIdle() {
      el.branchIns.forEach((b, i) => {
        idle.push(gsap.to(b, {
          rotation: i % 2 ? -2.6 : 2.6,
          duration: 4.2 + i * .7,
          ease: "sine.inOut", yoyo: true, repeat: -1,
        }));
      });
      sparks.forEach((s) => {
        const r = Math.random;
        idle.push(gsap.to(s, {
          y: (r() - .5) * 28, x: (r() - .5) * 14, rotation: (r() - .5) * 50,
          duration: 3 + r() * 3.5, ease: "sine.inOut", yoyo: true, repeat: -1, delay: r() * 2,
        }));
        const inner = s.firstElementChild;
        if (inner) {
          idle.push(gsap.fromTo(inner, { scale: 1, opacity: 1 }, {
            scale: .35, opacity: .25,
            duration: 1.2 + r() * 1.8, ease: "sine.inOut", yoyo: true, repeat: -1, delay: r() * 3,
          }));
        }
      });
      if (!inView) idle.forEach((t) => t.pause());
    }

    /* ---------------- parallax depth from App.tilt ---------------- */
    function setupParallax() {
      const layers = qa(".hero__depth").map((d) => ({ el: d, depth: parseFloat(d.dataset.depth) || 0 }));
      if (el.content) layers.push({ el: el.content, depth: -7 });
      const movers = layers.map((l) => ({
        depth: l.depth,
        x: gsap.quickTo(l.el, "x", { duration: 1.2, ease: "power3" }),
        y: gsap.quickTo(l.el, "y", { duration: 1.2, ease: "power3" }),
      }));
      // phones tilt with the gyroscope: a little gentler
      const amp = () => (App.finePointer ? 1 : .7) * App.clamp(window.innerWidth / 1200, .6, 1.4);
      App.on("tilt", (t) => {
        if (!inView) return;
        const k = amp();
        movers.forEach((m) => { m.x(t.x * m.depth * k); m.y(t.y * m.depth * k * .75); });
      });
    }

    /* ---------------- scroll-out ---------------- */
    function setupScrollOut() {
      if (!ST) return;
      // top branches lift away; bottom ones slide out sideways and fade before the hero's edge reaches them
      const drift = { tl: [-1, -1], tr: [1, -1], bl: [-1, .25], br: [1, .25] };
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: .5, invalidateOnRefresh: true },
      });
      tl.to(el.names, { scale: .74, yPercent: 22, opacity: 0, duration: .75 }, 0)
        .to(el.top, { yPercent: -60, opacity: 0, duration: .45 }, 0)
        .to(el.bottom, { yPercent: 30, opacity: 0, duration: .6 }, .05)
        .to(el.cue, { opacity: 0, duration: .12 }, 0)
        .to(el.layerGlow, { scale: 1.25, opacity: .25, duration: 1 }, 0)
        .to(el.layerRings, { scale: 1.32, opacity: 0, duration: .9 }, 0)
        .to(el.layerSparks, { yPercent: -28, duration: 1 }, 0);
      el.branches.forEach((b) => {
        const key = (b.className.match(/hero__branch--(\w+)/) || [])[1];
        const [dx, dy] = drift[key] || [0, 0];
        const bottom = dy > 0;
        tl.to(b, { xPercent: dx * 34, yPercent: dy * 22, rotation: dx * (bottom ? 8 : -7), duration: 1 }, 0);
        if (bottom) tl.to(b, { opacity: 0, duration: .5 }, 0);
      });
    }

    /* ---------------- pause everything while offscreen ---------------- */
    function setupVisibility() {
      if (!ST) return;
      ST.create({
        trigger: hero,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => {
          inView = self.isActive;
          hero.classList.toggle("is-offscreen", !inView);
          idle.forEach((t) => (inView ? t.resume() : t.pause()));
        },
      });
    }

    /* ---------------- language switch ---------------- */
    function onLang() {
      renderGuest();
      if (!animate) return;
      if (!entered) {
        // mid-entrance: i18n already reverted the split; jump to the final, readable state
        if (entrance) entrance.progress(1);
        return;
      }
      // i18n replaced the text (classes survive); bring it in softly
      el.nameEls.forEach((n) => n.classList.add("is-sheen"));
      gsap.fromTo(el.nameEls, { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: .7, stagger: .08, ease: "power3.out", clearProps: "opacity,transform" });
      if (el.dear && !el.dear.hidden) gsap.fromTo(el.dear, { opacity: 0 }, { opacity: 1, duration: .6 });
    }
  });
})();
