/* ==========================================================
   hero.js — "Welcome"
   - entrance on "open": SplitText names (chars in English, words in Telugu)
     rise from blur to sharp, the ampersand writes itself in, details stagger in.
     The split and the (paused) timeline are prepared at init while the hero is still
     hidden behind the intro, so "open" only has to press play.
     Touch devices and small CPUs get a lighter variant: transform + opacity only,
     no blur filters and no clip-path (both repaint every frame).
   - gold foil sheen sweeps the names on a slow loop once they have landed: a gold copy
     of each name inside a soft band; band and copy slide in opposite directions with
     transforms only, so the sweep runs on the compositor (no repaints)
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
    // blur/clip-path entrance only where painting is cheap: a fine pointer and more than 4 cores
    const cores = navigator.hardwareConcurrency || 8;
    const lite = App.isTouch || !App.finePointer || cores <= 4;
    let entered = false;
    let entrance = null;     // the entrance timeline: prepared (paused) at init, played on "open"
    let opened = false;
    let prepToken = 0;       // invalidates a pending (font-waiting) preparation
    let prepPending = false;
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
    else {
      App.on("open", enter);
      prepareWhenFontsReady(4000);
    }

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
    // Split after the fonts are in (or after maxMs), unless "open" already forced it.
    function prepareWhenFontsReady(maxMs) {
      const token = ++prepToken;
      prepPending = true;
      const ready = App.fontsReady ? App.fontsReady() : Promise.resolve();
      Promise.race([ready.catch(() => {}), new Promise((r) => setTimeout(r, maxMs))]).then(() => {
        if (token !== prepToken) return;
        prepPending = false;
        if (entered || entrance) return;
        prepare();
        if (opened) entrance.play();
      });
    }

    function prepare() {
      prepToken++;
      prepPending = false;
      if (entrance) { entrance.kill(); entrance = null; }
      const [partsA = [el.nameEls[0]], partsB = [el.nameEls[1]]] = splitNames();
      entrance = buildEntrance(partsA, partsB);
      // every element now sits in its (invisible) from-state, so the stage can be shown:
      // the hero's first paint happens here, behind the intro, instead of on "open"
      hero.classList.remove("hero--pre");
    }

    function enter() {
      opened = true;
      if (entered) return;
      if (!entrance) {
        // a language switch is still waiting for its fonts: play as soon as they land (max ~1 s)
        if (prepPending) { prepareWhenFontsReady(900); return; }
        prepare();
      }
      entrance.play();
    }

    function buildEntrance(partsA, partsB) {
      const words = !App.splitChars();
      const tl = gsap.timeline({ paused: true, defaults: { ease: "expo.out" }, onComplete: finish });

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

      // Desktop: letters rise out of a soft blur. Lite: the same rise, transform + opacity only.
      let nameFrom, nameTo;
      if (lite) {
        nameFrom = words
          ? { opacity: 0, yPercent: 55, rotation: 4 }
          : { opacity: 0, yPercent: 75, rotation: (i) => (i % 2 ? 10 : -8) };
        nameTo = { opacity: 1, yPercent: 0, rotation: 0, duration: words ? 1.5 : 1.3 };
      } else {
        nameFrom = words
          ? { opacity: 0, yPercent: 45, rotation: 4, filter: "blur(14px)" }
          : { opacity: 0, yPercent: 65, rotation: (i) => (i % 2 ? 9 : -7), filter: "blur(12px)" };
        // drop the filter as each letter lands, or ~20 filtered layers ride along with the parallax
        nameTo = { opacity: 1, yPercent: 0, rotation: 0, filter: "blur(0px)", clearProps: "filter", duration: words ? 1.6 : 1.4 };
      }
      tl.fromTo(partsA, nameFrom, { ...nameTo, stagger: words ? .2 : .06 }, .45);

      // the ampersand writes itself in (desktop) or turns in (lite) while its rules draw outward
      const ampAt = words ? .95 : .8;
      if (el.ampGlyph) {
        if (lite) {
          tl.fromTo(el.ampGlyph,
            { opacity: 0, scale: .6, rotation: -24 },
            { opacity: 1, scale: 1, rotation: 0, duration: 1.3, ease: "power3.out" }, ampAt);
        } else {
          tl.fromTo(el.ampGlyph,
            { opacity: 0, clipPath: "inset(0% 100% 0% 0%)", scale: .8, rotation: -10 },
            { opacity: 1, clipPath: "inset(0% 0% 0% 0%)", scale: 1, rotation: 0, duration: 1.3, ease: "power3.inOut", clearProps: "clipPath" }, ampAt);
        }
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
      return tl;
    }

    function finish() {
      if (entered) return;
      entered = true;
      entrance = null;
      unsplitNames();
      gsap.set(el.nameEls, { clearProps: "opacity,transform,filter" });
      if (el.ampGlyph) gsap.set(el.ampGlyph, { clearProps: "clipPath,filter" });
      addSheen();
      startIdle();
    }

    /* ---------------- foil sheen (transform-only; see hero.css) ---------------- */
    function addSheen() {
      el.nameEls.forEach((n) => {
        if (n.querySelector(".hero__sheen")) return;
        const text = n.textContent.trim();
        if (!text) return;
        const s = document.createElement("span");
        s.className = "hero__sheen";
        s.setAttribute("aria-hidden", "true");
        s.innerHTML = '<span class="hero__sheen-band"><span class="hero__sheen-text"></span></span>';
        s.firstChild.firstChild.textContent = text;
        n.appendChild(s);
      });
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
      if (!entered && (!opened || !entrance)) {
        // not playing yet (still behind the intro): i18n reverted the split, so re-split the new
        // text once its fonts are in and rebuild the prepared entrance (hidden until then)
        if (entrance) { entrance.kill(); entrance = null; }
        hero.classList.add("hero--pre");
        prepareWhenFontsReady(opened ? 900 : 3000);
        return;
      }
      if (!entered) {
        // mid-entrance: i18n already reverted the split; jump to the final, readable state
        entrance.progress(1);
        return;
      }
      // i18n replaced the text (and dropped the sheen copy); rebuild it and bring the names in softly
      addSheen();
      gsap.fromTo(el.nameEls, { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: .7, stagger: .08, ease: "power3.out", clearProps: "opacity,transform" });
      if (el.dear && !el.dear.hidden) gsap.fromTo(el.dear, { opacity: 0 }, { opacity: 1, duration: .6 });
    }
  });
})();
