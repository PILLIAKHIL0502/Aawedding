/* ==========================================================
   venue.js — "When & Where"
   - location links (Google Maps, directions, Apple Maps, copy, share)
   - add-to-calendar popover: Google Calendar link + .ics download
   - lazy Google map over an illustrated map (shown if Google can't load)
   - entrance timeline, map parallax on tilt, live EN/TE re-render
   ========================================================== */
(function () {
  const App = window.App;
  if (!App || typeof App.module !== "function") return;

  App.module("venue", (App) => {
    const root = document.getElementById("venue");
    if (!root) return;

    const W = App.WEDDING;
    const V = W.venue;
    const TE = () => W.te || {};
    const gsap = App.gsap;
    const ST = App.ScrollTrigger;
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));
    const animate = !!(gsap && ST && !App.reduceMotion);

    /* ======================================================
       text + links
       ====================================================== */
    const coupleEn = () => W.couple || "Akhil & Alekhya Sree";
    const coupleTe = () => TE().couple || "అఖిల్ & అలేఖ్య శ్రీ";
    const couple = () => App.t(coupleEn(), coupleTe());
    const calTitle = () => App.t(`Wedding of ${coupleEn()}`, `${coupleTe()} వివాహం`);
    const pageUrl = () => location.href.split("#")[0];

    const addressLocal = () => {
      const tv = TE().venue;
      return App.lang === "te" && tv ? `${tv.name}, ${tv.line1}, ${tv.line2}` : V.full;
    };
    const whenLocal = () => App.t(`${W.dateLong} at ${W.time} (IST)`, `${TE().dateLong || W.dateLong}, ${TE().time || W.time} (IST)`);

    const shareText = () => `${couple()} · ${whenLocal()}\n${addressLocal()}`;
    const whatsappUrl = () => `https://wa.me/?text=${encodeURIComponent(`${shareText()}\n${V.mapsUrl}`)}`;

    const utc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const calDetails = () => App.t(
      `${coupleEn()} are getting married.\n${whenLocal()}\n${V.full}\n\nMap: ${V.mapsUrl}\nInvitation: ${pageUrl()}`,
      `${coupleTe()} వివాహ మహోత్సవానికి ఆహ్వానం.\n${whenLocal()}\n${addressLocal()}\n\nమ్యాప్: ${V.mapsUrl}\nఆహ్వానం: ${pageUrl()}`
    );
    const gcalUrl = () => {
      const p = new URLSearchParams({
        action: "TEMPLATE",
        text: calTitle(),
        dates: `${utc(W.start)}/${utc(W.end)}`,
        details: calDetails(),
        location: V.full,          // English keeps calendar apps' map lookup reliable
        ctz: "Asia/Kolkata",
      });
      return `https://calendar.google.com/calendar/render?${p.toString().replace(/\+/g, "%20")}`;
    };

    const LINKS = {
      maps: () => V.mapsUrl,
      directions: () => V.directionsUrl,
      apple: () => V.appleMapsUrl,
      gcal: gcalUrl,
    };
    function renderLinks() {
      $$("[data-venue-link]").forEach((a) => {
        const make = LINKS[a.dataset.venueLink];
        if (make) a.href = make();
      });
      const art = $(".venue-map__art");
      if (art) art.href = V.mapsUrl;
      const share = $('[data-venue-action="share"]');
      if (share) share.href = whatsappUrl();
    }

    /* ======================================================
       copy address
       ====================================================== */
    const copyTile = $('[data-venue-action="copy"]');
    let copyT;
    function legacyCopy(text) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
      document.body.appendChild(ta);
      let ok = false;
      try {
        ta.select();
        ta.setSelectionRange(0, text.length);
        ok = document.execCommand("copy");
      } catch (_) { ok = false; }
      ta.remove();
      return ok;
    }
    function selectAddressText() {
      const addr = $(".venue-row--place .venue-row__body");
      if (!addr || !window.getSelection) return;
      try {
        const range = document.createRange();
        range.selectNodeContents(addr);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    }
    async function copyAddress() {
      const text = V.full;
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch (_) { ok = false; }
      if (!ok) ok = legacyCopy(text);
      if (copyTile) copyTile.focus({ preventScroll: true });

      if (ok) {
        App.haptic([10, 40, 10]);
        App.toast(App.t("Address copied", "చిరునామా కాపీ అయింది"));
        if (copyTile) {
          copyTile.classList.add("is-done");
          clearTimeout(copyT);
          copyT = setTimeout(() => copyTile.classList.remove("is-done"), 2400);
        }
      } else {
        selectAddressText();
        App.toast(App.t(
          "Couldn't copy automatically. The address is selected for you",
          "ఆటోమేటిక్‌గా కాపీ కాలేదు. చిరునామాను సెలెక్ట్ చేశాం, మీరే కాపీ చేసుకోండి"
        ), 3600);
      }
    }
    if (copyTile) copyTile.addEventListener("click", copyAddress);

    /* ======================================================
       share location (Web Share API, WhatsApp fallback)
       ====================================================== */
    const shareLink = $('[data-venue-action="share"]');
    let sharing = false;    // a share sheet is open: ignore repeat taps
    let linkOnly = false;   // the share sheet failed once: from now on the link itself opens WhatsApp

    // Open WhatsApp in a new tab. The invitation itself never navigates away.
    // (window.open with "noopener" always returns null, so open without it and drop the opener by hand.)
    function openWhatsApp() {
      let w = null;
      try { w = window.open(whatsappUrl(), "_blank"); } catch (_) { w = null; }
      if (w) {
        try { w.opener = null; } catch (_) {}
        return;
      }
      // Blocked as a pop-up (the failed share used up the tap). A fresh tap on the link opens it.
      App.toast(App.t(
        "Couldn't open the share menu. Tap again to send it on WhatsApp",
        "షేర్ మెనూ తెరుచుకోలేదు. వాట్సాప్‌లో పంపడానికి మళ్ళీ నొక్కండి"
      ), 3600);
    }

    if (shareLink) {
      shareLink.addEventListener("click", async (e) => {
        shareLink.href = whatsappUrl();
        if (linkOnly || !navigator.share) return;   // the link itself opens WhatsApp in a new tab
        const data = { title: couple(), text: shareText(), url: V.mapsUrl };
        try { if (navigator.canShare && !navigator.canShare(data)) return; } catch (_) { return; }
        e.preventDefault();
        if (sharing) return;
        sharing = true;
        App.haptic(10);
        try {
          await navigator.share(data);
        } catch (err) {
          if (err && err.name === "AbortError") return;   // the guest closed the share sheet
          // NotAllowedError (blocked by the page's context), InvalidStateError, ...: use WhatsApp instead
          linkOnly = true;
          openWhatsApp();
        } finally {
          sharing = false;
        }
      });
    }

    /* ======================================================
       .ics calendar file
       ====================================================== */
    const icsEscape = (s) => String(s)
      .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const enc = window.TextEncoder ? new TextEncoder() : null;
    const byteLen = (s) => (enc ? enc.encode(s).length : unescape(encodeURIComponent(s)).length);
    // RFC 5545: lines longer than 75 octets are folded (CRLF + space), never splitting a UTF-8 character
    function fold(line) {
      if (byteLen(line) <= 75) return line;
      const out = [];
      let cur = "";
      let bytes = 0;
      for (const ch of line) {
        const b = byteLen(ch);
        if (bytes + b > 75) { out.push(cur); cur = " "; bytes = 1; }
        cur += ch;
        bytes += b;
      }
      out.push(cur);
      return out.join("\r\n");
    }
    function buildIcs() {
      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Akhil and Alekhya Sree//Wedding Invitation//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${utc(W.start)}-akhil-alekhya-sree-wedding@akhilwedsalekhya.vercel.app`,
        `DTSTAMP:${utc(new Date())}`,
        `DTSTART:${utc(W.start)}`,
        `DTEND:${utc(W.end)}`,
        `SUMMARY:${icsEscape(calTitle())}`,
        `LOCATION:${icsEscape(V.full)}`,
        `DESCRIPTION:${icsEscape(calDetails())}`,
        `URL:${pageUrl()}`,
        "STATUS:CONFIRMED",
        "TRANSP:OPAQUE",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-P1D",
        `DESCRIPTION:${icsEscape(App.t(`Tomorrow: ${calTitle()}`, `రేపు: ${calTitle()}`))}`,
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
      ];
      return lines.map(fold).join("\r\n") + "\r\n";
    }
    function downloadIcs() {
      try {
        const blob = new Blob([buildIcs()], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "akhil-alekhya-sree-wedding.ics";
        a.rel = "noopener";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        App.haptic(12);
        App.toast(App.t("Calendar file downloaded", "క్యాలెండర్ ఫైల్ డౌన్‌లోడ్ అయింది"));
      } catch (e) {
        console.warn("[venue] .ics download failed", e);
        window.open(gcalUrl(), "_blank", "noopener");
      }
    }

    /* ======================================================
       add-to-calendar popover
       ====================================================== */
    const cal = $(".venue-cal");
    const calBtn = $(".venue-cal__toggle");
    const menu = $(".venue-cal__menu");
    let menuOpen = false;
    let hideT;
    const items = () => (menu ? Array.from(menu.querySelectorAll(".venue-cal__item")) : []);

    function placeMenu() {
      const r = calBtn.getBoundingClientRect();
      const need = menu.offsetHeight + 24;
      const below = window.innerHeight - r.bottom;
      cal.classList.toggle("is-up", below < need && r.top > below);
    }
    function openMenu(viaKeyboard) {
      if (!cal || menuOpen) return;
      menuOpen = true;
      clearTimeout(hideT);
      menu.hidden = false;
      placeMenu();
      void menu.offsetWidth;   // commit the closed state so the transition runs
      cal.classList.add("is-open");
      calBtn.setAttribute("aria-expanded", "true");
      App.haptic(8);
      if (viaKeyboard) { const first = items()[0]; first && first.focus(); }
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("keydown", onKey);
    }
    function closeMenu(returnFocus) {
      if (!cal || !menuOpen) return;
      menuOpen = false;
      cal.classList.remove("is-open");
      calBtn.setAttribute("aria-expanded", "false");
      clearTimeout(hideT);
      hideT = setTimeout(() => { if (!menuOpen) menu.hidden = true; }, 320);
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey);
      if (returnFocus) calBtn.focus({ preventScroll: true });
    }
    function onOutside(e) { if (!cal.contains(e.target)) closeMenu(false); }
    function onKey(e) {
      const list = items();
      const i = list.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); (list[i + 1] || list[0]).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (list[i - 1] || list[list.length - 1]).focus(); }
      else if (e.key === "Tab" && i !== -1) { closeMenu(false); }
    }
    if (cal && calBtn && menu) {
      calBtn.addEventListener("click", (e) => {
        if (menuOpen) closeMenu(false);
        else openMenu(e.detail === 0);   // detail 0: activated from the keyboard
      });
      calBtn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" && !menuOpen) { e.preventDefault(); openMenu(true); }
      });
      menu.addEventListener("click", (e) => {
        const item = e.target.closest(".venue-cal__item");
        if (!item) return;
        if (item.dataset.venueLink === "gcal") item.href = gcalUrl();
        if (item.dataset.venueAction === "ics") downloadIcs();
        setTimeout(() => closeMenu(false), 120);
      });
      window.addEventListener("resize", () => menuOpen && placeMenu());
    }

    /* ======================================================
       tile ripple (tap feedback)
       ====================================================== */
    if (!App.reduceMotion) {
      $$(".venue-tile").forEach((tile) => {
        tile.addEventListener("pointerdown", (e) => {
          const r = tile.getBoundingClientRect();
          const dot = document.createElement("span");
          dot.className = "venue-tile__ripple";
          dot.style.left = `${e.clientX - r.left}px`;
          dot.style.top = `${e.clientY - r.top}px`;
          tile.appendChild(dot);
          setTimeout(() => dot.remove(), 750);
        });
      });
    }

    /* ======================================================
       map: lazy Google iframe over the illustrated map
       ====================================================== */
    const frame = $(".venue-map__frame");
    const stage = $(".venue-map__stage");
    const chip = $(".venue-map__interact");
    const chipLabel = $(".venue-map__interact-label");
    let iframe = null;
    let mapLoaded = false;
    let mapInView = false;

    if (frame && App.isTouch) frame.classList.add("is-touch");

    const embedSrc = () => `${V.embedUrl}${V.embedUrl.includes("?") ? "&" : "?"}hl=${App.lang === "te" ? "te" : "en"}`;
    const mapTitle = () => App.t(
      "Google map: Royal Regency Gardens, Asif Nagar, Hyderabad",
      "గూగుల్ మ్యాప్: రాయల్ రీజెన్సీ గార్డెన్స్, ఆసిఫ్ నగర్, హైదరాబాద్"
    );

    // An iframe fires "load" even for a browser error page, so first check that Google answers at all.
    function probeGoogle(cb) {
      if (navigator.onLine === false) return cb(false);
      const img = new Image();
      let done = false;
      const finish = (ok) => { if (done) return; done = true; clearTimeout(t); cb(ok); };
      const t = setTimeout(() => finish(false), 8000);
      img.onload = () => finish(img.naturalWidth > 0);
      img.onerror = () => finish(false);
      img.referrerPolicy = "no-referrer";
      img.src = "https://www.google.com/favicon.ico?aa=1";   // a query skips any stale cached copy
    }

    function setInteractive(on) {
      if (!frame) return;
      frame.classList.toggle("is-interactive", on);
      if (chip) chip.setAttribute("aria-pressed", String(on));
      renderChip();
    }
    function renderChip() {
      if (!chipLabel || !frame) return;
      chipLabel.textContent = frame.classList.contains("is-interactive")
        ? App.t("Done", "పూర్తయింది")
        : App.t("Interact with map", "మ్యాప్‌ను ఉపయోగించండి");
    }
    if (chip) {
      chip.addEventListener("click", () => {
        App.haptic(8);
        setInteractive(!frame.classList.contains("is-interactive"));
      });
    }

    function insertIframe() {
      if (iframe || !stage) return;
      iframe = document.createElement("iframe");
      iframe.className = "venue-map__iframe";
      iframe.title = mapTitle();
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      iframe.allowFullscreen = true;
      if (App.isTouch) iframe.tabIndex = -1;
      const giveUp = setTimeout(() => {
        if (mapLoaded || !iframe) return;
        iframe.remove();
        iframe = null;
        root.classList.add("venue--map-offline");
      }, 20000);
      iframe.addEventListener("load", () => {
        if (!iframe) return;
        clearTimeout(giveUp);
        mapLoaded = true;
        stage.classList.add("is-loaded");
        root.classList.add("venue--map-live");
        if (chip && App.isTouch) { chip.hidden = false; renderChip(); }
      });
      iframe.src = embedSrc();
      stage.appendChild(iframe);
    }

    function loadMap() {
      probeGoogle((ok) => {
        if (ok) insertIframe();
        else root.classList.add("venue--map-offline");   // the illustrated map stays
      });
    }

    if (stage && "IntersectionObserver" in window) {
      const near = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { near.disconnect(); loadMap(); }
      }, { rootMargin: "700px 0px" });
      near.observe(stage);
    } else if (stage) {
      loadMap();
    }

    /* section visibility: pause CSS loops offscreen; re-lock the map when it scrolls away */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        root.classList.toggle("is-inview", entries[0].isIntersecting);
      }, { threshold: 0 }).observe(root);
      if (frame) {
        new IntersectionObserver((entries) => {
          mapInView = entries[0].isIntersecting;
          if (!mapInView && frame.classList.contains("is-interactive")) setInteractive(false);
        }, { threshold: 0 }).observe(frame);
      }
    } else {
      root.classList.add("is-inview");
      mapInView = true;
    }

    /* keep the illustration at a comfortable zoom on any frame size, centred on the venue */
    const svg = $(".venue-map__svg");
    const roadText = $(".vm-road-label textPath");
    const areaText = $(".vm-area");
    // Mehdipatnam Road runs from (-240,520) to (1040,200); its label's baseline sits at y = 475 - x/4.
    // The label sits left of the route if it fits there, otherwise in the longer visible stretch:
    // left of the route, or between the route and the frame's right edge.
    const ROAD_SLOPE = 1.0308;   // path length per x unit
    const ROUTE_X = [378, 410];  // where the route crosses the road (label baseline height)
    function placeRoadLabel(view) {
      if (!roadText) return;
      roadText.style.letterSpacing = "";
      let len = 0;
      try { len = roadText.getComputedTextLength() / ROAD_SLOPE; } catch (_) {}
      if (!len) return;
      const minX = Math.max(view.left + 18, 4 * (483 - view.bottom));   // clear of the frame edge, above its bottom
      const before = [minX, ROUTE_X[0]];
      const after = [Math.max(minX, ROUTE_X[1]), view.right - 16];
      const size = (p) => p[1] - p[0];
      const [a, b] = len <= size(before) || size(before) >= size(after) ? before : after;
      const room = b - a;
      let x = a;
      if (len > room) {
        // tighten the tracking just enough to fit
        const chars = Math.max(1, (roadText.textContent || "").length);
        const ls = parseFloat(getComputedStyle(roadText).letterSpacing) || 0;
        roadText.style.letterSpacing = `${Math.max(0.5, ls - (len - room) * ROAD_SLOPE / chars).toFixed(2)}px`;
      } else if (b === ROUTE_X[0]) {
        x = Math.max(a, b - len - 36);   // sit close to the venue rather than at the frame edge
      }
      roadText.setAttribute("startOffset", ((x + 240) * ROAD_SLOPE).toFixed(1));
    }
    // "Asif Nagar" is centred at x = 240 when there's room; on narrow frames it slides right to stay whole.
    function placeAreaLabel(view) {
      if (!areaText) return;
      areaText.style.letterSpacing = "";
      const width = () => { try { return areaText.getComputedTextLength(); } catch (_) { return 0; } };
      let w = width();
      if (!w) return;
      const lo = view.left + 10;   // frame edge
      const hi = 345;              // the venue plot
      if (w > hi - lo) {
        const chars = Math.max(1, (areaText.textContent || "").length);
        const ls = parseFloat(getComputedStyle(areaText).letterSpacing) || 0;
        areaText.style.letterSpacing = `${Math.max(0.5, ls - (w - (hi - lo)) / chars).toFixed(2)}px`;
        w = width();
      }
      areaText.setAttribute("x", Math.max(240, lo + w / 2).toFixed(1));
    }
    function fitMapArt() {
      if (!svg || !stage) return;
      // layout sizes, not getBoundingClientRect: the entrance and the tilt parallax transform the map
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      if (!sw || !sh) return;
      const s = App.clamp((sw * 1.08) / 720, 0.58, 1.2);   // the drawing is 108% of the stage
      const vw = (sw * 1.08) / s;
      const vh = (sh * 1.08) / s;
      svg.setAttribute("viewBox", `${(400 - vw / 2).toFixed(1)} ${(300 - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
      // labels keep a readable size on screen however far the drawing is zoomed out
      svg.style.setProperty("--vm-k", (1 / s).toFixed(3));
      const hw = sw / 2 / s;
      const hh = sh / 2 / s;
      const view = { left: 400 - hw, right: 400 + hw, top: 300 - hh, bottom: 300 + hh };
      placeRoadLabel(view);
      placeAreaLabel(view);
    }
    if (svg) {
      fitMapArt();
      if ("ResizeObserver" in window) new ResizeObserver(fitMapArt).observe(stage || svg);
      else App.on("resize", fitMapArt);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitMapArt).catch(() => {});
    }

    /* map parallax + compass needle following the tilt (pointer on desktop, gyroscope on phones) */
    const needle = $(".venue-map__needle");
    if (animate && svg) {
      const sx = gsap.quickTo(svg, "x", { duration: 1.1, ease: "power3.out" });
      const sy = gsap.quickTo(svg, "y", { duration: 1.1, ease: "power3.out" });
      const nr = needle ? gsap.quickTo(needle, "rotation", { duration: 1.4, ease: "elastic.out(1, 0.45)" }) : null;
      App.on("tilt", (t) => {
        if (!mapInView || mapLoaded) return;
        sx(-t.x * 12);
        sy(-t.y * 9);
        if (nr) nr(t.x * 28);
      });
    }

    /* ======================================================
       entrance animation
       Three blocks (heading, card, map), each played as it scrolls into view. Nothing heavy
       runs on "open": the timelines are built in idle time once the section is a screen or two
       away, or at the latest when a block starts to enter.
       ====================================================== */
    const title = $(".venue__title");
    let fontsOk = false;   // the current language's fonts are in, so the title can be split
    let langGen = 0;       // bumped on every language switch, to drop stale font callbacks
    let armed = false;     // the section has come near: build the pending blocks

    // SplitText registers itself with an active gsap.context, and reverting that context would
    // restore the English markup over i18n's Telugu. So the split lives outside the context.
    function splitTitle() {
      if (!title || !window.SplitText || !fontsOk) return null;
      if (document.fonts && document.fonts.status === "loading") return null;   // animate it whole
      try {
        if (title._split) { title._split.revert(); title._split = null; }
        const split = new window.SplitText(title, { type: "words", wordsClass: "split-word" });
        title._split = split;   // lets the language switch revert it
        return split.words;
      } catch (_) { return null; }
    }

    const BLOCKS = [
      {
        name: "head",
        watch: $(".venue__head"),
        margin: "0px 0px -12% 0px",   // like ScrollTrigger's start: "top 88%"
        build(tl) {
          const words = splitTitle();
          tl.from($(".venue__eyebrow"), { y: 18, opacity: 0, duration: 0.9 }, 0)
            .from(words || title, { yPercent: 70, opacity: 0, rotate: 3, duration: 1.2, stagger: 0.09 }, 0.08)
            .from($$(".venue__orn-line"), { strokeDashoffset: 100, duration: 1.4, ease: "power2.inOut" }, 0.3)
            .from($$(".venue__ornament .fill"), { scale: 0, transformOrigin: "50% 50%", duration: 0.6, ease: "back.out(3)", stagger: 0.05 }, 0.7);
          return [];
        },
      },
      {
        name: "card",
        // the card's own box moves with its entrance offset, so watch the static grid it tops
        watch: $(".venue__grid"),
        margin: "0px 0px -12% 0px",
        build(tl) {
          const buttons = [$(".venue-btn--primary"), ...$$(".venue-tile"), calBtn].filter(Boolean);
          tl.from($(".venue-card"), { y: 90, opacity: 0, scale: 0.96, duration: 1.5 }, 0)
            .from($(".venue-card__pin"), { y: -70, opacity: 0, duration: 1.1, ease: "bounce.out" }, 0.4)
            .from($$(".venue-row"), { x: -26, opacity: 0, duration: 1, stagger: 0.12 }, 0.45)
            .from(buttons, { y: 14, scale: 0.6, opacity: 0, duration: 0.75, ease: "back.out(2.2)", stagger: 0.06 }, 0.7);
          return buttons;
        },
      },
      {
        name: "map",
        watch: $(".venue-map"),
        margin: "0px 0px -4% 0px",   // the map starts 70px low, so this also lands near "top 88%"
        build(tl) {
          const overlays = $$(".venue-map__open, .venue-map__compass");
          tl.from($(".venue-map"), { y: 70, opacity: 0, scale: 0.97, duration: 1.5 }, 0)
            .from($(".vm-route-start"), { scale: 0, transformOrigin: "50% 50%", duration: 0.6, ease: "back.out(3)" }, 0.45)
            .from($(".vm-route-reveal"), { strokeDashoffset: 100, duration: 1.8, ease: "power2.inOut" }, 0.5)
            .from(overlays, { opacity: 0, y: -8, duration: 0.8, stagger: 0.1 }, 0.9)
            .from($(".venue-map__pin"), { y: -90, opacity: 0, duration: 1.1, ease: "bounce.out" }, 1.05)
            .from($(".venue-map__label-pill"), { y: 10, opacity: 0, scale: 0.85, duration: 0.8, ease: "back.out(2)" }, 1.5)
            .from($$(".venue-map__pulse"), { opacity: 0, duration: 0.6 }, 1.7);
          return overlays;
        },
      },
    ].filter((b) => b.watch);
    // stale: built for the previous language (the heading's split words are gone); rebuild before playing
    BLOCKS.forEach((b) => { b.tl = null; b.ctx = null; b.played = false; b.stale = false; });
    const needsBuild = (b) => !b.played && (!b.tl || b.stale);

    function buildBlock(b) {
      if (!needsBuild(b)) return;
      if (b.stale) {
        b.ctx.revert();   // back to the natural state, so the new from() tweens end in the right place
        b.ctx = null;
        b.tl = null;
        b.stale = false;
      }
      b.ctx = gsap.context(() => {
        const cls = `is-anim-${b.name}`;   // CSS transitions on transform stay off while GSAP drives them
        let handBack = [];
        const tl = gsap.timeline({
          paused: true,
          defaults: { ease: "expo.out" },
          onStart: () => root.classList.add(cls),
          onComplete: () => {
            root.classList.remove(cls);
            if (handBack.length) gsap.set(handBack, { clearProps: "transform,opacity" });
          },
        });
        handBack = b.build(tl);
        b.tl = tl;
      }, root);
    }
    function playBlock(b) {
      if (b.played) return;
      buildBlock(b);
      b.played = true;
      b.tl.play();
    }

    const idle = (fn) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 80));
    // build whatever hasn't played yet, one block per idle slot
    function buildPending() {
      const next = BLOCKS.find(needsBuild);
      if (next) idle(() => { buildBlock(next); buildPending(); });
    }
    // fn runs once the current language's fonts are in, unless the language changes first
    function whenFontsReady(fn) {
      const gen = langGen;
      const done = () => {
        if (gen !== langGen) return;
        fontsOk = true;
        if (fn) fn();
      };
      (App.fontsReady ? App.fontsReady() : Promise.resolve()).then(done, done);
    }

    function startEntrance() {
      if (!animate || !("IntersectionObserver" in window)) { root.classList.add("is-revealed"); return; }
      whenFontsReady();
      // play each block as it scrolls in
      BLOCKS.forEach((b) => {
        const io = new IntersectionObserver((entries) => {
          if (!entries.some((en) => en.isIntersecting)) return;
          io.disconnect();
          playBlock(b);
        }, { rootMargin: b.margin });
        io.observe(b.watch);
      });
      // build them ahead, quietly, while the section is still a screen or so away
      const near = new IntersectionObserver((entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        near.disconnect();
        armed = true;
        whenFontsReady(buildPending);
      }, { rootMargin: "150% 0px 150% 0px" });
      near.observe(root);
    }
    if (App.state.opened) startEntrance();
    else App.on("open", startEntrance);

    /* ======================================================
       language switch
       ====================================================== */
    App.on("lang", () => {
      langGen++;
      fontsOk = false;
      renderLinks();
      renderChip();
      // i18n reverted our title split. A heading that has played is plain, readable text now; one
      // that hasn't is rebuilt (re-split) in idle time once the new language's fonts are in, or
      // straight away if it scrolls into view first.
      const head = BLOCKS.find((b) => b.name === "head");
      if (head && head.tl && !head.played) head.stale = true;
      // the road label's length changes with the language (and again once the Telugu font arrives);
      // measure after i18n's own layout refresh instead of forcing a layout in the middle of it
      requestAnimationFrame(fitMapArt);
      setTimeout(fitMapArt, 1500);
      whenFontsReady(() => {
        requestAnimationFrame(fitMapArt);
        if (armed) buildPending();
      });
      if (iframe) {
        iframe.title = mapTitle();
        if (mapLoaded) {
          // reload the map so Google's own labels follow the language
          stage.classList.remove("is-loaded");
          setTimeout(() => { if (iframe) iframe.src = embedSrc(); }, 350);
        }
      }
      if (menuOpen) placeMenu();
    });

    renderLinks();
  });
})();
