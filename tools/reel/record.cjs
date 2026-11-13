/* ==========================================================
   Reel recorder: renders the live invitation into a 9:16 video, frame by frame.

   How it works: before the page loads, the page's clock is replaced with a virtual one
   (requestAnimationFrame, timers, performance.now, Date, CSS/Web animations, Math.random).
   The script then advances that clock exactly 1/fps per frame, drives the same interactions a
   guest would (tap the seal, open, scroll, flip, scratch, hold the heart), and screenshots each
   frame. Every animation lands exactly on its frame, however slow the machine.

   Usage (from the repo root):
     node tools/reel/record.cjs --fps=60 --scale=5 --lang=en --out=reel/frames-en
     then tools/reel/encode.sh reel/frames-en 60 reel/akhil-alekhya-reel-en
   Options: --from=N --to=N renders only that frame range (for split rendering);
            --dry renders no screenshots (timing check).
   ========================================================== */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v = "1"] = a.replace(/^--/, "").split("=");
  return [k, v];
}));
const FPS = +args.fps || 60;
const SCALE = +args.scale || 5;          // 432x768 CSS px x5 = 2160x3840 (4K vertical)
const LANG = args.lang || "en";
const OUT = args.out || "reel/frames";
const FROM = +args.from || 0;
const TO = args.to ? +args.to : Infinity;
const DRY = !!args.dry;
const PORT = +args.port || 8899;
const W = 432, H = 768;
const ROOT = path.resolve(__dirname, "../..");

/* ---------- virtual clock, injected before any page script ---------- */
const VIRTUAL_TIME = () => {
  const RealDate = Date;
  const BASE = RealDate.now();
  let vnow = 0;
  let seed = 20261129;
  window.__reseed = () => { seed = 20261129; };   // called at the start of the film, so split renders match
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  window.__realRAF = window.requestAnimationFrame.bind(window);
  const rafQ = new Map();
  let rafId = 0;
  window.requestAnimationFrame = (cb) => { rafQ.set(++rafId, cb); return rafId; };
  window.cancelAnimationFrame = (id) => { rafQ.delete(id); };
  let timers = [];
  let tid = 0;
  const add = (fn, ms, a, every) => { const id = ++tid; timers.push({ id, at: vnow + Math.max(0, +ms || 0), fn, a, every }); return id; };
  window.setTimeout = (fn, ms, ...a) => add(fn, ms, a, 0);
  window.setInterval = (fn, ms, ...a) => add(fn, ms, a, Math.max(4, +ms || 4));
  window.clearTimeout = window.clearInterval = (id) => { timers = timers.filter((t) => t.id !== id); };
  window.requestIdleCallback = (cb) => add(() => cb({ didTimeout: false, timeRemaining: () => 12 }), 1, [], 0);
  window.cancelIdleCallback = window.clearTimeout;
  performance.now = () => vnow;
  class VDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(BASE + vnow); else super(...a); }
    static now() { return BASE + vnow; }
  }
  window.Date = VDate;

  // CSS animations/transitions run on the compositor clock: pause each one and set its time from
  // the virtual clock instead.
  const track = new WeakMap();
  const syncAnimations = () => {
    for (const an of document.getAnimations()) {
      let t = track.get(an);
      if (!t) { t = { v0: vnow }; track.set(an, t); }
      try {
        if (an.playState === "finished") continue;
        an.pause();
        const ct = (vnow - t.v0) * (an.playbackRate || 1);
        const end = an.effect && an.effect.getComputedTiming().endTime;
        if (Number.isFinite(end) && ct >= end) an.finish();
        else an.currentTime = ct;
      } catch (_) {}
    }
  };

  window.__vt = {
    get now() { return vnow; },
    step(ms) {
      const target = vnow + ms;
      for (let guard = 0; guard < 10000; guard++) {
        timers.sort((x, y) => x.at - y.at || x.id - y.id);
        const t = timers[0];
        if (!t || t.at > target) break;
        vnow = Math.max(vnow, t.at);
        if (t.every) t.at += t.every; else timers.shift();
        try { typeof t.fn === "function" ? t.fn(...(t.a || [])) : (0, eval)(t.fn); } catch (e) { console.error(e); }
      }
      vnow = target;
      const cbs = [...rafQ.values()];
      rafQ.clear();
      for (const cb of cbs) { try { cb(vnow); } catch (e) { console.error(e); } }
      syncAnimations();
    },
  };
};

