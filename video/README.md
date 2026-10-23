# DealRadar demo video kit

- `script.md` – scenes, timings, narration and shot list (includes the browser-extension scene).
- `narration.json` + `tts.py` – voiceover text and the generator (Kokoro, voice `af_heart`). Output in `voice_mp3/` (and `voice/*.wav` locally).
- `cards/card.html` + `cards/record-cards.cjs` – animated title and closing cards (`?k=intro|outro`), recorded to `cards/card_*.webm`.
- `record.cjs` – Playwright recorder for the site scenes (1920×1080, animated cursor, smooth scroll). `BASE=... PRODUCT_URL=... node record.cjs`.
- `build.py` – assembles everything: slow push-in on each scene, blur/slide transitions, voice placed per scene, cross-faded audio → `dealradar-demo.mp4`.

Pipeline order: `node cards/record-cards.cjs` → `node record.cjs` → (code + deploy scenes) → `python3 build.py`.
