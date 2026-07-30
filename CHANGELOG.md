# Changelog

All notable changes to ImageXpert will be documented in this file.

## Unreleased

- Reimagined the app as a responsive visual-investigation workbench with a dominant intake canvas, visible local-only guardrail, compact engine control rail, and clearer URL-search hierarchy.
- Added one-hour hosted-link expiry metadata, safe legacy handling, and reselect/manual recovery instead of redispatching stale URLs.
- Made external-upload authorization session-only with complete public-file, IP metadata, recipient-engine, and host-policy disclosure.
- Added deterministic GitHub Actions gates for tests, unsigned packaging, archive validation, and artifact publication.
- Split the static app into same-origin CSS, a module entry point, and focused media, dispatch, storage/case, upload-policy, engine, service-worker, and UI controllers under a restrictive Content Security Policy.
- Hardened MediaHunter's all-sites boundary with anonymous timeout-bounded requests, strict URL/response/storage limits, reduced cross-origin grants, and hostile-input tests while preserving native context menus.
- Added a worker-only optional C2PA adapter contract that rejects affected `c2pa-web` releases, enforces byte/pixel/time budgets, and reports signature validity separately from credential trust.

## [v1.2.0] - 2026-07-25

- Canonicalized the application on `index.html` with a legacy URL redirect.
- Added schema-versioned, corruption-tolerant settings and bounded history migration.
- Made no-upload mode the safe default for new users and added explicit file intake limits.
- Added cancellable, timeout-bounded upload and media extraction with visible limits and errors.
- Replaced popup fan-out with a per-engine queue that exposes consent, blocked, failed, opened, and retry states.
- Replaced remote and persisted-value HTML interpolation with validated DOM construction.
- Added keyboard-semantic engine, intake, and settings controls plus focus-contained dialogs and live status announcements.
- Preserved native page context menus in the userscript and added a restrictive extension-page CSP.
- Added engine capability, host, maintenance, consent, and text-context metadata to dispatch records.
- Added hash deduplication, stable source IDs, frame timestamps, inclusion review, and per-item retry/cancel states to batch work.
- Added drag-to-select region cropping with original-hash retention and optional Bing text context.
- Added redacted app and userscript diagnostics with copy/export support reports.
- Constrained offline caching to a versioned same-origin shell with explicit offline behavior.
- Added a versioned UI dictionary with English fallback and locale-aware dates.
- Added a collapsible mobile engine picker, sticky privacy state, and camera input.
- Added exact 390px/320px browser checks for overflow, collapsed engines, privacy visibility, camera access, and touch target size.
- Added safe custom-engine manifest import/export with preview, HTTPS-only schema validation, and rollback.
- Added local file metadata and an optional local C2PA inspection adapter with non-authenticity status wording.

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
