# Akhil & Alekhya Sree · 29.11.2026

A web wedding invitation: plain HTML, CSS and JS, with no build step.

**Sunday, 29 November 2026 · 9:05 AM**
Royal Residence Gardens, Opp. Indian Petrol Pump, Asif Nagar, Hyderabad

## What's inside

| Feature | Notes |
|---|---|
| Door-opening intro with a gold seal | The tap also starts the music, since browsers block autoplay |
| Original background music | Synthesised live in the browser (`music.js`). Royalty-free, no download |
| Falling petals | Canvas animation. Off for people who've turned on reduced motion |
| Live countdown | Counts down to 9:05 AM IST |
| Add to calendar | Google Calendar link plus an `.ics` file for Apple and Outlook, with a reminder 1 day before |
| Directions and map | Opens Google Maps for the venue |
| Share | Native share sheet on phones, plus a WhatsApp button |
| Link preview | `assets/og-image.png`, the card WhatsApp shows when the link is pasted |
| Status/story image | `assets/story.png` (1080×1920) for WhatsApp Status or Instagram Stories |

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Publish free on GitHub Pages

1. Merge into `main`.
2. Open the repo's **Settings → Pages**, choose **Deploy from a branch**, then `main` / root.
3. The site will be at `https://pilliakhil0502.github.io/aawedding/`.
   If the URL is different, update `og:image` in `index.html`, because it has to be an absolute URL.

## Customise

- **Your own song:** add `assets/music.mp3` and it replaces the synth automatically. Only use a track you have the rights to.
- **Photos:** put an `<img src="assets/groom.jpg" alt="Akhil">` inside each `.arch` div in `index.html`. It fills the arch frame.
- **Colours:** change the CSS variables at the top of `styles.css`.
