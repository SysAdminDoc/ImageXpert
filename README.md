# ImageXpert

![Version](https://img.shields.io/badge/version-v1.2.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Platform](https://img.shields.io/badge/platform-JavaScript-lightgrey)

ImageXpert is a static reverse image search hub for fast attribution work. Drop images, paste image URLs, or load short videos; the app dispatches selected engines, computes local hashes, and keeps prior searches in browser storage.

## Features

- 12 reverse-search targets: Google Lens, Yandex, Bing, TinEye, SauceNAO, ASCII2D, TraceMoe, PimEyes, and IQDB variants.
- Bounded batch image mode and cancellable short-video keyframe extraction.
- Local SHA-256, pHash, and dHash display with copy-on-click hash cards.
- Local preprocess tools for rotate, center crop, and bottom-strip trimming.
- Drag-to-select region search with original-hash retention and optional Bing text context.
- Local-only mode is the default. External upload requires explicit consent, uses
  litterbox.catbox.moe with 1-hour retention, and then exposes a retryable
  per-engine dispatch queue.
- Tampermonkey userscript and Chrome MV3 companion extension for right-click image handoff.
- PWA manifest and offline shell for installable use.
- Versioned English UI dictionary with locale fallback; the independently
  distributed userscript keeps its existing translation table.
- Data-only custom engine manifest import/export with HTTPS validation, preview,
  and one-step rollback.
- Local file facts and a no-upload C2PA adapter with explicit unsupported,
  no-manifest, invalid-signature, and valid-signature states.

## Use

Open [ImageXpert](https://sysadmindoc.github.io/ImageXpert/) or serve the repo locally:

```bash
python -m http.server 8765
```

`index.html` is the canonical app. `ImageXpert.html` remains only as a redirect
for older bookmarks.

Then visit `http://127.0.0.1:8765/`.

## Validate

Run the dependency-free unit, release-contract, desktop browser, and exact
390px/320px mobile smoke suite:

```bash
npm test
```

Build the unsigned site and Chrome companion archives with `npm run package`.

## Companion Extension

Load `extension/` as an unpacked Chrome extension. Right-click a web image and choose `Search with ImageXpert`.
