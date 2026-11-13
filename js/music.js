/* ==========================================================
   music.js — the music engine (App.music) and the floating player.

   ENGINE (replaces the App.music stub as soon as this script loads)
     Two HTMLAudioElements (A/B) play assets/music.mp3 through Web Audio:
       element → MediaElementSource → element gain ─┐
       element → MediaElementSource → element gain ─┼→ master → analyser → speakers
       (fallback synth bus) ────────────────────────┘
     The song starts and ends at full level, so instead of `loop` the engine
     crossfades: XFADE seconds before the active element ends, the other one
     starts from 0 and the two swap with equal-power gain curves.
     If the mp3 can't load (404, decode or network error), a small original
     music-box loop is synthesised instead, through the same analyser.

   API
     App.music.start()   call inside a tap: unlocks audio on iOS/Android, fades in
     App.music.pause()   fades out, then pauses
     App.music.toggle()  App.music.setVolume(0..1)
     App.music.playing / analyser / title / artist / progress / currentTime / duration / mode
   Events: "music:play", "music:pause" ({ reason: "blocked" } when the browser refused)
   ========================================================== */
(function () {
  const App = window.App;
  if (!App) return;

  const SRC = "assets/music.mp3";
  const SONG = { title: "In The Wild", artist: "National Sweetheart" };
  const XFADE = 3;        // seconds of overlap at the loop point
  const LEAD = 0.45;      // start the crossfade this much earlier (timer jitter margin)
  const FADE_IN = 2.5;
  const FADE_OUT = 0.6;
  const VOL_KEY = "aa-vol";

  const AC = window.AudioContext || window.webkitAudioContext;
  const store = {
    get() { try { return localStorage.getItem(VOL_KEY); } catch (_) { return null; } },
    set(v) { try { localStorage.setItem(VOL_KEY, String(v)); } catch (_) {} },
  };
  const savedVol = parseFloat(store.get());

  /* ---------- state ---------- */
  let ctx = null, master = null, analyser = null, synthBus = null;
  let volume = Number.isFinite(savedVol) ? Math.min(1, Math.max(0, savedVol)) : 0.75;
  let playing = false;
  let mode = null;            // null until first start, then "file" | "synth" | "element" (no Web Audio)
  let fileFailed = false;
  let cur = 0;                // index of the active element
  let xfade = null;           // { from, to, timer } while crossfading
  let tickTimer = 0, pauseTimer = 0, unlocked = false, wasPlaying = false;

  /* ---------- the two elements, buffering from script load ---------- */
  const els = [0, 1].map((i) => {
    const a = new Audio();
    a.preload = i === 0 ? "auto" : "none";   // B fetches once A has buffered (avoids a double download)
    a.loop = false;
    a.setAttribute("playsinline", "");
    a.src = SRC;
    a.addEventListener("error", () => onFileError(a));
    a.addEventListener("ended", () => onEnded(i));
    return a;
  });
  els[0].addEventListener("canplaythrough", () => {
    if (els[1].preload === "none") { els[1].preload = "auto"; try { els[1].load(); } catch (_) {} }
  }, { once: true });
  const gains = [null, null];   // per-element crossfade gains (GainNode)
  const ramps = [null, null];   // their Ramp trackers
  let masterRamp = null;

  /* ---------- gain automation that knows its own current value ----------
     (AudioParam.value isn't reliable mid-ramp in every browser, so track it ourselves) */
  const SHAPES = {
    in: (p) => p * p,                              // swell: gentle start
    out: (p) => p * (2 - p),                       // quick, soft release
    smooth: (p) => p * p * (3 - 2 * p),
    eqIn: (p) => Math.sin(p * Math.PI / 2),        // equal-power crossfade
    eqOut: (p) => 1 - Math.cos(p * Math.PI / 2),
  };
  function Ramp(param, initial) {
    let seg = { from: initial, to: initial, t0: 0, dur: 0, shape: SHAPES.smooth };
    param.value = initial;
    const now = () => ctx.currentTime;
    function valueAt(t) {
      if (t >= seg.t0 + seg.dur || seg.dur <= 0) return seg.to;
      if (t <= seg.t0) return seg.from;
      return seg.from + (seg.to - seg.from) * seg.shape((t - seg.t0) / seg.dur);
    }
    return {
      get value() { return valueAt(now()); },
      go(to, dur, shape = SHAPES.smooth) {
        const t0 = now();
        const from = valueAt(t0);
        seg = { from, to, t0, dur, shape };
        param.cancelScheduledValues(t0);
        param.setValueAtTime(from, t0);
        if (dur <= 0) { param.setValueAtTime(to, t0); return; }
        const n = dur > 1 ? 24 : 12;
        for (let k = 1; k <= n; k++) {
          const p = k / n;
          param.linearRampToValueAtTime(from + (to - from) * shape(p), t0 + dur * p);
        }
      },
    };
  }

  /* ---------- Web Audio graph (created inside the first tap) ---------- */
  function ensureGraph() {
    if (ctx || !AC) return !!ctx;
    try {
      ctx = new AC({ latencyHint: "playback" });
    } catch (_) {
      try { ctx = new AC(); } catch (e) { ctx = null; return false; }
    }
    master = ctx.createGain();
    masterRamp = Ramp(master.gain, 0);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.8;
    analyser.minDecibels = -92;
    analyser.maxDecibels = -22;
    master.connect(analyser);
    analyser.connect(ctx.destination);
    els.forEach((a, i) => {
      try {
        const src = ctx.createMediaElementSource(a);
        gains[i] = ctx.createGain();
        ramps[i] = Ramp(gains[i].gain, i === cur ? 1 : 0);
        src.connect(gains[i]);
        gains[i].connect(master);
      } catch (e) { /* element already captured (shouldn't happen) */ }
    });
    ctx.onstatechange = () => {
      // iOS "interrupted" (a call, Siri) or a suspend we didn't ask for: retry on the next tap
      if (playing && ctx.state !== "running" && !document.hidden) armGestureResume();
    };
    return true;
  }

  // iOS: a 1-sample silent buffer started inside the tap unlocks Web Audio.
  function unlockContext() {
    if (!ctx) return;
    try { const r = ctx.resume(); r && r.catch && r.catch(() => {}); } catch (_) {}
    if (unlocked) return;
    unlocked = true;
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.onended = () => s.disconnect();
      s.start(0);
    } catch (_) {}
  }

  let gestureArmed = false;
  function armGestureResume() {
    if (gestureArmed) return;
    gestureArmed = true;
    const resume = () => {
      gestureArmed = false;
      ["pointerdown", "touchend", "keydown"].forEach((t) => document.removeEventListener(t, resume, true));
      if (playing && ctx && ctx.state !== "running") { try { ctx.resume().catch(() => {}); } catch (_) {} }
    };
    ["pointerdown", "touchend", "keydown"].forEach((t) => document.addEventListener(t, resume, true));
  }

  /* ---------- play / pause ---------- */
  function emit(evt, data) { App.emit(evt, data); }

  function start() {
    if (playing) return;
    clearTimeout(pauseTimer); pauseTimer = 0;
    playing = true;
    ensureGraph();
    unlockContext();

    if (!ctx || !gains[0] || !gains[1]) {   // no usable Web Audio: the plain element, looping
      mode = "element";
      const a = els[0];
      a.loop = true; a.volume = volume;
      playElement(a, true);
      emit("music:play");
      return;
    }

    if (fileFailed) startSynth();
    else {
      mode = "file";
      const a = els[cur];
      playElement(a, true);
      // iOS unlocks each media element separately: give the idle one its tap too (silent, gain 0)
      const b = els[1 - cur];
      if (!b._unlocked && !xfade) {
        b._unlocked = true;
        const p = safePlay(b);
        p.then(() => { if (!xfade && b !== els[cur]) { b.pause(); b.currentTime = 0; } }, () => { b._unlocked = false; });
      }
    }
    masterRamp.go(volume, FADE_IN, SHAPES.in);
    startTick();
    emit("music:play");
  }

  function safePlay(a) {
    try {
      const p = a.play();
      return p && p.then ? p : Promise.resolve();
    } catch (e) { return Promise.reject(e); }
  }

  function playElement(a, isMain) {
    safePlay(a).catch((err) => {
      if (!playing || !isMain || a !== els[mode === "element" ? 0 : cur]) return;
      const name = err && err.name;
      if (name === "AbortError") return;                 // a pause() interrupted it: fine
      if (name === "NotSupportedError" || a.error) { onFileError(a); return; }
      // NotAllowedError: the browser wants a tap. Show the player paused so the guest can start it.
      stopNow();
      emit("music:pause", { reason: "blocked" });
    });
  }

  function pause() {
    if (!playing) return;
    playing = false;
    wasPlaying = false;
    stopTick();
    emit("music:pause");
    if (!ctx) { els.forEach((a) => a.pause()); return; }
    masterRamp.go(0, FADE_OUT, SHAPES.out);
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { pauseTimer = 0; if (!playing) stopNow(); }, FADE_OUT * 1000 + 60);
  }

  // Immediately silence and pause everything (end of a fade, a refusal, or the tab hiding).
  function stopNow() {
    playing = false;
    stopTick();
    finishCrossfade();
    els.forEach((a) => { if (!a.paused) a.pause(); });
    stopSynth();
    if (ctx) {
      masterRamp.go(0, 0);
      if (ctx.state === "running") { try { ctx.suspend().catch(() => {}); } catch (_) {} }
    }
  }

  /* ---------- seamless loop ---------- */
  function startTick() {
    if (!tickTimer) tickTimer = setInterval(tick, 200);
  }
  function stopTick() {
    clearInterval(tickTimer); tickTimer = 0;
  }
  function tick() {
    if (!playing || mode !== "file") return;
    const a = els[cur];
    if (a.paused && !xfade && !a.ended && a.readyState > 1) safePlay(a).catch(() => {});   // nudged by the system: resume
    const d = a.duration;
    if (xfade || !Number.isFinite(d) || d < XFADE * 3) return;
    const remain = d - a.currentTime;
    if (remain <= XFADE + LEAD) beginCrossfade(remain);
  }

  function beginCrossfade(remain) {
    const from = cur, to = 1 - cur;
    const out = els[from], inc = els[to];
    if (inc.error) return;                         // can't crossfade: "ended" restarts the same element
    xfade = { from, to, timer: 0 };
    cur = to;
    try { inc.currentTime = 0; } catch (_) {}
    ramps[to].go(0, 0);
    const begin = () => {
      if (!xfade || xfade.to !== to) return;
      const left = Math.max(0.4, (out.duration - out.currentTime) || remain);
      const dur = Math.max(0.4, Math.min(XFADE, left - 0.08));
      ramps[from].go(0, dur, SHAPES.eqOut);
      ramps[to].go(1, dur, SHAPES.eqIn);
      xfade.timer = setTimeout(finishCrossfade, dur * 1000 + 120);
    };
    safePlay(inc).then(begin, () => {
      // the incoming element refused: hand back and let "ended" restart from 0
      if (!xfade) return;
      cur = from; ramps[from].go(1, 0.05); xfade = null;
    });
  }

  function finishCrossfade() {
    if (!xfade) return;
    const { from, to, timer } = xfade;
    clearTimeout(timer);
    xfade = null;
    if (ramps[from]) ramps[from].go(0, 0);
    if (ramps[to]) ramps[to].go(1, 0.03);
    const old = els[from];
    old.pause();
    try { old.currentTime = 0; } catch (_) {}
  }

  // Safety net: if an element runs out without a crossfade (timers starved), jump straight on.
  function onEnded(i) {
    if (!playing || mode !== "file") return;
    if (xfade && xfade.from === i) { finishCrossfade(); return; }
    if (i !== cur) return;
    const next = els[1 - i].error ? i : 1 - i;
    cur = next;
    if (ramps[next]) ramps[next].go(1, 0);
    if (next !== i && ramps[i]) ramps[i].go(0, 0);
    try { els[next].currentTime = 0; } catch (_) {}
    safePlay(els[next]).catch(() => {});
  }

  function onFileError(a) {
    if (fileFailed) return;
    if (a !== els[0] && !els[0].error) return;     // only the primary element decides
    fileFailed = true;
    if (playing && mode === "file") {
      stopTick();
      xfade = null;
      els.forEach((e) => { try { e.pause(); } catch (_) {} });
      startSynth();
      emit("music:play", { mode: "synth" });
    }
  }

  /* ==========================================================
     FALLBACK: an original music-box loop (8 bars in C, ~66 bpm),
     adapted from the first version of this invitation.
     ========================================================== */
  const BEAT = 60 / 66, BAR = BEAT * 4;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const CHORDS = [[48, [0, 4, 7, 11]], [47, [0, 3, 8, 12]], [45, [0, 3, 7, 10]], [41, [0, 4, 7, 11]],
    [48, [0, 4, 7, 14]], [43, [0, 4, 7, 10]], [41, [0, 4, 7, 14]], [43, [0, 5, 7, 10]]];
  const MELODY = [
    [[76, 2], [79, 1], [76, 1]], [[74, 2], [71, 1], [74, 1]], [[72, 1.5], [76, .5], [81, 2]],
    [[79, 1], [77, 1], [76, 1], [72, 1]], [[76, 2], [79, 1], [84, 1]], [[83, 2], [81, 1], [79, 1]],
    [[81, 1.5], [79, .5], [77, 1], [76, 1]], [[74, 3], [null, 1]],
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 1];
  let synth = null;   // { dry, wet, timer, next, bar, loops, t0 }

  function buildSynth() {
    synthBus = ctx.createGain();
    synthBus.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    const dry = ctx.createGain(); dry.gain.value = 0.75;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    verb.buffer = ir;
    dry.connect(synthBus); wet.connect(verb); verb.connect(synthBus);
    synthBus.connect(comp); comp.connect(master);
    synth = { dry, wet, timer: 0, next: 0, bar: 0, loops: 0, t0: 0 };
  }

  // One note: a few partials → envelope → low-pass → dry + reverb send. Disconnects itself when done.
  function voice(freq, t, dur, peak, type, attack, partials, cutoff, send) {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = cutoff;
    const s = ctx.createGain(); s.gain.value = send;
    env.connect(lp); lp.connect(synth.dry); lp.connect(s); s.connect(synth.wet);
    const nodes = [env, lp, s];
    partials.forEach(([mult, amp], k) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq * mult; g.gain.value = amp;
      o.connect(g); g.connect(env);
      o.start(t); o.stop(t + dur + 0.05);
      nodes.push(o, g);
      if (k === 0) o.onended = () => nodes.forEach((n) => { try { n.disconnect(); } catch (_) {} });
    });
  }
  const bell = (m, t, g) => voice(hz(m), t, 2, g, "sine", 0.005, [[1, 1], [2, .35], [3.01, .1]], 5200, 0.7);
  const piano = (m, t, len) => voice(hz(m), t, Math.max(1.6, len + 1.2), 0.17, "triangle", 0.01, [[1, 1], [2, .22]], 3200, 0.6);
  const pad = (m, t) => voice(hz(m), t, BAR + 1.2, 0.035, "sine", 1.4, [[1, 1], [1.003, .8]], 1400, 0.9);
  const bass = (m, t) => voice(hz(m - 12), t, BAR + 0.4, 0.16, "sine", 0.03, [[1, 1], [2, .15]], 600, 0.3);

  function scheduleBar(i, t) {
    const [root, iv] = CHORDS[i];
    bass(root, t);
    iv.forEach((n) => pad(root + 12 + n, t));
    ARP.forEach((s, k) => bell(root + 24 + iv[s], t + k * BEAT / 2 + (Math.random() - 0.5) * 0.012, k ? 0.07 : 0.1));
    if (synth.loops > 0) {
      let beat = 0;
      MELODY[i].forEach(([m, len]) => { if (m !== null) piano(m, t + beat * BEAT, len * BEAT); beat += len; });
    }
  }
  function synthScheduler() {
    while (synth.next < ctx.currentTime + 1.2) {
      scheduleBar(synth.bar, synth.next);
      synth.next += BAR;
      synth.bar = (synth.bar + 1) % CHORDS.length;
      if (synth.bar === 0) synth.loops++;
    }
  }
  function startSynth() {
    mode = "synth";
    if (!synth) buildSynth();
    if (!synth.timer) {
      synth.next = synth.t0 = ctx.currentTime + 0.12;
      synth.bar = 0;
      synthScheduler();
      synth.timer = setInterval(synthScheduler, 250);
    }
    if (playing) masterRamp.go(volume, FADE_IN, SHAPES.in);
  }
  function stopSynth() {
    if (synth && synth.timer) { clearInterval(synth.timer); synth.timer = 0; }
  }

  /* ---------- tab visibility: pause while hidden, resume only if it was playing ---------- */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (playing) { wasPlaying = true; stopNow(); emit("music:pause", { reason: "hidden" }); }
    } else if (wasPlaying) {
      wasPlaying = false;
      start();
    }
  });

  /* ---------- public API ---------- */
  function setVolume(v) {
    volume = Math.min(1, Math.max(0, Number(v) || 0));
    store.set(Math.round(volume * 100) / 100);
    if (mode === "element") els[0].volume = volume;
    else if (ctx && playing && !pauseTimer) masterRamp.go(volume, 0.12, SHAPES.smooth);
    App.emit("music:volume", volume);
  }

  App.music = {
    start() { try { start(); } catch (e) { console.error("[music] start failed", e); } },
    pause() { try { pause(); } catch (e) { console.error("[music] pause failed", e); } },
    toggle() { playing ? this.pause() : this.start(); },
    setVolume,
    get volume() { return volume; },
    get playing() { return playing; },
    get analyser() { return analyser; },
    get mode() { return mode || (fileFailed ? "synth" : "file"); },
    get title() { return this.mode === "synth" ? "Music Box" : SONG.title; },
    get artist() { return this.mode === "synth" ? "An original melody" : SONG.artist; },
    get duration() {
      if (this.mode === "synth") return BAR * CHORDS.length;
      const d = els[cur].duration;
      return Number.isFinite(d) ? d : 0;
    },
    get currentTime() {
      if (this.mode === "synth") return synth && ctx ? Math.max(0, ctx.currentTime - synth.t0) % (BAR * CHORDS.length) : 0;
      return els[cur].currentTime || 0;
    },
    get progress() {
      const d = this.duration;
      return d ? Math.min(1, Math.max(0, this.currentTime / d)) : 0;
    },
    // test / debug hooks
    _els: els,
    get _active() { return cur; },
    get _ctx() { return ctx; },
  };
})();
