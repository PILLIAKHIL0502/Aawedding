/* ==========================================================
   particles.js — one fixed full-screen canvas for the whole page.

   1. Ambient petals (blush / ivory / gold / sage) drift down once the
      invitation is open. They react to scroll velocity: a fast scroll makes
      them swirl, tumble and rush, then they settle again.
   2. App.fx.burst({ x, y, kind, count, spread }) — a pooled physics burst
      (confetti | petals | hearts | sparkles) with gravity, drag, rotation and
      fade. x / y are viewport px and default to the centre of the screen.

   The rAF loop runs only while ambient petals are on or burst particles are
   alive, and pauses while the tab is hidden. Reduced motion: nothing is drawn.
   ========================================================== */
(function () {
  const App = window.App;
  if (!App) return;

  const CAP = 400;                       // max live burst particles
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  /* ---------- palette: base.css tokens and tints of them ---------- */
  const PAL = {
    blush: ["#e8c4b8", "#f3e1da"],
    ivory: ["#fbf7f0", "#efe5d3"],
    gold: ["#c8a96a", "#e4d2a6"],
    goldDeep: ["#a8874a", "#e4d2a6"],
    sage: ["#8ba888", "#c9d6c6"],
    emerald: ["#1f3d36", "#3c5c53"],
  };
  const PETAL_COLORS = ["blush", "blush", "ivory", "gold", "sage"];
  const KIND_COLORS = {
    confetti: ["gold", "gold", "goldDeep", "blush", "sage", "ivory", "emerald"],
    petals: PETAL_COLORS,
    hearts: ["blush", "blush", "gold", "goldDeep"],
    sparkles: ["gold", "ivory"],
  };

  /* ---------- canvas (created lazily so a burst works even before "open") ---------- */
  let canvas = null, ctx = null;
  let W = 0, H = 0, dpr = 1;

  function ensureCanvas() {
    if (canvas) return true;
    if (!document.body) return false;
    canvas = document.createElement("canvas");
    canvas.className = "fx-particles";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:60;";
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    if (!ctx) { canvas.remove(); canvas = null; return false; }
    resize();
    return true;
  }

  function resize() {
    if (!canvas) return;
    const nd = Math.min(window.devicePixelRatio || 1, 2);
    const nw = canvas.clientWidth || window.innerWidth;
    const nh = canvas.clientHeight || window.innerHeight;
    if (nw === W && nh === H && nd === dpr) return;
    const oldW = W || nw, oldH = H || nh;
    W = nw; H = nh;
    if (nd !== dpr) { dpr = nd; sprites.clear(); }
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // keep ambient petals where they were, proportionally
    for (const p of petals) { p.x = (p.x / oldW) * W; p.y = (p.y / oldH) * H; }
    syncPetalCount();
  }

  /* ---------- sprites: each shape × colour is pre-rendered once ---------- */
  const SPRITE = 32;                      // logical sprite box (css px)
  const sprites = new Map();

  function shapePath(c, shape) {
    c.beginPath();
    switch (shape) {
      case "petal": // a rose petal: rounded top, notched, tapering to the base
        c.moveTo(16, 30);
        c.bezierCurveTo(6.5, 24, 3, 14, 6.5, 7);
        c.bezierCurveTo(9, 3, 13, 2.5, 16, 5.2);
        c.bezierCurveTo(19, 2.5, 23, 3, 25.5, 7);
        c.bezierCurveTo(29, 14, 25.5, 24, 16, 30);
        break;
      case "heart":
        c.moveTo(16, 28.5);
        c.bezierCurveTo(6, 21.5, 2, 15.5, 2, 10.5);
        c.bezierCurveTo(2, 6, 5.4, 3, 9.4, 3);
        c.bezierCurveTo(12.4, 3, 14.8, 4.8, 16, 7.3);
        c.bezierCurveTo(17.2, 4.8, 19.6, 3, 22.6, 3);
        c.bezierCurveTo(26.6, 3, 30, 6, 30, 10.5);
        c.bezierCurveTo(30, 15.5, 26, 21.5, 16, 28.5);
        break;
      case "ribbon":
        c.rect(9, 3, 14, 26);
        break;
      case "dot":
        c.arc(16, 16, 9, 0, TAU);
        break;
      case "sparkle": // four-point star
        c.moveTo(16, 1);
        c.quadraticCurveTo(17.6, 14.4, 31, 16);
        c.quadraticCurveTo(17.6, 17.6, 16, 31);
        c.quadraticCurveTo(14.4, 17.6, 1, 16);
        c.quadraticCurveTo(14.4, 14.4, 16, 1);
        break;
    }
    c.closePath();
  }

  function sprite(shape, color) {
    const key = shape + ":" + color;
    let s = sprites.get(key);
    if (s) return s;
    const res = Math.ceil(SPRITE * dpr * 1.5);
    s = document.createElement("canvas");
    s.width = s.height = res;
    const c = s.getContext("2d");
    c.scale(res / SPRITE, res / SPRITE);
    const [base, light] = PAL[color] || PAL.gold;

    if (shape === "sparkle") {
      const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(251,247,240,.95)");
      g.addColorStop(0.35, hexA(light, 0.5));
      g.addColorStop(1, hexA(base, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, 32, 32);
      shapePath(c, "sparkle");
      c.fillStyle = light;
      c.fill();
    } else {
      shapePath(c, shape);
      const g = c.createLinearGradient(6, 2, 26, 30);
      g.addColorStop(0, light);
      g.addColorStop(0.55, base);
      g.addColorStop(1, base);
      c.fillStyle = g;
      c.fill();
      if (shape === "petal" || shape === "heart") {
        // a soft edge so ivory petals still read on the ivory page
        c.lineWidth = 0.9;
        c.strokeStyle = color === "ivory" ? "rgba(168,135,74,.35)" : "rgba(15,32,28,.10)";
        c.stroke();
        // a highlight vein / sheen
        c.beginPath();
        if (shape === "petal") { c.moveTo(16, 27); c.quadraticCurveTo(14.2, 16, 16, 7.5); }
        else { c.ellipse(10, 9.5, 3.2, 2, -0.6, 0, TAU); }
        c.strokeStyle = "rgba(251,247,240,.55)";
        c.lineWidth = shape === "petal" ? 0.8 : 1.6;
        c.stroke();
      }
    }
    sprites.set(key, s);
    return s;
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /* ---------- ambient petals ---------- */
  const petals = [];
  let ambientOn = false;
  let ambientAlpha = 0;                  // global fade in/out
  let scrollV = 0;                       // smoothed scroll velocity (px per 60fps frame)
  let lastScrollY = window.scrollY || 0;
  let wind = 0;

  function petalTarget() {
    // ~14 on a 320x568 phone, ~30 on a 1920x1080 desktop (scaled by viewport area)
    const s = Math.sqrt(Math.max(1, W * H));
    return Math.round(App.clamp(14 + ((s - 426) / 1014) * 16, 12, 32));
  }

  function makePetal(p, anywhere) {
    p = p || {};
    const z = rand(0.55, 1);              // depth: nearer petals are bigger, faster, stronger
    p.z = z;
    p.x = rand(-10, W + 10);
    p.y = anywhere ? rand(-0.35 * H, H * 0.95) : rand(-60, -20);
    p.size = rand(10, 17) * z;
    p.fall = rand(24, 48) * (0.55 + z * 0.6);
    p.sway = rand(12, 34);
    p.swayF = rand(0.5, 1.15);
    p.phase = rand(0, TAU);
    p.rot = rand(0, TAU);
    p.vr = rand(-1.1, 1.1);
    p.flip = rand(0, TAU);
    p.vflip = rand(1, 2.6) * (Math.random() < 0.5 ? -1 : 1);
    p.alpha = rand(0.55, 0.9) * (0.6 + z * 0.4);
    p.color = pick(PETAL_COLORS);
    p.svx = 0; p.svy = 0;                 // scroll-induced velocity (with inertia)
    return p;
  }

  function syncPetalCount() {
    if (!ambientOn) return;
    const n = petalTarget();
    while (petals.length < n) petals.push(makePetal(null, true));
    if (petals.length > n) petals.length = n;
  }

  function readScrollVelocity() {
    const y = window.scrollY || 0;
    let raw;
    if (App.lenis && typeof App.lenis.velocity === "number") raw = App.lenis.velocity;
    else raw = y - lastScrollY;
    lastScrollY = y;
    raw = App.clamp(raw || 0, -90, 90);
    scrollV += (raw - scrollV) * 0.14;
    if (Math.abs(scrollV) < 0.01) scrollV = 0;
  }

  function updatePetals(dt, t) {
    readScrollVelocity();
    wind += ((App.tilt ? App.tilt.x : 0) * 22 - wind) * Math.min(1, dt * 1.2);
    const energy = Math.min(1.6, Math.abs(scrollV) / 26);   // 0 at rest, ~1.6 on a hard flick
    const k = Math.min(1, dt * 3.2);                          // inertia: petals lag, then settle

    for (const p of petals) {
      const z = p.z;
      // scroll pushes petals against the scroll direction (they hang in the air while the page rushes by)
      const tvy = -scrollV * 60 * 0.28 * z;
      const swirl = Math.sin(t * (1.7 + p.swayF) + p.phase) * energy * 140 * z;
      p.svy += (tvy - p.svy) * k;
      p.svx += (swirl - p.svx) * k;

      const fall = p.fall * (1 + energy * 1.4);
      p.x += (Math.sin(t * p.swayF + p.phase) * p.sway * 0.9 + wind * z + p.svx) * dt;
      p.y += (fall + p.svy) * dt;
      p.rot += p.vr * (1 + energy * 4) * dt;
      p.flip += p.vflip * (1 + energy * 3) * dt;

      if (p.y > H + 30) { makePetal(p, false); }
      else if (p.y < -60) { makePetal(p, false); p.y = H + 24; }
      if (p.x < -40) p.x = W + 30;
      else if (p.x > W + 40) p.x = -30;
    }
  }

  function drawPetals() {
    const a = ambientAlpha;
    if (a <= 0.001) return;
    for (const p of petals) {
      const fy = Math.cos(p.flip);
      // a tumbling petal never goes perfectly edge-on (it would vanish)
      const sy = (Math.abs(fy) < 0.18 ? 0.18 * Math.sign(fy || 1) : fy);
      drawSprite(sprite("petal", p.color), p.x, p.y, p.rot, p.size, sy, p.alpha * a);
    }
  }

  /* ---------- burst particles (pooled) ---------- */
  const alive = [];
  const pool = [];
  let recycle = 0;

  function spawn() {
    if (alive.length >= CAP) {
      // reuse the oldest-ish slot so a new burst always looks full
      recycle = (recycle + 1) % alive.length;
      return alive[recycle];
    }
    const p = pool.pop() || {};
    alive.push(p);
    return p;
  }

  const KINDS = {
    //            speed       cone(rad)  up-bias  gravity        drag  life        size
    confetti: { s: [380, 920], cone: 2.4, up: 1, g: [820, 1000], drag: 2.1, life: [1.8, 2.8], size: [8, 13] },
    petals: { s: [200, 560], cone: TAU, up: 0.35, g: [180, 280], drag: 1.7, life: [2.4, 3.6], size: [12, 20] },
    hearts: { s: [180, 520], cone: TAU, up: 0.45, g: [-60, 150], drag: 2.0, life: [1.5, 2.5], size: [13, 26] },
    sparkles: { s: [90, 440], cone: TAU, up: 0.15, g: [10, 60], drag: 2.9, life: [0.7, 1.3], size: [9, 18] },
  };

  function burst(opts) {
    const o = opts || {};
    if (App.reduceMotion) return;
    if (!ensureCanvas()) return;
    resize();
    const kind = KINDS[o.kind] ? o.kind : "confetti";
    const K = KINDS[kind];
    const x = Number.isFinite(o.x) ? o.x : W / 2;
    const y = Number.isFinite(o.y) ? o.y : H / 2;
    const spread = Number.isFinite(o.spread) ? App.clamp(o.spread, 0.1, 4) : 1;
    const count = App.clamp(Math.round(Number.isFinite(o.count) ? o.count : 60), 1, CAP);
    const colors = KIND_COLORS[kind];
    // keep phones light: scale counts down a little on small screens
    const n = W * H < 400000 ? Math.ceil(count * 0.8) : count;

    for (let i = 0; i < n; i++) {
      const p = spawn();
      const ang = K.cone >= TAU ? rand(0, TAU) : -Math.PI / 2 + rand(-K.cone / 2, K.cone / 2);
      const sp = rand(K.s[0], K.s[1]) * spread;
      p.kind = kind;
      p.x = x + rand(-6, 6) * spread;
      p.y = y + rand(-6, 6) * spread;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp - K.up * rand(120, 260) * spread;
      p.g = rand(K.g[0], K.g[1]);
      p.drag = K.drag * rand(0.85, 1.15);
      p.age = 0;
      p.life = rand(K.life[0], K.life[1]);
      p.size = rand(K.size[0], K.size[1]) * (0.75 + 0.25 * Math.min(spread, 1.6));
      p.rot = kind === "hearts" ? rand(-0.4, 0.4) : rand(0, TAU);
      p.vr = kind === "hearts" ? rand(-1.2, 1.2) : rand(-7, 7);
      p.flip = rand(0, TAU);
      p.vflip = kind === "confetti" ? rand(6, 14) : kind === "petals" ? rand(2, 5) : 0;
      p.phase = rand(0, TAU);
      p.flutter = kind === "petals" ? rand(40, 90) : kind === "confetti" ? rand(20, 50) : kind === "hearts" ? rand(10, 30) : 0;
      p.color = pick(colors);
      p.shape = kind === "confetti" ? (Math.random() < 0.72 ? "ribbon" : "dot")
        : kind === "petals" ? "petal" : kind === "hearts" ? "heart" : "sparkle";
    }
    kick();
  }

  function updateBursts(dt) {
    for (let i = alive.length - 1; i >= 0; i--) {
      const p = alive[i];
      p.age += dt;
      if (p.age >= p.life || p.y > H + 80) {
        alive[i] = alive[alive.length - 1];
        alive.pop();
        pool.push(p);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.g * dt;
      p.x += (p.vx + Math.sin(p.age * 6 + p.phase) * p.flutter) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.vflip * dt;
    }
  }

  function drawBursts() {
    for (const p of alive) {
      const t = p.age / p.life;
      const fadeIn = Math.min(1, p.age / 0.06);
      const fadeOut = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      let s = p.size, sy = 1;
      if (p.kind === "hearts") s *= 0.6 + 0.4 * Math.min(1, p.age / 0.18) + Math.sin(p.age * 9 + p.phase) * 0.04;
      else if (p.kind === "sparkles") s *= 0.55 + 0.45 * Math.abs(Math.sin(p.age * 11 + p.phase));
      if (p.vflip) sy = Math.cos(p.flip);
      drawSprite(sprite(p.shape, p.color), p.x, p.y, p.rot, s, sy, fadeIn * fadeOut);
    }
  }

  function drawSprite(img, x, y, rot, size, sy, alpha) {
    if (alpha <= 0.002) return;
    const c = Math.cos(rot) * dpr, s = Math.sin(rot) * dpr;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    // translate(x, y) · rotate(rot) · scale(1, sy), all in device pixels
    ctx.setTransform(c, s, -s * sy, c * sy, x * dpr, y * dpr);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  }

  /* ---------- the loop ---------- */
  let raf = 0, last = 0, clock = 0;

  function needsLoop() {
    return !document.hidden && (ambientOn || ambientAlpha > 0 || alive.length > 0);
  }

  function kick() {
    if (raf || !canvas || !needsLoop()) return;
    last = performance.now();
    lastScrollY = window.scrollY || 0;
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;

    ambientAlpha = App.clamp(ambientAlpha + (ambientOn ? dt / 1.6 : -dt / 0.8), 0, 1);
    if (!ambientOn && ambientAlpha === 0) petals.length = 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (petals.length) { updatePetals(dt, clock); drawPetals(); }
    if (alive.length) { updateBursts(dt); drawBursts(); }

    if (needsLoop()) raf = requestAnimationFrame(frame);
    else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function startAmbient() {
    if (App.reduceMotion || ambientOn) return;
    if (!ensureCanvas()) return;
    ambientOn = true;
    resize();
    syncPetalCount();
    kick();
  }
  function stopAmbient() {
    ambientOn = false;   // fades out, then the loop stops by itself
  }

  /* ---------- wiring ---------- */
  let resizeQueued = false;
  window.addEventListener("resize", () => {
    if (resizeQueued || !canvas) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; resize(); });
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else {
      kick();
    }
  });

  // The burst API exists from script load, so the intro can use it before "open".
  const api = {
    petals: {
      start: startAmbient, stop: stopAmbient,
      get on() { return ambientOn; },
      get count() { return petals.length; },
      get scrollVelocity() { return scrollV; },
    },
  };
  /* App.fx.burst({ x, y, kind, count, spread }). A positional call, burst(x, y, opts),
     degrades gracefully to a small sparkle burst at that point. */
  function publicBurst(a, b, c) {
    if (typeof a === "number") {
      const o = c && typeof c === "object" ? c : {};
      return burst({ x: a, y: b, kind: KINDS[o.kind] ? o.kind : "sparkles", count: Number.isFinite(o.count) ? o.count : 16, spread: 0.6 });
    }
    return burst(a);
  }

  function attach() {
    if (!App.fx || typeof App.fx !== "object") App.fx = {};
    App.fx.burst = publicBurst;
    App.fx.petals = api.petals;
    if (!Object.getOwnPropertyDescriptor(App.fx, "particleCount")) {
      Object.defineProperty(App.fx, "particleCount", { get: () => alive.length, configurable: true });
    }
  }
  attach();

  App.module("particles", () => {
    attach();   // in case another script replaced App.fx wholesale after this one loaded
    const go = () => { attach(); startAmbient(); };
    if (App.state.opened) go();
    else App.on("open", go);
  });
})();
