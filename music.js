/* ==========================================================
   WeddingMusic — an original, royalty-free music-box / piano
   piece synthesised live with the Web Audio API.

   If assets/music.mp3 exists, it is played instead (use a track
   you have the rights to). Otherwise the synth below plays.

   Composition: 8-bar loop in C major, ~66 bpm.
   Progression  C – G/B – Am – F – C – G – F – G
   Layers       soft pad · bass · arpeggiated music box · melody
   ========================================================== */
(function () {
  const BPM = 66;
  const BEAT = 60 / BPM;
  const BAR = BEAT * 4;

  const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // [bass root midi, chord intervals relative to root]
  const CHORDS = [
    [48, [0, 4, 7, 11]],   // Cmaj7
    [47, [0, 3, 8, 12]],   // G/B (B bass, G-B-D colour)
    [45, [0, 3, 7, 10]],   // Am7
    [41, [0, 4, 7, 11]],   // Fmaj7
    [48, [0, 4, 7, 14]],   // Cadd9
    [43, [0, 4, 7, 10]],   // G7
    [41, [0, 4, 7, 14]],   // Fadd9
    [43, [0, 5, 7, 10]],   // Gsus
  ];

  // melody per bar: [midi | null(rest), beats]
  const MELODY = [
    [[76, 2], [79, 1], [76, 1]],
    [[74, 2], [71, 1], [74, 1]],
    [[72, 1.5], [76, .5], [81, 2]],
    [[79, 1], [77, 1], [76, 1], [72, 1]],
    [[76, 2], [79, 1], [84, 1]],
    [[83, 2], [81, 1], [79, 1]],
    [[81, 1.5], [79, .5], [77, 1], [76, 1]],
    [[74, 3], [null, 1]],
  ];

  // arpeggio uses chord tones walking up and back down (8 eighth-notes)
  const ARP_STEPS = [0, 1, 2, 3, 2, 1, 2, 1];

  let ctx, master, dry, wet, timer, nextBarTime, barIndex, loopCount;
  let audioEl = null;
  let mode = null;          // "file" | "synth"
  let playing = false;

  function makeImpulse(seconds, decay) {
    const rate = ctx.sampleRate;
    const len = rate * seconds;
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function setupGraph() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;

    dry = ctx.createGain(); dry.gain.value = .75;
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(3.2, 2.6);
    wet = ctx.createGain(); wet.gain.value = .55;

    dry.connect(master);
    wet.connect(reverb); reverb.connect(master);
    master.connect(comp); comp.connect(ctx.destination);
  }

  function voice({ freq, t, dur, gain, type = "sine", attack = .005, partials = [[1, 1]], cutoff = 6000, send = .6 }) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(gain, t + attack);
    out.gain.exponentialRampToValueAtTime(.0001, t + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = cutoff;
    out.connect(lp);
    lp.connect(dry);
    const s = ctx.createGain(); s.gain.value = send;
    lp.connect(s); s.connect(wet);

    partials.forEach(([mult, amp]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq * mult;
      g.gain.value = amp;
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + .05);
    });
  }

  const bell = (m, t, g = .12) => voice({
    freq: midiToHz(m), t, dur: 2.2, gain: g,
    partials: [[1, 1], [2, .35], [3.01, .12], [4.2, .05]], cutoff: 5200, send: .7,
  });
  const piano = (m, t, len, g = .2) => voice({
    freq: midiToHz(m), t, dur: Math.max(1.6, len + 1.2), gain: g, type: "triangle",
    partials: [[1, 1], [2, .25], [3, .08]], cutoff: 3200, attack: .01, send: .6,
  });
  const pad = (m, t) => voice({
    freq: midiToHz(m), t, dur: BAR + 1.2, gain: .035, type: "sine",
    partials: [[1, 1], [1.003, .8], [.997, .8]], cutoff: 1400, attack: 1.4, send: .9,
  });
  const bass = (m, t) => voice({
    freq: midiToHz(m - 12), t, dur: BAR + .4, gain: .16, type: "sine",
    partials: [[1, 1], [2, .15]], cutoff: 600, attack: .03, send: .3,
  });

  function scheduleBar(i, t) {
    const [root, iv] = CHORDS[i];
    bass(root, t);
    iv.forEach((n) => pad(root + 12 + n, t));

    ARP_STEPS.forEach((s, k) => {
      const human = (Math.random() - .5) * .012;
      bell(root + 24 + iv[s], t + k * BEAT / 2 + human, k === 0 ? .1 : .07);
    });

    if (loopCount > 0) {          // melody joins from the second time round
      let beat = 0;
      MELODY[i].forEach(([m, len]) => {
        if (m !== null) piano(m, t + beat * BEAT, len * BEAT, .17);
        beat += len;
      });
    }
  }

  function scheduler() {
    while (nextBarTime < ctx.currentTime + 1.2) {
      scheduleBar(barIndex, nextBarTime);
      nextBarTime += BAR;
      barIndex = (barIndex + 1) % CHORDS.length;
      if (barIndex === 0) loopCount++;
    }
  }

  function startSynth() {
    if (!ctx) setupGraph();
    ctx.resume();
    if (!timer) {
      nextBarTime = ctx.currentTime + .15;
      barIndex = 0; loopCount = 0;
      timer = setInterval(scheduler, 250);
      scheduler();
    }
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(.9, ctx.currentTime + 2.5);
  }

  function fadeSynth() {
    if (!ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + .8);
    setTimeout(() => { if (!playing) ctx.suspend(); }, 900);
  }

  function tryFile() {
    return new Promise((resolve) => {
      const a = new Audio("assets/music.mp3");
      a.loop = true; a.volume = .6; a.preload = "auto";
      a.addEventListener("error", () => resolve(null), { once: true });
      a.play().then(() => resolve(a)).catch(() => resolve(null));
    });
  }

  window.WeddingMusic = {
    async play() {
      playing = true;
      if (!mode) {
        // Create the AudioContext synchronously inside the tap, so iOS accepts it,
        // then see whether a music file is available.
        setupGraph();
        ctx.resume();
        audioEl = await tryFile();
        if (!playing) return;
        mode = audioEl ? "file" : "synth";
        if (mode === "file") return;
      }
      if (mode === "file") audioEl.play().catch(() => {});
      else startSynth();
    },
    pause() {
      playing = false;
      if (mode === "file") audioEl.pause();
      else fadeSynth();
    },
    get playing() { return playing; },
  };
})();
