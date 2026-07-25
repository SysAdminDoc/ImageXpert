# ImageXpert

![Version](https://img.shields.io/badge/version-v1.1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Platform](https://img.shields.io/badge/platform-JavaScript-lightgrey)

ImageXpert is a static reverse image search hub for fast attribution work. Drop images, paste image URLs, or load short videos; the app dispatches selected engines, computes local hashes, and keeps prior searches in browser storage.

## Features

- 12 reverse-search targets: Google Lens, Yandex, Bing, TinEye, SauceNAO, ASCII2D, TraceMoe, PimEyes, and IQDB variants.
- Batch image mode and video keyframe extraction.
- Local SHA-256, pHash, and dHash display with copy-on-click hash cards.
- Local preprocess tools for rotate, center crop, and bottom-strip trimming.
- No-upload mode for local files, opening manual engine upload pages instead of temporary hosting.
- Tampermonkey userscript and Chrome MV3 companion extension for right-click image handoff.
- PWA manifest and offline shell for installable use.

## Use

Open [ImageXpert](https://sysadmindoc.github.io/ImageXpert/) or serve the repo locally:

```bash
python -m http.server 8765
```

`index.html` is the canonical app. `ImageXpert.html` remains only as a redirect
for older bookmarks.

Then visit `http://127.0.0.1:8765/`.

## Companion Extension

Load `extension/` as an unpacked Chrome extension. Right-click a web image and choose `Search with ImageXpert`.
