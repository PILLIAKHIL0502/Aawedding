/* ==========================================================
   blessings.js — "Shower your blessings" (#blessings) and the site footer.

   - Hold-to-send love: press and hold (pointer, Space or Enter) charges a gold
     ring; releasing after a full charge sends a blessing (big burst, counter,
     toast). A short tap sends a small sprinkle.
   - Wish wall: wishes are stored on this device only (localStorage) and fly
     and flip into a masonry wall. User text is only ever set with textContent.
   - Share: Web Share API (falls back to copying the link), WhatsApp, copy link.
   - Footer: back to top.
   ========================================================== */
(function () {
  const App = window.App;
  if (!App) return;

  const KEYS = { count: "aa-blessings", wishes: "aa-wishes", name: "aa-wish-name" };
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
      catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (_) { return false; }
    },
  };

  const TOASTS = [
    ["Your love has reached the couple 💛", "మీ ప్రేమ వధూవరులకు చేరింది 💛"],
    ["Straight to the couple's hearts 💕", "నేరుగా వధూవరుల హృదయాలకు 💕"],
    ["Sent with love, received with joy 🌸", "మీరు ప్రేమతో పంపారు, వారు ఆనందంగా అందుకున్నారు 🌸"],
    ["One more blessing for the happy couple 💐", "నూతన వధూవరులకు మరో ఆశీస్సు 💐"],
  ];

  App.module("blessings", (App) => {
    setupFooter();
    const root = document.getElementById("blessings");
    if (!root) return;

    const W = App.WEDDING;
    const TE = W.te || {};
    const gsap = App.gsap;
    const anim = !!(gsap && !App.reduceMotion);
    const burst = (o) => { try { App.fx && App.fx.burst && App.fx.burst(o); } catch (_) {} };
    const centerOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    const love = setupLove();
    const wishes = setupWishes();
    const share = setupShare();
    const reveals = setupReveals();
    pauseOffscreen([root.querySelector(".love"), root.querySelector(".wish-wall__empty"), root.querySelector(".closing")]);

    App.on("lang", () => {
      love && love.relabel();
      wishes && wishes.relabel();
      share && share.relabel();
      reveals && reveals.relang();
    });

    /* ======================================================
       Hold to send love
       ====================================================== */
    function setupLove() {
      const btn = root.querySelector(".love__btn");
      if (!btn) return null;
      const label = btn.querySelector(".love__label");
      const stage = btn.querySelector(".love__stage");
      const progress = btn.querySelector(".love__progress");
      const glow = btn.querySelector(".love__glow");
      const heart = btn.querySelector(".love__heart");
      const orbit = btn.querySelector(".love__orbit-js");
      const fill = root.querySelector(".love__fill");
      const numEl = root.querySelector(".love__num");
      const countLabel = root.querySelector(".love__count-label");

      const HOLD_MS = 1200;
      const TICKS = 8;
      let count = Math.max(0, Math.floor(Number(store.get(KEYS.count, 0)) || 0));
      let shown = count;
      let state = "idle";          // idle | charging | ready | draining
      let p = 0, t0 = 0, tick = 0, angle = 0;
      let raf = 0, lastFrame = 0;
      let pointerId = null, heldKey = null;
      let lastToast = -1, lastHint = 0, sentT = 0;

      function relabel() {
        label.textContent = state === "ready"
          ? App.t("Now let go to send", "ఇప్పుడు వదలండి")
          : state === "charging"
            ? App.t("Keep holding…", "అలాగే నొక్కి ఉంచండి…")
            : App.t("Hold to send love", "ప్రేమను పంపడానికి నొక్కి పట్టుకోండి");
        renderCount(shown);
      }
      function renderCount(n) {
        numEl.textContent = String(n);
        countLabel.textContent = n === 1
          ? App.t("blessing sent", "ఆశీస్సు అందింది")
          : App.t("blessings sent", "ఆశీస్సులు అందాయి");
      }

      function paint() {
        progress.style.strokeDashoffset = (1 - p).toFixed(4);
        progress.style.opacity = p > 0.004 ? "1" : "0";
        const e = p * p * (3 - 2 * p);   // smoothstep for the glow
        glow.style.opacity = Math.min(1, e * 1.05).toFixed(3);
        glow.style.transform = `scale(${(0.6 + e * 0.7).toFixed(3)})`;
        heart.style.transform = `scale(${(1 + p * 0.32).toFixed(3)})`;
        if (fill) fill.setAttribute("transform", `translate(0 ${(32 * (1 - p)).toFixed(2)})`);
        if (orbit) orbit.setAttribute("transform", `rotate(${(angle % 360).toFixed(1)} 60 60)`);
      }

      function loop() {
        if (raf) return;
        lastFrame = performance.now();
        raf = requestAnimationFrame(frame);
      }
      function frame(now) {
        raf = 0;
        const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
        lastFrame = now;
        if (state === "charging") {
          p = Math.min(1, (now - t0) / HOLD_MS);
          const step = Math.floor(p * TICKS);
          if (step > tick) { tick = step; if (step < TICKS) App.haptic(6); }
          if (p >= 1) becomeReady();
        } else if (state === "draining") {
          p = Math.max(0, p - dt / 0.5);
          if (p === 0) { state = "idle"; btn.classList.remove("is-draining"); }
        }
        angle += dt * (state === "charging" ? 30 + p * 480 : state === "ready" ? 520 : 200 * p);
        paint();
        if (state !== "idle") raf = requestAnimationFrame(frame);
      }

      function begin() {
        if (state === "charging" || state === "ready") return;
        state = "charging";
        t0 = performance.now() - p * HOLD_MS;   // a quick re-press resumes from the drained level
        tick = Math.floor(p * TICKS);
        btn.classList.remove("is-ready", "is-draining");
        btn.classList.add("is-charging");
        relabel();
        App.haptic(8);
        loop();
      }
      function becomeReady() {
        state = "ready";
        p = 1;
        btn.classList.remove("is-charging");
        btn.classList.add("is-ready");
        App.haptic([16, 30, 16]);
        relabel();
      }
      function release(cancelled) {
        if (state !== "charging" && state !== "ready") return;
        const wasReady = state === "ready";
        state = "draining";
        btn.classList.remove("is-charging", "is-ready");
        btn.classList.add("is-draining");
        relabel();
        if (!cancelled) (wasReady ? send : sprinkle)();
        loop();
      }

      function send() {
        count += 1;
        store.set(KEYS.count, count);
        const c = centerOf(stage);
        burst({ x: c.x, y: c.y, kind: "hearts", count: 34, spread: 1.15 });
        burst({ x: c.x, y: c.y, kind: "petals", count: 30, spread: 1.1 });
        burst({ x: c.x, y: c.y, kind: "sparkles", count: 26, spread: 1 });
        App.haptic([22, 40, 30]);
        btn.classList.remove("is-sent");
        void btn.offsetWidth;    // restart the shockwave animation
        btn.classList.add("is-sent");
        clearTimeout(sentT);
        sentT = setTimeout(() => btn.classList.remove("is-sent"), 1400);
        bumpCounter();
        let i;
        do { i = (Math.random() * TOASTS.length) | 0; } while (i === lastToast && TOASTS.length > 1);
        lastToast = i;
        App.toast(App.t(TOASTS[i][0], TOASTS[i][1]), 3000);
      }

      function sprinkle() {
        const c = centerOf(stage);
        burst({ x: c.x, y: c.y, kind: "hearts", count: 9, spread: 0.6 });
        burst({ x: c.x, y: c.y, kind: "sparkles", count: 10, spread: 0.55 });
        App.haptic(10);
        const now = Date.now();
        if (now - lastHint > 6000) {
          lastHint = now;
          App.toast(App.t("Hold a little longer to send your blessing", "మీ ఆశీస్సు పంపడానికి ఇంకాసేపు నొక్కి పట్టుకోండి"));
        }
      }

      function bumpCounter() {
        const from = shown;
        shown = count;
        if (!anim) { renderCount(count); return; }
        const o = { v: from };
        gsap.to(o, {
          v: count, duration: 0.6, ease: "power2.out",
          onUpdate: () => renderCount(Math.round(o.v)),
          onComplete: () => renderCount(count),
        });
        gsap.fromTo(numEl, { scale: 1.6, y: -4 }, { scale: 1, y: 0, duration: 0.9, ease: "elastic.out(1, 0.45)", clearProps: "transform" });
      }

      /* pointer: hold anywhere on the button; a scroll gesture cancels quietly */
      btn.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (pointerId !== null) return;
        pointerId = e.pointerId;
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
        begin();
      });
      btn.addEventListener("pointerup", (e) => {
        if (e.pointerId !== pointerId) return;
        pointerId = null;
        release(false);
      });
      const cancel = (e) => {
        if (e.pointerId !== pointerId) return;
        pointerId = null;
        release(true);
      };
      btn.addEventListener("pointercancel", cancel);
      btn.addEventListener("lostpointercapture", cancel);
      // no long-press menu or text selection on touch
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
      btn.addEventListener("selectstart", (e) => e.preventDefault());
      btn.addEventListener("dragstart", (e) => e.preventDefault());

      /* keyboard: hold Space or Enter */
      const isKey = (k) => k === " " || k === "Enter" || k === "Spacebar";
      btn.addEventListener("keydown", (e) => {
        if (!isKey(e.key)) return;
        e.preventDefault();          // no page scroll, no synthetic click
        if (e.repeat || heldKey) return;
        heldKey = e.key;
        begin();
      });
      btn.addEventListener("keyup", (e) => {
        if (!isKey(e.key) || !heldKey) return;
        e.preventDefault();
        heldKey = null;
        release(false);
      });
      btn.addEventListener("blur", () => {
        if (!heldKey) return;
        heldKey = null;
        release(true);
      });
      /* screen readers and switch access activate with a plain click (detail 0): send straight away */
      btn.addEventListener("click", (e) => {
        if (e.detail !== 0 || heldKey || pointerId !== null) return;
        if (state === "charging" || state === "ready") return;
        p = 1;
        state = "draining";
        btn.classList.add("is-draining");
        send();
        loop();
      });

      relabel();
      paint();
      return { relabel };
    }

    /* ======================================================
       Wish form + wall
       ====================================================== */
    function setupWishes() {
      const form = root.querySelector(".wish-form");
      const wall = root.querySelector(".wish-wall");
      const list = root.querySelector(".wish-wall__list");
      if (!form || !wall || !list) return null;
      const ta = form.querySelector(".wish-form__textarea");
      const nameIn = form.querySelector('input[name="name"]');
      const countBox = form.querySelector(".wish-form__count");
      const countN = form.querySelector(".wish-form__count-n");
      const waLink = form.querySelector(".wish-form__wa");

      const MAX = 140, MAX_NAME = 40, MAX_STORED = 60;
      let wishes = load();
      let lastW = 0, layoutQueued = false, laidOnce = false;

      const savedName = store.get(KEYS.name, "");
      if (typeof savedName === "string" && nameIn && !nameIn.value) nameIn.value = savedName.slice(0, MAX_NAME);

      function clean(s, max, oneLine) {
        let v = String(s || "").replace(/\r/g, "");
        v = oneLine ? v.replace(/\s+/g, " ") : v.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
        return v.trim().slice(0, max);
      }
      function load() {
        const raw = store.get(KEYS.wishes, []);
        if (!Array.isArray(raw)) return [];
        return raw
          .filter((w) => w && typeof w.text === "string" && w.text.trim())
          .slice(0, MAX_STORED)
          .map((w, i) => ({
            id: String(w.id || "w" + i).replace(/[^\w-]/g, "").slice(0, 32) || "w" + i,
            text: clean(w.text, MAX),
            name: typeof w.name === "string" ? clean(w.name, MAX_NAME, true) : "",
            ts: Number.isFinite(w.ts) ? w.ts : Date.now(),
          }));
      }
      // Guests may write in Telugu while the page is in English: load the same Telugu webfonts
      // i18n uses, so their wish renders with proper shaping instead of a random system fallback.
      const TE_CHARS = /[ఀ-౿]/;
      function ensureTeluguFonts(s) {
        if (!TE_CHARS.test(s || "") || document.querySelector('link[href*="family=NTR"]')) return;
        const link = Object.assign(document.createElement("link"), {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=NTR&family=Anek+Telugu:wght@400;500;600&display=swap",
        });
        link.onload = () => {
          try { document.fonts.load('1em "NTR"', "అ").then(queueLayout, () => {}); } catch (_) {}
        };
        document.head.appendChild(link);
      }
      const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
      const wellWisher = () => App.t("A well-wisher", "ఒక శ్రేయోభిలాషి");

      function waWishUrl(text, name) {
        if (!text) return "https://wa.me/";
        const head = App.t(`A wish for ${W.couple} 💛`, `${TE.couple || W.couple}లకు ఒక శుభాకాంక్ష 💛`);
        const msg = `${head}\n\n“${text}”\n— ${name || wellWisher()}\n\n${W.hashtag}`;
        return "https://wa.me/?text=" + encodeURIComponent(msg);
      }
      function fmtDate(ts) {
        try {
          // Telugu month abbreviations read as truncated words, so Telugu uses the full month name
          return new Intl.DateTimeFormat(App.lang === "te" ? "te-IN" : "en-GB", { day: "numeric", month: App.lang === "te" ? "long" : "short" }).format(new Date(ts));
        } catch (_) { return ""; }
      }

      /* ---- cards ---- */
      const BACK_ART =
        '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="#c8a96a" stroke-width="1"/>' +
        '<circle cx="32" cy="32" r="24.5" fill="none" stroke="#c8a96a" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="0 4"/>' +
        '<text x="32" y="38" text-anchor="middle" fill="#e4d2a6" font-family="Cormorant Garamond, serif" font-style="italic" font-weight="600" font-size="17">A&amp;A</text></svg>';
      const WA_ICON = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#bl-wa"/></svg>';

      function make(tag, cls) { const el = document.createElement(tag); el.className = cls; return el; }
      function cardEl(w) {
        const li = make("li", "wish");
        const h = hash(w.id);
        li.dataset.id = w.id;
        li.dataset.tone = String(h % 4);
        const tilt = ((h % 29) / 28 - 0.5) * 2.6;   // -1.3deg .. 1.3deg
        li.style.setProperty("--tilt", tilt.toFixed(2) + "deg");
        const inner = make("div", "wish__inner");
        const front = make("div", "wish__face wish__front");
        const quote = make("span", "wish__quote");
        quote.setAttribute("aria-hidden", "true");
        quote.textContent = "“";
        const text = make("p", "wish__text");
        text.textContent = w.text;
        const by = make("p", "wish__by");
        const meta = make("div", "wish__meta");
        const date = make("time", "wish__date");
        try { date.dateTime = new Date(w.ts).toISOString(); } catch (_) {}
        const wa = make("a", "wish__wa");
        wa.target = "_blank";
        wa.rel = "noopener";
        wa.innerHTML = WA_ICON;    // static markup only
        meta.append(date, wa);
        front.append(quote, text, by, meta);
        const back = make("div", "wish__face wish__back");
        back.setAttribute("aria-hidden", "true");
        back.innerHTML = BACK_ART;  // static markup only
        const card = make("div", "wish__card");
        card.append(front, back);
        inner.append(card);
        li.append(inner);
        li._w = w;
        labelCard(li);
        return li;
      }
      function labelCard(li) {
        const w = li._w;
        li.querySelector(".wish__by").textContent = "— " + (w.name || wellWisher());
        li.querySelector(".wish__date").textContent = fmtDate(w.ts);
        const wa = li.querySelector(".wish__wa");
        const l = App.t("Send to the family on WhatsApp", "వాట్సాప్‌లో కుటుంబానికి పంపండి");
        wa.href = waWishUrl(w.text, w.name);
        wa.setAttribute("aria-label", l);
        wa.title = l;
      }

      /* ---- masonry: newest first, shortest column next, centred when there are few ---- */
      function layout() {
        const cards = Array.from(list.children);
        wall.classList.toggle("has-wishes", cards.length > 0);
        const width = list.clientWidth;
        lastW = width;
        if (!cards.length) { list.style.height = "0px"; return; }
        if (!width) return;
        const gap = width < 560 ? 14 : 20;
        const MIN_COL = 250;
        const cols = Math.max(1, Math.min(4, Math.floor((width + gap) / (MIN_COL + gap))));
        const colW = Math.floor((width - gap * (cols - 1)) / cols);
        const used = Math.min(cols, cards.length);
        const offset = Math.round((width - (used * colW + gap * (used - 1))) / 2);
        list.classList.add("is-masonry");
        cards.forEach((c) => { c.style.width = colW + "px"; });
        const heights = cards.map((c) => c.offsetHeight);
        const colH = new Array(used).fill(0);
        cards.forEach((c, i) => {
          let k = 0;
          for (let j = 1; j < used; j++) if (colH[j] < colH[k] - 1) k = j;
          c.style.transform = `translate3d(${offset + k * (colW + gap)}px, ${colH[k]}px, 0)`;
          colH[k] += heights[i] + gap;
        });
        list.style.height = Math.max(0, Math.max(...colH) - gap) + "px";
        if (!laidOnce) {
          laidOnce = true;
          requestAnimationFrame(() => requestAnimationFrame(() => list.classList.add("is-animated")));
        }
      }
      function queueLayout() {
        if (layoutQueued) return;
        layoutQueued = true;
        requestAnimationFrame(() => { layoutQueued = false; layout(); });
      }
      if (window.ResizeObserver) {
        new ResizeObserver(() => { if (list.clientWidth !== lastW) queueLayout(); }).observe(list);
      } else {
        App.on("resize", queueLayout);
      }
      try {
        document.fonts && document.fonts.addEventListener && document.fonts.addEventListener("loadingdone", queueLayout);
        document.fonts && document.fonts.ready.then(queueLayout);
      } catch (_) {}

      /* ---- posting ---- */
      function updateCount() {
        const n = ta.value.length;
        countN.textContent = String(n);
        countBox.classList.toggle("is-near", n >= MAX - 20 && n < MAX);
        countBox.classList.toggle("is-full", n >= MAX);
        waLink.href = waWishUrl(clean(ta.value, MAX), clean(nameIn.value, MAX_NAME, true));
      }
      function invalid() {
        form.classList.remove("is-invalid");
        void form.offsetWidth;
        form.classList.add("is-invalid");
        setTimeout(() => form.classList.remove("is-invalid"), 700);
        App.haptic([10, 40, 10]);
        App.toast(App.t("Please write your wish first", "ముందుగా మీ శుభాకాంక్షను రాయండి"));
        try { ta.focus({ preventScroll: true }); } catch (_) { ta.focus(); }
      }
      function post() {
        const text = clean(ta.value, MAX);
        if (!text) { invalid(); return false; }
        const name = clean(nameIn.value, MAX_NAME, true);
        store.set(KEYS.name, name);
        const top = wishes[0];
        if (top && top.text === text && top.name === name) {
          // the same wish twice in a row (e.g. Send wish, then WhatsApp): keep one card
          ta.value = "";
          updateCount();
          return true;
        }
        const w = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, name, ts: Date.now() };
        wishes.unshift(w);
        if (wishes.length > MAX_STORED) wishes.length = MAX_STORED;
        const saved = store.set(KEYS.wishes, wishes);
        const from = ta.getBoundingClientRect();
        ta.value = "";
        updateCount();
        const li = cardEl(w);
        li.classList.add("is-flying");
        list.prepend(li);
        while (list.children.length > MAX_STORED) list.lastElementChild.remove();
        layout();
        fly(li, from);
        App.toast(saved
          ? App.t("Your wish has been added 💌", "మీ శుభాకాంక్షను జత చేశాం 💌")
          : App.t("Your wish is on the wall, but this browser can't save it", "మీ శుభాకాంక్ష కనిపిస్తోంది, కానీ ఈ బ్రౌజర్‌లో సేవ్ కాలేదు"), 2800);
        return true;
      }

      function fly(li, from) {
        const inner = li.querySelector(".wish__inner");
        const done = () => {
          li.classList.remove("is-flying");
          const c = centerOf(li);
          burst({ x: c.x, y: c.y, kind: "sparkles", count: 16, spread: 0.7 });
          burst({ x: c.x, y: c.y, kind: "petals", count: 8, spread: 0.5 });
        };
        const to = li.getBoundingClientRect();
        // bring the new card into view if its slot is below the fold
        if (to.bottom > window.innerHeight - 20 || to.top < 0) {
          App.scrollTo(li, { offset: -Math.max(80, (window.innerHeight - to.height) / 2), duration: 1.3 });
        }
        if (!anim) { done(); return; }
        const dx = from.left + from.width / 2 - (to.left + to.width / 2);
        const dy = from.top + from.height / 2 - (to.top + to.height / 2);
        gsap.timeline({
          onComplete: () => { gsap.set(inner, { clearProps: "transform,opacity" }); done(); },
        })
          .fromTo(inner,
            { x: dx, y: dy, scale: 0.42, rotationY: 180, rotationX: 12, rotation: -10, opacity: 0, transformPerspective: 1100 },
            { opacity: 1, duration: 0.18, ease: "none" }, 0)
          .to(inner, { x: 0, y: 0, duration: 1.1, ease: "power3.inOut" }, 0)
          .to(inner, { scale: 1, duration: 1.1, ease: "back.out(1.3)" }, 0)
          .to(inner, { rotationY: 0, rotationX: 0, rotation: 0, duration: 0.85, ease: "power2.inOut" }, 0.3);
      }

      ta.addEventListener("input", () => { updateCount(); ensureTeluguFonts(ta.value); });
      nameIn.addEventListener("input", () => { updateCount(); ensureTeluguFonts(nameIn.value); });
      form.addEventListener("submit", (e) => { e.preventDefault(); post(); });
      // Ctrl/Cmd+Enter sends from the textarea
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); }
      });
      waLink.addEventListener("click", (e) => {
        if (!clean(ta.value, MAX)) { e.preventDefault(); invalid(); return; }
        waLink.href = waWishUrl(clean(ta.value, MAX), clean(nameIn.value, MAX_NAME, true));
        // the link opens WhatsApp; the wish also lands on this device's wall
        setTimeout(post, 0);
      });

      // initial wall
      wishes.forEach((w) => list.append(cardEl(w)));
      ensureTeluguFonts(wishes.map((w) => w.text + w.name).join(" ") + nameIn.value);
      updateCount();
      layout();

      function relabel() {
        Array.from(list.children).forEach(labelCard);
        updateCount();
        queueLayout();
      }
      return { relabel, list };
    }

    /* ======================================================
       Share
       ====================================================== */
    function setupShare() {
      const card = root.querySelector(".share-card");
      if (!card) return null;
      const nativeBtn = card.querySelector(".share-card__native");
      const waBtn = card.querySelector(".share-card__wa");
      const copyBtn = card.querySelector(".share-card__copy");

      function shareUrl() {
        try {
          const u = new URL(location.href);
          u.hash = "";
          // a personal ?to= link and dev flags shouldn't travel onward
          ["to", "skipintro"].forEach((k) => u.searchParams.delete(k));
          if (App.lang === "te") u.searchParams.set("lang", "te");
          else u.searchParams.delete("lang");
          return u.toString();
        } catch (_) { return location.href; }
      }
      function inviteText() {
        const v = TE.venue || {};
        return App.t(
          `You're invited! 💍 ${W.couple} are getting married on ${W.dateLong} at ${W.time}, ${W.venue.name}, ${W.venue.line2}.`,
          `మీకు సాదర ఆహ్వానం! 💍 ${TE.couple || W.couple} వివాహం ${TE.dateLong || W.dateLong}, ${TE.time || W.time} ` +
          `${v.name || W.venue.name}, ${v.line2 || W.venue.line2}‌లో జరగనుంది.`
        );
      }
      async function copyText(s) {
        try {
          if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(s); return true; }
        } catch (_) {}
        try {
          const t = document.createElement("textarea");
          t.value = s;
          t.setAttribute("readonly", "");
          t.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
          document.body.appendChild(t);
          t.select();
          const ok = document.execCommand("copy");
          t.remove();
          return ok;
        } catch (_) { return false; }
      }
      async function copyLink(fromEl) {
        const url = shareUrl();
        const ok = await copyText(url);
        App.toast(ok ? App.t("Link copied", "లింక్ కాపీ అయింది") : url, ok ? 2400 : 5000);
        if (ok && fromEl) {
          const c = centerOf(fromEl);
          burst({ x: c.x, y: c.y, kind: "sparkles", count: 14, spread: 0.55 });
        }
        App.haptic(10);
      }
      function relabel() {
        waBtn.href = "https://wa.me/?text=" + encodeURIComponent(inviteText() + "\n\n" + shareUrl());
      }

      nativeBtn.addEventListener("click", async () => {
        App.haptic(8);
        if (navigator.share) {
          try {
            await navigator.share({ title: App.t(W.couple, TE.couple || W.couple) + " · 29.11.2026", text: inviteText(), url: shareUrl() });
            return;
          } catch (err) {
            if (err && err.name === "AbortError") return;   // the guest closed the share sheet
          }
        }
        copyLink(nativeBtn);
      });
      copyBtn.addEventListener("click", () => copyLink(copyBtn));
      waBtn.addEventListener("click", () => { relabel(); App.haptic(8); });

      relabel();
      return { relabel };
    }

    /* ======================================================
       Entrance animations
       "open" only arms a cheap observer. The tweens, ScrollTriggers and SplitText are
       built when the section comes within ~400px of the viewport, one group per frame.
       ====================================================== */
    function setupReveals() {
      const ST = App.ScrollTrigger;
      if (!anim || !ST) return null;
      const $ = (s) => root.querySelector(s);
      const $$ = (s) => Array.from(root.querySelectorAll(s));
      const pending = [];   // tweens whose trigger hasn't fired yet: { tween, els, from }
      const splits = [];    // word reveals, see splitReveal()
      let built = false;

      const st = (trigger, start = "top 86%", onEnter) => ({ trigger, start, once: true, onEnter });
      const played = (tw) => !!tw && (tw.progress() > 0 || !tw.paused());

      function reveal(els, from, to, trigger, start) {
        els = (Array.isArray(els) ? els : [els]).filter(Boolean);
        if (!els.length) return;
        const tween = gsap.fromTo(els, from, { ...to, scrollTrigger: st(trigger || els[0], start) });
        pending.push({ tween, els, from });
      }
      function rise(targets, trigger, extra = {}) {
        reveal(targets, { y: 34, opacity: 0 }, {
          y: 0, opacity: 1, duration: 1.15, ease: "expo.out", stagger: 0.1, clearProps: "transform,opacity", ...extra,
        }, trigger);
      }

      /* Words rise (never split Telugu into characters). The split waits for the current
         language's fonts. If the language changes before the reveal plays, i18n reverts the
         split, so it is rebuilt for the new text; once it has played, the new text just stays. */
      function splitReveal(el, trigger, start, from, to) {
        if (!el) return;
        if (!window.SplitText) { rise(el, trigger); return; }
        const entry = { tween: null, fired: false, gen: 0 };
        const arm = () => {
          const split = new window.SplitText(el, { type: "words", wordsClass: "split-word" });
          el._split = split;   // lets the language switch revert it
          entry.tween = gsap.fromTo(split.words, from, {
            ...to, scrollTrigger: st(trigger, start, () => { entry.fired = true; }),
          });
        };
        const schedule = () => {
          const gen = entry.gen;
          App.fontsReady().then(() => {
            if (gen !== entry.gen || entry.fired || !el.isConnected) return;
            arm();
          }, () => {});
        };
        entry.relang = () => {
          entry.gen++;
          if (played(entry.tween)) entry.fired = true;
          if (entry.tween) { entry.tween.kill(); entry.tween = null; }   // it targets detached words now
          if (!entry.fired) schedule();
        };
        splits.push(entry);
        schedule();
      }

      const groups = [
        () => {   // heading
          const head = $(".blessings__head");
          rise($(".blessings__eyebrow"), head);
          splitReveal($(".blessings__title"), head, "top 86%",
            { yPercent: 80, opacity: 0, rotate: 5 },
            { yPercent: 0, opacity: 1, rotate: 0, duration: 1.25, ease: "expo.out", stagger: 0.09, delay: 0.1 });
          rise($(".blessings__lead"), head, { delay: 0.35 });
        },
        () => {   // love button
          reveal($(".love__stage"), { scale: 0.6, opacity: 0, rotate: -12 }, {
            scale: 1, opacity: 1, rotate: 0, duration: 1.4, ease: "elastic.out(1, 0.6)", clearProps: "transform,opacity",
          }, $(".love"));
          rise([$(".love__label"), $(".love__count")], $(".love"), { delay: 0.25 });
        },
        () => {   // form + wall
          rise($(".wish-form"), $(".wish-form"), { duration: 1.3 });
          rise($(".wish-wall__head"), $(".wish-wall"));
          reveal($$(".wish-wall__list .wish__inner"), { y: 46, opacity: 0 }, {
            y: 0, opacity: 1, duration: 1.1, ease: "expo.out", stagger: 0.07, clearProps: "transform,opacity",
          }, $(".wish-wall__list"), "top 90%");
          rise($(".wish-wall__empty"), $(".wish-wall"), { delay: 0.1 });
        },
        () => {   // share
          const shareCard = $(".share-card");
          rise(shareCard, shareCard);
          rise($$(".share-card__btn"), shareCard, { delay: 0.2, stagger: 0.08 });
        },
        () => {   // closing
          const closing = $(".closing");
          reveal($(".closing__ornament"), { scaleX: 0.2, opacity: 0 }, {
            scaleX: 1, opacity: 1, duration: 1.4, ease: "expo.out", clearProps: "transform,opacity",
          }, closing);
          const quote = $(".closing__quote");
          splitReveal(quote, quote, "top 88%",
            { y: 22, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.1, ease: "power3.out", stagger: 0.05, delay: 0.15 });
          rise([$(".closing__with"), $(".closing__families"), $(".closing__tag")], $(".closing__with"), { delay: 0.2, stagger: 0.14 });
          reveal($$(".closing__branch"), { opacity: 0 }, { opacity: 1, duration: 2, ease: "power2.out", clearProps: "opacity" }, closing);
        },
      ];

      function build() {
        if (built) return;
        built = true;
        const r = root.getBoundingClientRect();
        // Already on screen (e.g. reloaded further down): build everything now, so nothing
        // shows for a frame and then hides again. Otherwise one group per frame.
        if (r.top < window.innerHeight && r.bottom > 0) { groups.forEach((fn) => fn()); return; }
        const next = () => {
          groups.shift()();
          if (groups.length) requestAnimationFrame(next);
        };
        next();
      }

      function arm() {
        if (built) return;
        if (!("IntersectionObserver" in window)) { build(); return; }
        const io = new IntersectionObserver((entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io.disconnect();
          build();
        }, { rootMargin: "400px 0px 400px 0px" });
        io.observe(root);
      }

      /* Language switch (i18n has already swapped the text and cleared inline styles on the
         translated elements): re-hide what hasn't revealed yet and re-split unplayed word reveals. */
      function relang() {
        for (let i = pending.length - 1; i >= 0; i--) {
          const p = pending[i];
          if (played(p.tween)) { pending.splice(i, 1); continue; }
          const els = p.els.filter((el) => el.isConnected);
          if (els.length) gsap.set(els, p.from);
        }
        splits.forEach((entry) => entry.relang());
      }

      if (App.state.opened) arm();
      else App.on("open", arm);
      return { relang };
    }
  });

  /* Toggle .is-offscreen on blocks with looping CSS animations; the CSS pauses them. */
  function pauseOffscreen(els) {
    els = els.filter(Boolean);
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.target.classList.toggle("is-offscreen", !e.isIntersecting));
    }, { rootMargin: "80px 0px" });
    els.forEach((el) => { el.classList.add("is-offscreen"); io.observe(el); });
  }

  /* ======================================================
     Footer
     ====================================================== */
  function setupFooter() {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;
    pauseOffscreen([footer]);
    const top = footer.querySelector(".site-footer__top");
    if (!top) return;
    top.addEventListener("click", () => {
      App.haptic(8);
      App.scrollTo(0);
    });
  }
})();