/* ---------- helpers ---------- */
const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  linear: (t) => t,
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn("node", ["scripts/dev.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  await wait(800);

  const browser = await chromium.launch({ args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  await ctx.addInitScript(VIRTUAL_TIME);
  // the luxurious (desktop) variant of the hero entrance
  await ctx.addInitScript(() => Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("PAGEERROR", e.message));

  await page.goto(`http://localhost:${PORT}/?lang=${LANG}`);
  // UI chrome that doesn't belong in a film: language toggle, player, cursor, progress bars
  await page.addStyleTag({ content: `
    .lang-toggle, #player, .fx-progress, .fx-nav, .fx-pointer, .fx-root, .day__progress, .toast { opacity: 0 !important; visibility: hidden !important; }
    html, body { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }` });

  // boot: let fonts load (real time) while the virtual clock ticks, until modules are up
  for (let i = 0; i < 200; i++) {
    await page.evaluate(() => window.__vt.step(50));
    await wait(40);
    const ready = await page.evaluate(() => !!(window.ScrollTrigger && ScrollTrigger.getAll().length && document.fonts.status === "loaded"));
    if (ready && i > 30) break;
  }
  for (let i = 0; i < 30; i++) { await page.evaluate(() => window.__vt.step(1000 / 30)); await wait(10); }

  /* ---------- frame engine ---------- */
  let frame = 0;
  const frameMs = 1000 / FPS;
  const sec = (s) => Math.max(1, Math.round(s * FPS));
  const t0 = Date.now();
  let drift = { on: false, t: 0 };

  async function tick(n, perFrame) {
    for (let i = 0; i < n; i++) {
      if (perFrame) await perFrame(i, n);
      if (drift.on) {
        drift.t += frameMs / 1000;
        await page.mouse.move(W / 2 + Math.sin(drift.t * 0.9) * W * 0.28, H / 2 + Math.cos(drift.t * 0.7) * H * 0.18);
      }
      await page.evaluate((ms) => window.__vt.step(ms), frameMs);
      await page.evaluate(() => new Promise((r) => window.__realRAF(() => r())));
      if (!DRY && frame >= FROM && frame < TO) {
        await page.screenshot({ path: `${OUT}/f${String(frame).padStart(5, "0")}.jpg`, type: "jpeg", quality: 93 });
      }
      frame++;
      if (frame % 60 === 0) {
        const el = (Date.now() - t0) / 1000;
        process.stdout.write(`frame ${frame} (${(frame / FPS).toFixed(1)}s of film) ${el.toFixed(0)}s elapsed\n`);
      }
      if (frame >= TO) return true;
    }
    return false;
  }
  const hold = (s, fn) => tick(sec(s), fn);
  const center = async (sel) => {
    const b = await page.locator(sel).first().boundingBox();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2, b } : null;
  };
  const tap = async (sel) => {
    const c = await center(sel);
    if (!c) { console.warn("missing", sel); return; }
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.up();
  };
  const scrollY = () => page.evaluate(() => window.scrollY);
  async function scrollTo(y, s, e = ease.inOut) {
    const from = await scrollY();
    return hold(s, async (i, n) => {
      const v = from + (y - from) * e((i + 1) / n);
      await page.evaluate((v) => (window.App && App.lenis ? App.lenis.scrollTo(v, { immediate: true, force: true }) : window.scrollTo(0, v)), v);
    });
  }
  const pinRange = (id) => page.evaluate((id) => {
    const sec = document.getElementById(id);
    const st = ScrollTrigger.getAll().find((t) => t.pin && sec && sec.contains(t.trigger));
    return st ? { start: st.start, end: st.end } : null;
  }, id);
  const topOf = (sel, offset = 0) => page.evaluate(([sel, offset]) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect().top + window.scrollY - offset : 0;
  }, [sel, offset]);

  /* ---------- the storyboard (~56 s) ---------- */
  const centerOf = (sel) => page.evaluate(([sel, H]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return Math.max(0, r.top + window.scrollY + r.height / 2 - H / 2);
  }, [sel, H]);

  const film = async () => {
    await page.evaluate(() => window.__reseed());
    // 1. The rolled scroll with its wax seal
    if (await hold(1.6)) return;
    // 2. Tap the seal: it cracks, the ribbon falls, the parchment unrolls
    await tap(".intro__seal");
    if (await hold(4.0)) return;
    // 3. Open the invitation: the curtain lifts
    await tap(".intro__enter");
    // 4. The names write themselves in; parallax drifts with a slow, invisible "hand"
    drift.on = true;
    if (await hold(4.6)) return;
    drift.on = false;
    // 5. The couple: the opening line, then cards slide together and the rings interlock
    if (await scrollTo(await topOf("#couple", 0), 1.4)) return;
    if (await hold(0.6)) return;
    const cp = await pinRange("couple");
    if (cp) { if (await scrollTo(cp.end - 4, 4.2)) return; }
    if (await hold(0.5)) return;
    // flip both cards to show the parents
    {
      const cards = await page.locator(".cpl-card").all();
      for (const [i, c] of cards.slice(0, 2).entries()) {
        const b = await c.boundingBox();
        if (b) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
        if (await hold(i === 0 ? 1.2 : 1.6)) return;
      }
    }
    // 6. Save the date: scratch the gold foil until the date appears
    if (await scrollTo(await centerOf(".reveal-date__inner") ?? (await topOf("#reveal", 0)), 1.6)) return;
    if (await hold(1.1)) return;   // let the ticket finish its entrance before the "finger" lands
    const foil = await center(".reveal-date__foil");
    if (foil) {
      const { b } = foil;
      const rows = 11, pad = 18;
      const pts = [];
      for (let r = 0; r < rows; r++) {
        const y = b.y + pad + (b.height - 2 * pad) * (r / (rows - 1));
        const xs = r % 2 ? [b.x + b.width - pad, b.x + pad] : [b.x + pad, b.x + b.width - pad];
        pts.push({ x: xs[0], y }, { x: xs[1], y: y + 8 });
      }
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      let k = 0;
      if (await tick(sec(2.0), async (i, n) => {
        const target = Math.floor(((i + 1) / n) * (pts.length - 1));
        for (; k < target; k++) await page.mouse.move(pts[k + 1].x, pts[k + 1].y, { steps: 6 });
      })) return;
      await page.mouse.up();
      const revealed = await page.evaluate(() => !!document.querySelector("#reveal .is-revealed, #reveal.is-revealed, .reveal-date.is-revealed"));
      if (!revealed) { console.warn("scratch did not reveal; using Reveal instantly"); await tap(".reveal-date__instant"); }
    }
    if (await hold(1.6)) return;
    // 7. The Day: Sunday -> calendar -> clock to 9:05 -> the venue gate
    const dp = await pinRange("day");
    if (dp) {
      if (await scrollTo(dp.start, 1.4)) return;
      if (await hold(0.5)) return;
      const q = (dp.end - dp.start) / 3;
      for (let i = 1; i <= 3; i++) {
        if (await scrollTo(dp.start + q * i, 1.6)) return;
        if (await hold(i === 3 ? 1.2 : 0.7)) return;
      }
    }
    // 8. The flip-clock countdown, centred
    if (await scrollTo(await topOf("#countdown", 40), 1.5)) return;
    if (await hold(2.2)) return;
    // 9. When & Where: the venue card
    if (await scrollTo(await centerOf("#venue .venue-card, #venue .venue__card, .venue__grid > *"), 1.8)) return;
    if (await hold(2.0)) return;
    // 10. Hold the heart to send love (heart centred, so the thank-you note lands on empty space)
    if (await scrollTo(await centerOf(".love__btn"), 1.5)) return;
    if (await hold(0.4)) return;
    const love = await center(".love__btn");
    if (love) {
      await page.mouse.move(love.x, love.y);
      await page.mouse.down();
      if (await hold(1.5)) return;
      await page.mouse.up();
    }
    if (await hold(2.2)) return;
    // 11. The closing words
    if (await scrollTo(await centerOf(".closing"), 1.8)) return;
    if (await hold(2.4)) return;
    // 12. End card
    await page.evaluate(() => {
      const d = document.createElement("div");
      d.id = "reel-end";
      d.setAttribute("data-theme", "dark");
      d.style.cssText = "position:fixed;inset:0;z-index:200;display:grid;place-items:center;text-align:center;padding:32px;";
      const te = document.documentElement.lang === "te";
      d.innerHTML = `
        <div>
          <p class="eyebrow" style="margin-bottom:18px">${te ? "మీకు సాదర ఆహ్వానం" : "You are warmly invited"}</p>
          <p class="script" style="font-size:${te ? 54 : 60}px;line-height:1.15;color:var(--gold-soft)">${te ? "అఖిల్<br>&amp;<br>అలేఖ్య శ్రీ" : "Akhil<br><span style='font-size:.5em;color:var(--gold)'>&amp;</span><br>Alekhya Sree"}</p>
          <div style="width:90px;height:1px;background:var(--gold);margin:22px auto"></div>
          <p class="serif" style="font-size:22px;letter-spacing:.06em;color:var(--ivory)">${te ? "ఆదివారం · 29 నవంబర్ 2026" : "Sunday · 29 November 2026"}</p>
          <p class="serif" style="font-size:20px;color:var(--gold-soft);margin-top:6px">${te ? "ఉదయం 9:05 · రాయల్ రీజెన్సీ గార్డెన్స్" : "9:05 AM · Royal Regency Gardens"}</p>
          <p style="font-family:var(--sans-en);font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--sage-soft);margin-top:30px">akhilwedsalekhya.vercel.app</p>
        </div>`;
      document.body.appendChild(d);
      gsap.fromTo(d, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: "power2.out" });
      gsap.from(d.firstElementChild.children, { y: 24, opacity: 0, duration: 1.4, stagger: 0.14, ease: "expo.out", delay: 0.35 });
    });
    if (await hold(4.0)) return;
  };

  await film();
  console.log(`DONE frames=${frame} seconds=${(frame / FPS).toFixed(2)} fps=${FPS} size=${W * SCALE}x${H * SCALE} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await browser.close();
  server.kill();
})().catch((e) => { console.error(e); process.exit(1); });
