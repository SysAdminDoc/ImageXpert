# ImageXpert Roadmap

Drop-image-get-results reverse image search hub — single HTML file dispatching to Google, Yandex, Bing, TinEye, SauceNAO, and IQDB. Roadmap focuses on adding engines, improving attribution quality, and building userscript/extension companion flows.

## Planned Features

### Engine Coverage
- **Add engines** — Lens (Google Lens direct), Karma Decay (Reddit), ASCII2D, TraceMoe (anime frames), PimEyes (face, opt-in with warning), iqdb variants (danbooru/gelbooru/sankaku)
- **Image-to-prompt (AI)** — CLIP-Interrogator / BLIP WASM to generate a text description, then dispatch that to Google / DuckDuckGo Images
- **Video frame dispatch** — drop a short video, auto-extract N keyframes, search each
- **Batch mode** — drop 10 images, open a tabbed panel with results per engine per image

### Source Attribution
- **Result scraping (with consent)** — optional userscript that receives results and scores likely originals by earliest `published` date, highest resolution, and EXIF match
- **Reverse EXIF lookup** — if EXIF survives, attempt camera-serial / timestamp match against the query-result set
- **"Is this from a stock site?" detector** — quick match against Getty/Shutterstock/Adobe Stock result patterns

### Input & Privacy
- **Paste-from-clipboard** — Ctrl+V an image directly without saving
- **URL input mode** — paste image URL; engines receive URL without re-upload
- **Local-only preprocess** — optional crop / rotate / remove-color-strip before dispatch, improves hit rate
- **Hash + clipboard copy** — show pHash / dHash / SHA-256, copy one click
- **No-upload dispatch mode** — where supported (Yandex, TinEye via URL), never upload; show which engines required upload

### Companion
- **Tampermonkey userscript** — "Right-click any web image → Search with ImageXpert" (opens local HTML with prefilled image)
- **Chrome extension MV3 port** — same right-click menu, no copy-paste dance
- **History drawer** — locally cached history of previous searches with thumbnails

## Competitive Research
- **SauceNAO / IQDB / ASCII2D** — best-in-class for anime/illustration attribution; already in scope. Integrate their structured APIs where available instead of just URL dispatch.
- **TinEye** — best for finding earliest occurrence of a photo on the web; keep front and center.
- **Yandex Images** — strongest general-purpose reverse image result quality today, often beats Google Lens. Document this in the UI.
- **Google Lens** — mobile-first, poor desktop dispatch; add a "Lens direct" path via `lens.google.com/uploadbyurl`.

## Nice-to-Haves
- Side-by-side result dashboard with iframes (where X-Frame-Options allows)
- Saved "case file" — bundle a query image + all result URLs + notes into a JSON
- OCR pre-pass via Tesseract WASM so text-in-image queries also dispatch as text searches
- Face crop helper — detect faces, offer per-face crop before dispatch
- PWA install with offline shell (engine list, UI, history)
- Share-target registration so Android can "share image to ImageXpert" when installed as PWA

## Open-Source Research (Round 2)

### Related OSS Projects
- exiftool/exiftool — https://github.com/exiftool/exiftool — the gold-standard Perl CLI + library; reads/writes EXIF/GPS/IPTC/XMP/makernotes/ICC/XMP/GeoTIFF/ID3
- d2phap/ExifGlass — https://github.com/d2phap/ExifGlass — desktop EXIF viewer GUI; ExifTool-backed standalone app
- stefmolin/exif-stripper — https://github.com/stefmolin/exif-stripper — Python + pre-commit hook; `--fields=gps` targeted removal
- dmotz/ExifExodus — https://github.com/dmotz/ExifExodus — in-browser JPEG-only stripper; client-side, no upload
- nikvoronin/Metanull — https://github.com/nikvoronin/Metanull — Windows GUI JPEG stripper, selective-field preservation
- PicciMario/EXIF-Viewer — https://github.com/PicciMario/EXIF-Viewer — exiv2 wrapper that emits forensically-sound PDF reports
- ternera/exif-viewer — https://github.com/ternera/exif-viewer — browser extension, context-menu EXIF inspector
- exiv2 — https://github.com/Exiv2/exiv2 — C++ library with bindings; alternative to ExifTool when you need a lib, not a CLI
- piexifjs — https://github.com/hMatoba/piexifjs — pure-JS EXIF read/write for browser-side workflows

### Features to Borrow
- **Selective-field stripping, not all-or-nothing** (exif-stripper `--fields=gps`, Metanull) — GPS off by default but keep ColorSpace, Orientation, copyright; user-editable allowlist
- **Forensic PDF report** (PicciMario/EXIF-Viewer) — export timestamped hash-verified report for chain-of-custody use (useful for insurance/legal workflows)
- **Browser-based "strip before upload"** (ExifExodus) — drag-drop → strip → download, no network roundtrip; fits user's privacy-by-default ethos
- **Context-menu integration** (ternera/exif-viewer) — right-click any image on the desktop/explorer → show EXIF panel
- **Makernote handling** (ExifTool) — honor vendor makernote blocks rather than corrupting them on rewrite (common bug in lightweight strippers)
- **Batch preset profiles** — "Social share" (strip all), "Archive" (keep everything + checksum), "Print lab" (keep color profile + strip GPS)
- **Pre-commit hook mode** (exif-stripper) — git pre-commit integration for repos that accidentally commit photos with GPS
- **GPS coordinate preview on map** before strip — show the user what they're about to remove (opt-in; offline tile-free pin on a coord grid is fine)

### Patterns & Architectures Worth Studying
- ExifTool's **tag group namespace model** — EXIF:, XMP:, IPTC:, Composite: scopes per tag; avoids name collision between standards
- exif-stripper's **pre-commit hook packaging** — `.pre-commit-hooks.yaml` + entry point; enables drop-in repo-level enforcement
- ExifExodus's **file-reader + blob-rewriter loop** in pure JS — no server round trip, reference architecture for a privacy-first web mode
- piexifjs's **insert/load/dump** API — compact mental model for round-tripping EXIF blocks without decoding the pixels
- **ICC profile preservation** — many strippers accidentally nuke the color profile and desaturate photos; explicit test case
