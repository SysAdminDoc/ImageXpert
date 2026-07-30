# ImageXpert

![Version](https://img.shields.io/badge/version-v1.2.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Platform](https://img.shields.io/badge/platform-JavaScript-lightgrey)

ImageXpert is a static reverse image search hub for fast attribution work. Drop images, paste image URLs, or load short videos; the app dispatches selected engines, computes local hashes, and keeps prior searches in browser storage.

The site remains dependency-free and no-build: `index.html` loads same-origin CSS and JavaScript modules directly under a restrictive Content Security Policy.

## Features

- 12 reverse-search targets: Google Lens, Yandex, Bing, TinEye, SauceNAO, ASCII2D, TraceMoe, PimEyes, and IQDB variants.
- Bounded batch image mode and cancellable short-video keyframe extraction.
- Local SHA-256, pHash, and dHash display with copy-on-click hash cards.
- Local preprocess tools for rotate, center crop, and bottom-strip trimming.
- Drag-to-select region search with original-hash retention and optional Bing text context.
- Local-only mode is the default. External upload requires explicit consent, uses
  litterbox.catbox.moe with 1-hour retention, and then exposes a retryable
  per-engine dispatch queue. Authorization lasts only for the open browser
  session; the decision names recipient engines and links the host policy.
- Temporary hosted history records carry explicit expiry metadata. Expired or
  legacy-unknown links cannot be redispatched and instead offer local-file or
  manual-engine recovery.
- Tampermonkey userscript and Chrome MV3 companion extension for right-click image handoff.
- PWA manifest and offline shell for installable use.
- Versioned English UI dictionary with locale fallback; the independently
  distributed userscript keeps its existing translation table.
- Data-only custom engine manifest import/export with HTTPS validation, preview,
  and one-step rollback.
- Local file facts and a no-upload C2PA adapter with explicit unsupported,
  no-manifest, invalid-signature, and valid-signature states.

### Optional C2PA adapter

ImageXpert never downloads provenance code at runtime. A deployment may provide
a same-origin `globalThis.ImageXpertC2PAAdapter` with contract version `1`,
`@contentauth/c2pa-web` version `0.8.3` or newer, worker execution, abort support,
and `inspect(bytes, { signal })`. Older `c2pa-web` versions are rejected. Local
inspection is capped at 25 MB, 40 million pixels, and 5 seconds; signature
validity and credential trust are reported as separate fields.

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
The same package and test sequence runs in GitHub Actions on pushes and pull
requests, and publishes the validated unsigned archives as workflow artifacts.

## Companion Extension

Load `extension/` as an unpacked Chrome extension. Right-click a web image and choose `Search with ImageXpert`.

## MediaHunter userscript permissions

MediaHunter runs on HTTPS pages and keeps the browser's native context menu. Its
Tampermonkey permissions are limited to these features:

- `GM_addStyle`: isolated MediaHunter interface styles.
- `GM_openInTab`: user-triggered ImageXpert and search-engine tabs.
- `GM_xmlhttpRequest`: anonymous, timeout-bounded searches of the six declared
  source families: Unsplash, Pexels, Pixabay, Mixkit, YouTube, and Wikimedia.
- `GM_download`: user-triggered downloads from validated HTTP(S) media URLs.
- `GM_getValue` / `GM_setValue`: bounded preferences, galleries, and history.
- `GM_setClipboard`: explicit copy actions and redacted diagnostics.
- `GM_registerMenuCommand`: panel, bar, visibility, handoff, and diagnostic commands.

The six `@connect` entries correspond one-for-one to the cross-origin source
families above. Search engines and result image hosts open or load through normal
browser requests and therefore receive no userscript cross-origin grant.
