/* ==========================================================
   countdown.js — split-flap countdown to App.WEDDING.start (#countdown).

   Each unit is one flap card made of four layers:
     top half    (static)  shows the NEW value
     bottom half (static)  shows the OLD value until the leaf lands
     top leaf    (moving)  OLD value, falls from 0 to -90deg on its hinge
     bottom leaf (moving)  NEW value, swings from 90deg down to 0
   The clock ticks only while the section is on screen and the tab is
   visible; whenever it comes into view it snaps to the correct values
   first, so it is never wrong when seen.
   ========================================================== */
(function () {
  const App = window.App;
  if (!App) return;

  App.module("countdown", (App) => {
    const root = document.getElementById("countdown");
    if (!root) return;
    const $ = (s) => root.querySelector(s);
    const gsap = App.gsap;
    const reduce = App.reduceMotion;
    const W = App.WEDDING;
    const DAY = 86400000;
    const JOURNEY = 100 * DAY;   // the progress line covers the final hundred days

    const statusEl = $(".countdown__status");
    const togoEl = $(".countdown__togo");
    const srEl = $(".countdown__sr");
    const progressEl = $(".countdown__progress");

    /* ---------- build the flap cards ---------- */
    const layer = (cls) =>
      `<span class="countdown__${cls}"><span class="countdown__num"></span><span class="countdown__shade"></span></span>`;
    const units = ["days", "hours", "minutes", "seconds"].map((name) => {
      const unit = $(`.countdown__unit[data-unit="${name}"]`);
      const flap = unit && unit.querySelector(".countdown__flap");
      if (!flap) return null;
      flap.innerHTML =
        layer("half countdown__half--top") + layer("half countdown__half--bottom") +
        layer("leaf countdown__leaf--top") + layer("leaf countdown__leaf--bottom");
      const pick = (sel) => flap.querySelector(sel);
      return {
        name, unit, flap,
        value: null,
        tl: null,
        topNum: pick(".countdown__half--top .countdown__num"),
        botNum: pick(".countdown__half--bottom .countdown__num"),
        botShade: pick(".countdown__half--bottom .countdown__shade"),
        leafTop: pick(".countdown__leaf--top"),
        leafTopNum: pick(".countdown__leaf--top .countdown__num"),
        leafTopShade: pick(".countdown__leaf--top .countdown__shade"),
        leafBot: pick(".countdown__leaf--bottom"),
        leafBotNum: pick(".countdown__leaf--bottom .countdown__num"),
        leafBotShade: pick(".countdown__leaf--bottom .countdown__shade"),
      };
    }).filter(Boolean);
    if (!units.length) return;

    let visible = false;
    let entered = false;     // the entrance has played (or never will)

    function setInstant(u, text) {
      if (u.tl) { u.tl.kill(); u.tl = null; }
      u.topNum.textContent = u.botNum.textContent = u.leafTopNum.textContent = u.leafBotNum.textContent = text;
      if (gsap) {
        gsap.set([u.leafTop, u.leafBot], { visibility: "hidden" });
        gsap.set(u.leafTop, { rotationX: 0 });
        gsap.set(u.leafBot, { rotationX: 90 });
        gsap.set([u.botShade, u.leafTopShade, u.leafBotShade], { opacity: 0 });
      }
      u.value = text;
    }

    function flip(u, text) {
      const old = u.value;
      if (old === text) return;
      if (old == null || !gsap || reduce || !visible || !entered || document.hidden) return setInstant(u, text);
      if (u.tl) { u.tl.kill(); u.tl = null; }
      u.value = text;
      u.unit.dataset.digits = String(text.length);
      // static halves: new on top, old below until the falling leaf covers it
      u.topNum.textContent = text;
      u.botNum.textContent = old;
      u.leafTopNum.textContent = old;
      u.leafBotNum.textContent = text;
      const fast = u.name === "seconds" ? 1 : 1.12;
      u.tl = gsap.timeline({
        onComplete() {
          u.botNum.textContent = text;
          gsap.set([u.leafTop, u.leafBot], { visibility: "hidden" });
          gsap.set(u.leafTop, { rotationX: 0 });
          u.tl = null;
        },
      })
        .set(u.leafTop, { visibility: "visible", rotationX: 0 })
        .set(u.leafBot, { visibility: "visible", rotationX: 90 })
        .set([u.leafTopShade, u.botShade], { opacity: 0 })
        .set(u.leafBotShade, { opacity: 0.6 })
        .to(u.leafTop, { rotationX: -90, duration: 0.26 * fast, ease: "power2.in" }, 0)
        .to(u.leafTopShade, { opacity: 0.65, duration: 0.26 * fast, ease: "power2.in" }, 0)
        .to(u.botShade, { opacity: 0.45, duration: 0.26 * fast, ease: "power2.in" }, 0)
        .to(u.leafBot, { rotationX: 0, duration: 0.5 * fast, ease: "bounce.out" }, 0.26 * fast)
        .to(u.leafBotShade, { opacity: 0, duration: 0.3 * fast, ease: "power1.out" }, 0.26 * fast)
        .set(u.botShade, { opacity: 0 }, 0.26 * fast);
    }

    /* ---------- time ---------- */
    const pad = (n) => String(n).padStart(2, "0");
    function compute(now) {
      const diff = W.start - now;
      if (diff > 0) {
        const s = Math.floor(diff / 1000);
        return {
          phase: "before", diff,
          d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60,
        };
      }
      return { phase: now < W.end ? "today" : "after", diff, d: 0, h: 0, m: 0, s: 0 };
    }

    let state = null;
    let celebrated = false;
    function render(animate) {
      state = compute(Date.now());
      const vals = [String(state.d).length > 2 ? String(state.d) : pad(state.d), pad(state.h), pad(state.m), pad(state.s)];
      units.forEach((u, i) => {
        if (animate) flip(u, vals[i]);
        else setInstant(u, vals[i]);
        u.unit.dataset.digits = String(vals[i].length);
      });
      const done = state.phase !== "before";
      root.classList.toggle("is-done", done);
      const p = done ? 1 : App.clamp(1 - state.diff / JOURNEY, 0, 1);
      if (progressEl) progressEl.style.setProperty("--p", entered || reduce || !gsap ? p.toFixed(4) : "0");
      root._p = p;
      renderText();
      if (state.phase === "today" && visible && !celebrated) {
        celebrated = true;
        const r = $(".countdown__clock").getBoundingClientRect();
        try { App.fx.burst({ x: r.left + r.width / 2, y: r.top + r.height / 2, kind: "confetti" }); } catch (_) {}
      }
    }

    // everything written by JS goes through App.t, so a language switch re-renders it
    let lastText = "";
    function renderText() {
      if (!state) return;
      const { phase, d, h, m } = state;
      let togo = "";
      let status = "";
      let sr = "";
      if (phase === "before") {
        if (d >= 2) togo = App.t(`${d} days to go`, `ఇంకా ${d} రోజులు`);
        else if (d === 1) togo = App.t("1 day to go", "ఇంకా 1 రోజు");
        else togo = App.t("Almost time", "సమయం దగ్గరపడింది!");
        const one = (n, a, b) => `${n} ${n === 1 ? a : b}`;
        sr = App.t(
          `${one(d, "day", "days")}, ${one(h, "hour", "hours")} and ${one(m, "minute", "minutes")} to go`,
          `ఇంకా ${one(d, "రోజు", "రోజులు")}, ${one(h, "గంట", "గంటలు")}, ${one(m, "నిమిషం", "నిమిషాలు")}`
        );
      } else if (phase === "today") {
        status = App.t("Today's the day!", "ఈరోజే ఆ శుభదినం!");
      } else {
        status = App.t("Thank you for celebrating with us", "మాతో కలిసి వేడుక జరుపుకున్నందుకు ధన్యవాదాలు");
      }
      const key = App.lang + togo + "|" + status + "|" + sr;
      if (key === lastText) return;
      lastText = key;
      if (togoEl) togoEl.textContent = togo;
      if (srEl) srEl.textContent = sr || status;
      if (statusEl) {
        statusEl.hidden = !status;
        statusEl.innerHTML = "";
        if (status) {
          const span = document.createElement("span");
          span.textContent = status;
          statusEl.appendChild(span);
        }
      }
    }
    App.on("lang", () => { lastText = ""; renderText(); });

    /* ---------- ticking: aligned to the second, only while visible ---------- */
    let timer = 0;
    function schedule() {
      clearTimeout(timer);
      timer = 0;
      if (!visible || document.hidden) return;
      timer = setTimeout(() => {
        render(true);
        schedule();
      }, 1000 - (Date.now() % 1000) + 12);
    }
    function wake() {
      render(false);   // snap to the truth before anyone sees a stale value
      schedule();
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        const was = visible;
        visible = entries[entries.length - 1].isIntersecting;
        root.classList.toggle("is-offscreen", !visible);
        if (visible && !was) wake();
        if (!visible) { clearTimeout(timer); timer = 0; }
      }, { rootMargin: "60px 0px" }).observe(root);
    } else {
      visible = true;
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { clearTimeout(timer); timer = 0; }
      else if (visible) wake();
    });

    /* ---------- entrance: the cards swing down onto their hinges ---------- */
    function entrance() {
      if (!gsap || !App.ScrollTrigger || reduce) { entered = true; render(false); return; }
      const head = [$(".countdown__eyebrow"), $(".countdown__title")].filter(Boolean);
      const flaps = units.map((u) => u.flap);
      const labels = units.map((u) => u.unit.querySelector(".countdown__label")).filter(Boolean);
      gsap.set(flaps, { transformPerspective: 700, transformOrigin: "50% 0%" });
      const tl = gsap.timeline({
        scrollTrigger: { trigger: $(".countdown__clock") || root, start: "top 82%", once: true },
        defaults: { ease: "expo.out" },
        onStart() { render(false); },
        onComplete() {
          entered = true;
          if (progressEl) progressEl.style.setProperty("--p", (root._p || 0).toFixed(4));
        },
      });
      tl.from(head, { y: 34, opacity: 0, duration: 1.2, stagger: 0.12, clearProps: "transform,opacity" }, 0)
        .from(flaps, { rotationX: -95, opacity: 0, duration: 1.3, stagger: 0.11, ease: "back.out(1.25)", clearProps: "transform,opacity" }, 0.15)
        .from(labels, { y: 12, opacity: 0, duration: 0.9, stagger: 0.11, clearProps: "transform,opacity" }, 0.45)
        .from(progressEl, { opacity: 0, y: 14, duration: 0.9, clearProps: "transform,opacity" }, 0.6)
        // let the line grow once the cards land
        .add(() => { if (progressEl) progressEl.style.setProperty("--p", (root._p || 0).toFixed(4)); }, 0.75);
    }

    render(false);
    if (App.state.opened) entrance();
    else App.on("open", entrance);
  });
})();
