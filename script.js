/* ==========================================================
   Invitation interactions
   ========================================================== */
(function () {
  const WEDDING = {
    title: "Wedding of Akhil & Alekhya Sree",
    start: new Date("2026-11-29T09:05:00+05:30"),
    end: new Date("2026-11-29T13:05:00+05:30"),
    location: "Royal Residence Gardens, Opp. Indian Petrol Pump, Asif Nagar, Hyderabad",
    details: "With love, the Pilli & Tappetla families.",
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s) => document.querySelector(s);

  /* ---------- Intro doors + music start ---------- */
  const intro = $("#intro");
  const openBtn = $("#openBtn");
  const musicToggle = $("#musicToggle");

  openBtn.addEventListener("click", () => {
    window.WeddingMusic.play();
    musicToggle.hidden = false;
    intro.classList.add("is-open");
    document.body.classList.remove("is-locked");
    Petals.start();
    setTimeout(() => {
      intro.classList.add("is-gone");
      revealHero();
    }, reduceMotion ? 50 : 1300);
  });

  musicToggle.addEventListener("click", () => {
    const on = musicToggle.getAttribute("aria-pressed") === "true";
    if (on) window.WeddingMusic.pause(); else window.WeddingMusic.play();
    musicToggle.setAttribute("aria-pressed", String(!on));
    musicToggle.setAttribute("aria-label", on ? "Play music" : "Pause music");
  });

  // pause music when the tab is hidden, resume when back (if user had it on)
  document.addEventListener("visibilitychange", () => {
    const wanted = musicToggle.getAttribute("aria-pressed") === "true" && !musicToggle.hidden;
    if (!wanted) return;
    if (document.hidden) window.WeddingMusic.pause(); else window.WeddingMusic.play();
  });

  /* ---------- Reveal on scroll ---------- */
  function revealHero() {
    document.querySelectorAll(".hero .reveal").forEach((el, i) => {
      el.style.setProperty("--d", `${i * 0.18}s`);
      el.classList.add("in");
    });
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      io.unobserve(e.target);
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll("main section:not(.hero)").forEach((section) => {
    section.querySelectorAll(".reveal").forEach((el, i) => {
      el.style.setProperty("--d", `${Math.min(i, 5) * 0.12}s`);
      io.observe(el);
    });
  });

  /* ---------- Lazy map ---------- */
  const mapFrame = document.querySelector(".map iframe");
  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) {
      mapFrame.src = mapFrame.dataset.src;
      obs.disconnect();
    }
  }, { rootMargin: "300px" }).observe(mapFrame);

  /* ---------- Countdown ---------- */
  const units = {
    days: $('[data-unit="days"]'), hours: $('[data-unit="hours"]'),
    minutes: $('[data-unit="minutes"]'), seconds: $('[data-unit="seconds"]'),
  };
  const pad = (n) => String(n).padStart(2, "0");
  function tick() {
    let diff = WEDDING.start - Date.now();
    if (diff <= 0) {
      $("#countdown").hidden = true;
      $("#countdownDone").hidden = false;
      return clearInterval(cdTimer);
    }
    const d = Math.floor(diff / 864e5); diff -= d * 864e5;
    const h = Math.floor(diff / 36e5);  diff -= h * 36e5;
    const m = Math.floor(diff / 6e4);   diff -= m * 6e4;
    const s = Math.floor(diff / 1e3);
    units.days.textContent = pad(d);
    units.hours.textContent = pad(h);
    units.minutes.textContent = pad(m);
    units.seconds.textContent = pad(s);
  }
  const cdTimer = setInterval(tick, 1000);
  tick();

  /* ---------- Calendar ---------- */
  const toUTC = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const calMenu = $("#calMenu");
  $("#gcalLink").href =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(WEDDING.title)}` +
    `&dates=${toUTC(WEDDING.start)}/${toUTC(WEDDING.end)}` +
    `&details=${encodeURIComponent(WEDDING.details + " " + location.href)}` +
    `&location=${encodeURIComponent(WEDDING.location)}`;

  $("#calendarBtn").addEventListener("click", () => { calMenu.hidden = !calMenu.hidden; });

  $("#icsBtn").addEventListener("click", () => {
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AkhilAlekhya//Invite//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:akhil-alekhya-20261129@invite`,
      `DTSTAMP:${toUTC(new Date())}`,
      `DTSTART:${toUTC(WEDDING.start)}`,
      `DTEND:${toUTC(WEDDING.end)}`,
      `SUMMARY:${WEDDING.title}`,
      `LOCATION:${WEDDING.location.replace(/,/g, "\\,")}`,
      `DESCRIPTION:${WEDDING.details.replace(/,/g, "\\,")}`,
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Akhil & Alekhya Sree's wedding is tomorrow!", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "Akhil-Alekhya-Wedding.ics" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  /* ---------- Share ---------- */
  const shareText =
    "You're invited! 💍 Akhil & Alekhya Sree are getting married on Sunday, 29 November 2026 at 9:05 AM, Royal Residence Gardens, Asif Nagar, Hyderabad.";
  $("#waBtn").href = `https://wa.me/?text=${encodeURIComponent(shareText + "\n\n" + location.href)}`;

  $("#shareBtn").addEventListener("click", async () => {
    if (navigator.share) {
      try { await navigator.share({ title: WEDDING.title, text: shareText, url: location.href }); } catch (_) {}
      return;
    }
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link copied. Paste it anywhere to share");
    } catch (_) {
      toast(location.href);
    }
  });

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ---------- Falling petals ---------- */
  const Petals = (() => {
    const canvas = $("#petals");
    const ctx = canvas.getContext("2d");
    const COLORS = [["#f3d6cc", "#e8c4b8"], ["#fbf1ea", "#efd9cf"], ["#e9dcc0", "#d9c08e"], ["#dfe8dc", "#c9d6c6"]];
    let w, h, dpr, petals = [], running = false, last = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const make = (initial) => ({
      x: Math.random() * w,
      y: initial ? Math.random() * -h : -20,
      r: 5 + Math.random() * 7,
      vy: 18 + Math.random() * 28,
      sway: 20 + Math.random() * 40,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - .5) * 1.6,
      rot: Math.random() * Math.PI,
      flip: Math.random() * Math.PI,
      c: COLORS[(Math.random() * COLORS.length) | 0],
    });

    function draw(p) {
      ctx.save();
      ctx.translate(p.x + Math.sin(p.phase) * p.sway, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.flip)) * .7 + .3);
      const g = ctx.createLinearGradient(-p.r, 0, p.r, 0);
      g.addColorStop(0, p.c[0]); g.addColorStop(1, p.c[1]);
      ctx.fillStyle = g;
      ctx.globalAlpha = .85;
      ctx.beginPath();
      ctx.moveTo(0, -p.r);
      ctx.bezierCurveTo(p.r, -p.r * .6, p.r * .8, p.r * .8, 0, p.r);
      ctx.bezierCurveTo(-p.r * .8, p.r * .8, -p.r, -p.r * .6, 0, -p.r);
      ctx.fill();
      ctx.restore();
    }

    function frame(t) {
      if (!running) return;
      const dt = Math.min((t - last) / 1000, .05); last = t;
      ctx.clearRect(0, 0, w, h);
      petals.forEach((p, i) => {
        p.y += p.vy * dt;
        p.phase += dt * .9;
        p.rot += p.spin * dt;
        p.flip += dt * 1.4;
        if (p.y > h + 20) petals[i] = make(false);
        draw(p);
      });
      requestAnimationFrame(frame);
    }

    return {
      start() {
        if (reduceMotion || running) return;
        resize();
        const count = w < 700 ? 22 : 38;
        petals = Array.from({ length: count }, () => make(true));
        running = true; last = performance.now();
        requestAnimationFrame(frame);
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) { running = false; }
          else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
        });
      },
    };
  })();
})();
