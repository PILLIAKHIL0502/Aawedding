# Akhil & Alekhya · 29.11.2026

An interactive web wedding invitation built with vanilla JS, GSAP, ScrollTrigger and Lenis. There's no framework, and it deploys as a static site on Vercel.

**Sunday, 29 November 2026 · 9:05 AM IST**
Royal Regency Gardens, Opp. Indian Oil Petrol Pump, Mehdipatnam Road, Asif Nagar, Hyderabad

## Deploy on Vercel (one time, about 2 minutes)

1. Go to **vercel.com → Add New… → Project → Import Git Repository**, and pick `PILLIAKHIL0502/Aawedding`.
   If the repo isn't listed, click "Adjust GitHub App Permissions" and give Vercel access to it.
2. **Live URL:** https://akhilwedsalekhya.vercel.app. The link-preview image (`og:image` in `src/partials/00-head.html`)
   points to this domain. If you add a custom domain, update it there.
3. **Framework preset:** *Other*. Leave the build settings alone, because `vercel.json` already sets them
   (`npm run build` → `dist/`).
4. Click **Deploy**. Every `git push` after that redeploys automatically.
5. If your production branch isn't the one with this code, open **Settings → Git → Production Branch** and set it.

## Run locally

```bash
npm run dev           # http://localhost:8080 (assembles the page on every request)
npm run build         # writes dist/, which is what Vercel serves
```

Useful URL parameters:

| Param | Effect |
|---|---|
| `?lang=te` | Opens in Telugu (తెలుగు). Send this link to Telugu-reading relatives |
| `?to=Ravi%20Uncle` | Personal greeting: "Dear Ravi Uncle," on the intro scroll and the hero |
| `?skipintro` | Skips the rolled-scroll intro (handy while editing) |

## How it's organised

```
src/partials/   page sections, stitched together in filename order
  00-head  10-intro  15-player  20-hero  30-couple  35-reveal
  40-day   50-countdown  60-venue  70-blessings  90-footer  99-foot
css/            base.css (design tokens) + one stylesheet per section
js/             core.js (App contract, wedding data) + one module per feature
vendor/         GSAP 3.13 (+ScrollTrigger, Draggable, SplitText), Lenis (vendored, no CDN)
assets/         branch.svg, favicon, og-image.png (link preview), story.png (Status/Story)
scripts/        dev server + build
```

All wedding details (names, parents, date, venue and map links) live in **`js/core.js` → `WEDDING`**.
The Telugu versions live in **`js/i18n.js` → `WEDDING.te`**, and each section keeps its Telugu text next to the English
(`data-te="…"` attributes in `src/partials/*.html`).

## Customise

- **Your own song:** add `assets/music.mp3` and it replaces the built-in original composition automatically.
  Only use a track you have the rights to.
- **Photos:** each arch frame in `src/partials/30-couple.html` has a comment showing where an `<img>` goes.
- **Colours:** change the tokens at the top of `css/base.css`.
