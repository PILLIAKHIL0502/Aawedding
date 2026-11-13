/* ==========================================================
   scratch.js — "Save the date" gold-foil scratch card (#reveal).

   Three canvases:
     foil    static art (metal gradient, grain, brushed streaks, engraved label)
     mask    what is left of the foil: opaque = still covered (scratches cut it away)
     canvas  the visible layer = foil + moving sheen + glitter, cut by the mask,
             with gold flakes falling on top. Repainted only while on screen.
   Coverage is measured by sampling the mask on a small grid (throttled).
   At 50% the rest of the foil fades away, confetti bursts, and the state is
   remembered for the session.
   ========================================================== */
(function () {
  const App = window.App;
  if (!App) return;

  App.module("scratch", (App) => {
    const root = document.getElementById("reveal");
    if (!root) return;
    const $ = (s) => root.querySelector(s);
    const ticket = $(".reveal-date__ticket");
    const canvas = $(".reveal-date__foil");
    const button = $(".reveal-date__instant");
    const msg = $(".reveal-date__msg");
    if (!ticket || !canvas) return;

    const gsap = App.gsap;
    const reduce = App.reduceMotion;
    const KEY = "aa-date-revealed";
    const THRESHOLD = 0.5;
    const BRUSH = 32;                        // CSS px diameter
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const SAMPLE_W = 48, SAMPLE_H = 36;      // downscaled grid for coverage

    const session = {
      get() { try { return sessionStorage.getItem(KEY) === "1"; } catch (_) { return false; } },
      set() { try { sessionStorage.setItem(KEY, "1"); } catch (_) {} },
    };

    let revealed = false;
    const whenOpen = (fn) => (App.state.opened ? fn() : App.on("open", fn));

    const ctx = canvas.getContext("2d");
    const foil = document.createElement("canvas");
    let mask = document.createElement("canvas");
    let mctx = null;
    const sample = document.createElement("canvas");
    sample.width = SAMPLE_W;
    sample.height = SAMPLE_H;
    const sctx = sample.getContext("2d", { willReadFrequently: true });

    let W = 0, H = 0;                // CSS size of the canvas
    let glitter = [];                // twinkling points baked into positions on the foil
    let flakes = [];                 // gold flakes that fall off where you scratch
    let dirty = true;
    let visible = false;
    let raf = 0;
    let lastFrame = 0;
    let cleared = 0;
    let lastMilestone = 0;
    let drawing = false, pid = null, last = null;
    let lastCheck = 0, checkT = 0;
    const t0 = performance.now();

    /* ---------- already revealed this session: show the date, skip the foil ---------- */
    if (session.get() || !ctx) {
      finish({ animate: false, celebrate: false });
      entrance();
      return;
    }

    /* ---------- fonts for the engraved label ---------- */
    const serifStack = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--serif").trim() || "serif";
    const labelText = () => App.t("Scratch here", "ఇక్కడ గీకండి");
    const labelFont = (px) => (App.lang === "te" ? `400 ${px}px ${serifStack()}` : `italic 500 ${px}px ${serifStack()}`);
    function loadLabelFont() {
      if (!document.fonts || !document.fonts.load) return Promise.resolve();
      return Promise.race([
        document.fonts.load(labelFont(40), labelText()).catch(() => {}),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    }

    /* ---------- sizing (resize-safe: the existing scratches are scaled across) ---------- */
    function setup() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return false;
      if (w === W && h === H && foil.width) return false;
      W = w; H = h;
      const pw = Math.round(w * DPR), ph = Math.round(h * DPR);
      const prev = mctx ? mask : null;   // keep earlier scratches across a resize
      const next = document.createElement("canvas");
      next.width = pw; next.height = ph;
      const nctx = next.getContext("2d");
      if (prev) nctx.drawImage(prev, 0, 0, pw, ph);
      else { nctx.fillStyle = "#000"; nctx.fillRect(0, 0, pw, ph); }
      mask = next; mctx = nctx;
      canvas.width = pw; canvas.height = ph;
      foil.width = pw; foil.height = ph;
      paintFoil();
      return true;
    }

    /* ---------- the foil artwork ---------- */
    let grainTile = null;
    function grain() {
      if (grainTile) return grainTile;
      const t = document.createElement("canvas");
      t.width = t.height = 96;
      const c = t.getContext("2d");
      const img = c.createImageData(96, 96);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random();
        const light = v > 0.5;
        img.data[i] = light ? 255 : 92;
        img.data[i + 1] = light ? 246 : 66;
        img.data[i + 2] = light ? 220 : 26;
        img.data[i + 3] = Math.abs(v - 0.5) * 2 * 46;
      }
      c.putImageData(img, 0, 0);
      return (grainTile = t);
    }

    function star(c, x, y, r) {
      const k = r * 0.22;
      c.beginPath();
      c.moveTo(x, y - r);
      c.lineTo(x + k, y - k); c.lineTo(x + r, y); c.lineTo(x + k, y + k);
      c.lineTo(x, y + r); c.lineTo(x - k, y + k); c.lineTo(x - r, y); c.lineTo(x - k, y - k);
      c.closePath();
    }

    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    // draws a shape three times (shadow up-left, light down-right, then the face) so it reads as engraved
    function engrave(c, draw, s, face) {
      c.save();
      c.translate(-s, -s); draw("rgba(84, 60, 22, .55)");
      c.translate(2 * s, 2 * s); draw("rgba(255, 249, 230, .7)");
      c.restore();
      draw(face);
    }

    function paintFoil() {
      const c = foil.getContext("2d");
      const w = foil.width, h = foil.height, s = DPR;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
      c.clearRect(0, 0, w, h);

      // brushed metal: a broad diagonal gold gradient
      let g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#a8874a");
      g.addColorStop(0.2, "#d8bf88");
      g.addColorStop(0.38, "#c8a96a");
      g.addColorStop(0.54, "#f1e2bb");
      g.addColorStop(0.7, "#bf9e5f");
      g.addColorStop(0.86, "#e4d2a6");
      g.addColorStop(1, "#a8874a");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);

      // a pool of light from the top left
      g = c.createRadialGradient(w * 0.28, h * 0.18, 0, w * 0.28, h * 0.18, w * 0.85);
      g.addColorStop(0, "rgba(255, 248, 226, .38)");
      g.addColorStop(1, "rgba(255, 248, 226, 0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);

      // fine brushed streaks
      for (let y = 0; y < h; y += 1.5 * s) {
        const a = Math.random() * 0.07;
        c.fillStyle = Math.random() > 0.5 ? `rgba(255, 249, 232, ${a})` : `rgba(110, 80, 32, ${a * 0.8})`;
        c.fillRect(0, y, w, s * (0.5 + Math.random()));
      }

      // grain
      c.fillStyle = c.createPattern(grain(), "repeat");
      c.fillRect(0, 0, w, h);

      // static diagonal sheen bands
      c.save();
      c.translate(w / 2, h / 2);
      c.rotate(-0.62);
      [[-0.32, 0.16, 0.22], [0.12, 0.07, 0.16], [0.36, 0.1, 0.1]].forEach(([off, bw, a]) => {
        const x = off * w * 1.4, half = bw * w;
        const sg = c.createLinearGradient(x - half, 0, x + half, 0);
        sg.addColorStop(0, "rgba(255, 252, 240, 0)");
        sg.addColorStop(0.5, `rgba(255, 252, 240, ${a})`);
        sg.addColorStop(1, "rgba(255, 252, 240, 0)");
        c.fillStyle = sg;
        c.fillRect(x - half, -h * 1.5, half * 2, h * 3);
      });
      c.restore();

      // edge vignette for depth
      g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.58);
      g.addColorStop(0, "rgba(96, 68, 24, 0)");
      g.addColorStop(1, "rgba(96, 68, 24, .32)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);

      // engraved double frame
      const inset = Math.round(w * 0.045);
      const r = w * 0.03;
      c.lineWidth = s;
      engrave(c, (col) => {
        c.strokeStyle = col;
        roundRect(c, inset, inset, w - inset * 2, h - inset * 2, r);
        c.stroke();
        roundRect(c, inset + 5 * s, inset + 5 * s, w - (inset + 5 * s) * 2, h - (inset + 5 * s) * 2, r * 0.6);
        c.stroke();
      }, s * 0.8, "rgba(150, 118, 58, .55)");

      // the engraved label: "Scratch here ✦"
      const fontPx = Math.max(18, Math.min(42, W * 0.085));
      c.font = labelFont(fontPx * s);
      c.textAlign = "left";
      c.textBaseline = "middle";
      const text = labelText();
      const tw = c.measureText(text).width;
      const starR = fontPx * s * 0.3;
      const gap = fontPx * s * 0.42;
      const total = tw + gap + starR * 2;
      const x0 = (w - total) / 2;
      const cy = h * 0.47 + (App.lang === "te" ? fontPx * s * 0.06 : 0);
      const faceGrad = c.createLinearGradient(0, cy - fontPx * s, 0, cy + fontPx * s);
      faceGrad.addColorStop(0, "#9c7c40");
      faceGrad.addColorStop(1, "#7d602b");
      engrave(c, (col) => {
        c.fillStyle = col;
        c.fillText(text, x0, cy);
        star(c, x0 + tw + gap + starR, cy - fontPx * s * 0.04, starR);
        c.fill();
      }, s, faceGrad);

      // small engraved ornament lines above and below the label
      const ow = Math.min(total * 0.55, w * 0.32);
      [cy - fontPx * s * 1.05, cy + fontPx * s * 1.05].forEach((oy) => {
        engrave(c, (col) => {
          c.strokeStyle = col;
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(w / 2 - ow / 2, oy); c.lineTo(w / 2 - 6 * s, oy);
          c.moveTo(w / 2 + 6 * s, oy); c.lineTo(w / 2 + ow / 2, oy);
          c.stroke();
          star(c, w / 2, oy, 3.2 * s);
          c.fill();
        }, s * 0.7, "rgba(140, 108, 50, .6)");
      });

      // glitter: where the twinkles appear
      glitter = Array.from({ length: Math.round((W * H) / 5200) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: (1.6 + Math.random() * 2.6) * s,
        speed: 0.6 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
      }));
      dirty = true;
    }

    /* ---------- compositing the visible layer ---------- */
    const SWEEP_EVERY = 4200, SWEEP_LEN = 1500;
    function render(now) {
      const w = canvas.width, h = canvas.height, s = DPR;
      if (!w || !h) return;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(foil, 0, 0);

      if (!reduce) {
        const t = (now - t0) / 1000;
        // the travelling sheen
        const p = ((now - t0 + 600) % SWEEP_EVERY) / SWEEP_LEN;
        if (p <= 1) {
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.translate(w / 2, h / 2);
          ctx.rotate(-0.62);
          const x = (-0.95 + e * 1.9) * w;
          const half = w * 0.16;
          const sg = ctx.createLinearGradient(x - half, 0, x + half, 0);
          sg.addColorStop(0, "rgba(255, 244, 214, 0)");
          sg.addColorStop(0.5, "rgba(255, 244, 214, .34)");
          sg.addColorStop(1, "rgba(255, 244, 214, 0)");
          ctx.fillStyle = sg;
          ctx.fillRect(x - half, -h * 1.5, half * 2, h * 3);
          ctx.restore();
        }
        // glitter
        ctx.save();
        ctx.fillStyle = "#fffaf0";
        for (const g of glitter) {
          const a = Math.pow(Math.max(0, Math.sin(t * g.speed + g.phase)), 14);
          if (a < 0.04) continue;
          ctx.globalAlpha = a * 0.95;
          star(ctx, g.x, g.y, g.r * (0.6 + a * 0.6));
          ctx.fill();
        }
        ctx.restore();
      }

      // cut away the scratched parts
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "source-over";

      // flakes ride on top
      if (flakes.length) {
        for (let i = flakes.length - 1; i >= 0; i--) {
          const f = flakes[i];
          f.vy += 0.16 * s;
          f.x += f.vx; f.y += f.vy;
          f.rot += f.vr;
          f.life -= 0.022;
          if (f.life <= 0 || f.y > h + 10) { flakes.splice(i, 1); continue; }
          ctx.save();
          ctx.globalAlpha = Math.min(1, f.life * 1.4);
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);
          ctx.scale(1, Math.cos(f.rot * 1.7));   // tumbling
          ctx.fillStyle = f.color;
          ctx.fillRect(-f.r, -f.r * 0.6, f.r * 2, f.r * 1.2);
          ctx.restore();
        }
      }
    }

    function frame(now) {
      raf = 0;
      if (revealed) return;
      const animating = !reduce && visible;
      if (dirty || flakes.length || (animating && now - lastFrame > 30)) {
        render(now);
        lastFrame = now;
        dirty = false;
      }
      if (animating || flakes.length || drawing) raf = requestAnimationFrame(frame);
    }
    function kick() {
      if (!raf && !revealed) raf = requestAnimationFrame(frame);
    }

    /* ---------- scratching ---------- */
    const FLAKE_COLORS = ["#e4d2a6", "#c8a96a", "#f4e7c4", "#a8874a"];

    function toLocal(e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / (r.width || 1)) * canvas.width,
        y: ((e.clientY - r.top) / (r.height || 1)) * canvas.height,
      };
    }

    function scratch(a, b) {
      if (!mctx) return;
      const lw = BRUSH * DPR;
      mctx.globalCompositeOperation = "destination-out";
      mctx.lineCap = "round";
      mctx.lineJoin = "round";
      mctx.lineWidth = lw;
      mctx.beginPath();
      mctx.moveTo(a.x, a.y);
      mctx.lineTo(b.x + (a === b ? 0.01 : 0), b.y);
      mctx.stroke();
      // ragged edges: a few specks bitten out along the stroke
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.round(dist / (lw * 0.45)));
      mctx.fillStyle = "rgba(0,0,0,.75)";
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const ang = Math.random() * Math.PI * 2;
        const rr = lw * (0.48 + Math.random() * 0.12);
        mctx.beginPath();
        mctx.arc(a.x + (b.x - a.x) * t + Math.cos(ang) * rr, a.y + (b.y - a.y) * t + Math.sin(ang) * rr, lw * (0.05 + Math.random() * 0.07), 0, Math.PI * 2);
        mctx.fill();
      }
      mctx.globalCompositeOperation = "source-over";

      if (!reduce && flakes.length < 90) {
        const n = Math.min(3, 1 + Math.floor(dist / (12 * DPR)));
        for (let i = 0; i < n; i++) {
          flakes.push({
            x: b.x + (Math.random() - 0.5) * lw * 0.8,
            y: b.y + (Math.random() - 0.5) * lw * 0.8,
            vx: (Math.random() - 0.5) * 2.4 * DPR,
            vy: (-0.6 - Math.random() * 1.8) * DPR,
            r: (1.2 + Math.random() * 2.2) * DPR,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.4,
            life: 0.8 + Math.random() * 0.5,
            color: FLAKE_COLORS[(Math.random() * FLAKE_COLORS.length) | 0],
          });
        }
      }
      dirty = true;
      kick();
    }

    /* ---------- coverage ---------- */
    function measure() {
      if (!sctx || !mask.width) return cleared;
      sctx.globalCompositeOperation = "copy";
      sctx.drawImage(mask, 0, 0, SAMPLE_W, SAMPLE_H);
      const d = sctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
      let open = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 128) open++;
      return open / (SAMPLE_W * SAMPLE_H);
    }
    function check() {
      clearTimeout(checkT);
      checkT = 0;
      lastCheck = performance.now();
      if (revealed) return;
      cleared = measure();
      const step = Math.floor(cleared * 10);
      if (step > lastMilestone) {
        lastMilestone = step;
        if (App.isTouch && step < 5) App.haptic(6);
      }
      if (cleared >= THRESHOLD) finish({ animate: true, celebrate: true });
    }
    function scheduleCheck() {
      const since = performance.now() - lastCheck;
      if (since > 140) check();
      else if (!checkT) checkT = setTimeout(check, 140 - since);
    }

    function touched() {
      if (!root.classList.contains("is-touched")) root.classList.add("is-touched");
    }

    canvas.addEventListener("pointerdown", (e) => {
      if (revealed) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      drawing = true;
      pid = e.pointerId;
      try { canvas.setPointerCapture(pid); } catch (_) {}
      touched();
      last = toLocal(e);
      scratch(last, last);
      scheduleCheck();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing || e.pointerId !== pid) return;
      const list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      (list.length ? list : [e]).forEach((ev) => {
        const p = toLocal(ev);
        scratch(last, p);
        last = p;
      });
      scheduleCheck();
    });
    const end = (e) => {
      if (!drawing || (e && e.pointerId !== pid)) return;
      drawing = false;
      pid = null;
      check();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("lostpointercapture", end);
    // no text selection from a mouse drag, no long-press menu / magnifier on the card
    canvas.addEventListener("mousedown", (e) => e.preventDefault());
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    if (button) button.addEventListener("click", () => finish({ animate: true, celebrate: true }));

    /* ---------- visibility: only animate while on screen ---------- */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        root.classList.toggle("is-offscreen", !visible);
        if (visible) { dirty = true; kick(); }
      }, { rootMargin: "80px 0px" }).observe(ticket);
    } else {
      visible = true;
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else { dirty = true; kick(); }
    });

    /* ---------- resize and language ---------- */
    const relayout = () => {
      if (revealed) return;
      if (setup()) { render(performance.now()); kick(); }
    };
    if ("ResizeObserver" in window) new ResizeObserver(relayout).observe(canvas);
    App.on("resize", relayout);

    let relabelT = 0;
    const relabel = () => {
      if (revealed || !foil.width) return;
      clearTimeout(relabelT);
      relabelT = setTimeout(() => {
        loadLabelFont().then(() => {
          if (revealed) return;
          paintFoil();
          render(performance.now());
          kick();
        });
      }, 30);
    };
    App.on("lang", relabel);
    // the Telugu web fonts arrive after the switch: engrave again once they land
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener("loadingdone", relabel);
    }

    /* ---------- first paint ---------- */
    setup();
    render(performance.now());
    loadLabelFont().then(() => {
      if (revealed) return;
      paintFoil();
      render(performance.now());
      kick();
    });
    kick();
    entrance();

    /* ---------- the reveal ---------- */
    function finish({ animate, celebrate }) {
      if (revealed) return;
      revealed = true;
      drawing = false;
      session.set();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      clearTimeout(checkT);

      const hadFocus = button && document.activeElement === button;
      root.classList.add("is-revealed", "is-touched");
      if (hadFocus && msg) msg.focus({ preventScroll: true });

      const done = () => {
        canvas.style.visibility = "hidden";
        canvas.width = canvas.height = 0;   // free the bitmap
        foil.width = foil.height = 0;
        mask.width = mask.height = 0;
        flakes = [];
      };
      if (!animate) done();
      else if (gsap && !reduce) {
        gsap.to(canvas, { opacity: 0, scale: 1.035, duration: 0.95, ease: "power2.out", onComplete: done });
        gsap.fromTo($(".reveal-date__digits"), { scale: 0.94 }, { scale: 1, duration: 1.4, ease: "elastic.out(1, .5)", clearProps: "transform" });
      } else {
        canvas.style.transition = "opacity .25s linear";
        canvas.style.opacity = "0";
        setTimeout(done, 280);
      }

      if (celebrate) {
        const r = ticket.getBoundingClientRect();
        try { App.fx.burst({ x: r.left + r.width / 2, y: r.top + r.height / 2, kind: "confetti" }); } catch (_) {}
        App.haptic([20, 40, 20]);
      }
    }

    /* ---------- entrance: the ticket slides up and settles ---------- */
    function entrance() {
      if (!gsap || !App.ScrollTrigger || reduce) return;
      whenOpen(() => {
        const head = [$(".reveal-date__eyebrow"), $(".reveal-date__title")].filter(Boolean);
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root, start: "top 72%", once: true },
          defaults: { ease: "expo.out" },
        });
        tl.from(head, { y: 36, opacity: 0, duration: 1.2, stagger: 0.12, clearProps: "transform,opacity" })
          .from($(".reveal-date__shadow"), {
            y: 70, rotationX: 24, scale: 0.92, opacity: 0, transformPerspective: 900, transformOrigin: "50% 100%",
            duration: 1.5, clearProps: "transform,opacity",
          }, 0.15)
          .from($(".reveal-date__after"), { y: 20, opacity: 0, duration: 1, clearProps: "transform,opacity" }, 0.55);
      });
    }
  });
})();
