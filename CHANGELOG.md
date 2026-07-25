# Changelog

All notable changes to ImageXpert will be documented in this file.

## Unreleased

- Canonicalized the application on `index.html` with a legacy URL redirect.
- Added schema-versioned, corruption-tolerant settings and bounded history migration.
- Made no-upload mode the safe default for new users and added explicit file intake limits.

## [v1.1.0] - 2026-06-27

- Added expanded reverse-search engine coverage for ASCII2D, TraceMoe, PimEyes, and IQDB variants.
- Added batch image dispatch and video keyframe extraction.
- Added local SHA-256, pHash, and dHash cards with copy-on-click.
- Added rotate, center crop, and bottom-strip trim preprocessing.
- Added no-upload dispatch mode for local files.
- Added case file JSON export.
- Added Tampermonkey right-click ImageXpert handoff.
- Added Chrome MV3 companion extension.
- Added PWA manifest and offline service worker shell.
- Removed modal confirmation/alert flows from the app and companion script.

## [v1.0.0] - 2026-06-26

- Added initial static reverse image search hub.
- Added userscript update and download URLs.
