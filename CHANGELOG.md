# Changelog

All notable changes to ImageXpert will be documented in this file.

## Unreleased

## [v1.3.0] - 2026-07-29

- Reimagined the app as a responsive visual-investigation workbench with a dominant intake canvas, visible local-only guardrail, compact engine control rail, and clearer URL-search hierarchy.
- Added one-hour hosted-link expiry metadata, safe legacy handling, and reselect/manual recovery instead of redispatching stale URLs.
- Made external-upload authorization session-only with complete public-file, IP metadata, recipient-engine, and host-policy disclosure.
- Added deterministic GitHub Actions gates for tests, unsigned packaging, archive validation, and artifact publication.
- Split the static app into same-origin CSS, a module entry point, and focused media, dispatch, storage/case, upload-policy, engine, service-worker, and UI controllers under a restrictive Content Security Policy.
- Hardened MediaHunter's all-sites boundary with anonymous timeout-bounded requests, strict URL/response/storage limits, reduced cross-origin grants, and hostile-input tests while preserving native context menus.
- Added a worker-only optional C2PA adapter contract that rejects affected `c2pa-web` releases, enforces byte/pixel/time budgets, and reports signature validity separately from credential trust.
- Reworked PWA updates around complete versioned caches, explicit save-and-reload activation, offline/update status, failed-install rollback, stale-cache cleanup, and remote-workspace recovery.
- Moved built-in engines into a validated registry with dated capability, dispatch, privacy, and lifecycle metadata plus deterministic and optional non-fatal live verification commands.
- Added continuous WCAG 2.2 interaction checks, assertive error announcements, inert dialogs, skip navigation, reduced motion, keyboard region selection, and high-zoom reflow coverage.
- Added a compact laptop-height workspace that keeps drop, URL, privacy, engine-summary, and dispatch controls in the initial 1366×768 and 1280×720 viewport while retaining scrollable loaded-image tools.
- Replaced stale automatic-search and popup-permission help with queue/privacy/CORS guidance and dated engine groups for exact/source, general/product, illustration/anime, and consent-gated biometric intent.
- Added persistent browser-language selection, complete Spanish and expansion-test catalogs, locale-aware dates/numbers/lists, and localized companion/userscript metadata.
- Added transactional, schema-versioned case import with strict size/URL/hash/timestamp validation, migration preview, expired-host protection, and resumable remote investigations.
- Expanded redacted diagnostics with app/schema/cache/update state, storage quota and persistence, custom-engine totals, and active/expired hosted-record counts.
- Added portable settings and custom-engine bundles with conflict previews, strict data-only validation, safe local-only defaults, and durable one-click rollback.
- Added local history search plus date, source, engine, dispatch-outcome, and expiry filters with a versioned redacted metadata export.
- Added separate unsigned Chrome, Edge, and Firefox MV3 companion packages from one localized, least-privilege background implementation with handoff smoke tests.
- Added bounded local pHash/dHash duplicate grouping with configurable Hamming thresholds and explicit advisory-only review while retaining automatic exact deduplication.
- Consolidated version/theme/icon metadata, aligned the PWA shell with the current palette, and replaced duplicate 1024px payloads with validated 16/32/48/128 and 32/192/512 assets.

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

## Roadmap archive — 2026-08-10 — ROADMAP.md

<details>
<summary>Original roadmap snapshot</summary>

```markdown
# ImageXpert Roadmap

Core roadmap baseline was empty before this research pass. True blockers are tracked in `Roadmap_Blocked.md`.

## Research-Driven Additions

### P0 — Now

### P1 — Next

### P2 — Later

### P3 — Under Consideration
```

</details>
