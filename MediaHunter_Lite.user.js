// ==UserScript==
// @name         MediaHunter Lite
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Lightweight media search & download tool. Deep Scan pages for images/videos, Reverse Image Search, Batch Download.
// @author       Debloated Fork
// @icon         https://img.icons8.com/?size=100&id=zS0X1cipar3P&format=png&color=000000
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @connect      unsplash.com
// @connect      pexels.com
// @connect      pixabay.com
// @connect      mixkit.co
// @connect      youtube.com
// @connect      google.com
// @connect      wikimedia.org
// @connect      images.pexels.com
// @connect      images.unsplash.com
// @connect      cdn.pixabay.com
// @connect      upload.wikimedia.org
// @connect      i.ytimg.com
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    if (window.top !== window.self) return;

    const ICONS = {
        gear: `<svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`
    };

    const TEXT = {
        title: "MEDIAHUNTER", subtitle: "LITE",
        tab_p: "PHOTOS", tab_v: "VIDEOS", tab_h: "HISTORY", tab_c: "CONFIG",
        ph_p: "Search...", ph_v: "Search Videos...",
        lbl_int: "SOURCES", lbl_ext: "🌍 EXTERNAL SEARCH", lbl_ori: "ORIENTATION",
        btn_p: "🚀 SEARCH", btn_scan_p: "👁️ DEEP SCAN PHOTOS", btn_scan_v: "👁️ DEEP SCAN VIDEOS",
        btn_v: "🎥 SEARCH VIDEOS", btn_ext: "🌐 OPEN ALL ENGINES",
        btn_clr: "Clear History", btn_dl: "DOWNLOAD", load: "Scanning...", dl_wait: "⏳...",
        confirm_del: "Delete Gallery?", confirm_clr: "Empty Gallery?", empty: "Empty!",
        vid_tag: "Video Tag", file_link: "File Link", xray_src: "Deep Scan", yt_copy: "Link Copied!",
        cfg_theme: "UI THEME", cfg_keys: "KEYBOARD SHORTCUTS", cfg_hide: "HIDE UI",
        key_h: "Hide/Show All", key_s: "Toggle Panel", key_b: "Toggle Gallery", power_off: "Hide Interface (Alt+X)"
    };

    const state = {
        isOpen: false,
        isBarOpen: true,
        isVisible: GM_getValue('mh_is_visible', true),
        currentMode: 'photos',
        themeColor: GM_getValue('mh_theme', '#00E676'),
        orientation: 'all',
        sources: { unsplash: true, pexels: true, pixabay: true, wikimedia: true, mixkit: true, pexelsVideo: true, pixabayVideo: true, youtube: true },
        collections: GM_getValue('mh_collections', [{ name: 'Default', items: [] }]),
        activeCollectionIndex: 0,
        history: GM_getValue('mh_history', []),
        isScanning: false,
        currentQuery: '',
        page: 1,
        isLoading: false,
        foundItems: new Set()
    };

    function saveCollections() { GM_setValue('mh_collections', state.collections); }
    function saveHistory() { GM_setValue('mh_history', state.history); }
    function getActiveCollection() { return state.collections[state.activeCollectionIndex]; }

    function wipeResults(type) {
        const id = type === 'video' ? 'mh-res-v' : 'mh-res-p';
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
        state.page = 1;
        state.isLoading = false;
        document.querySelector('.mh-content').scrollTop = 0;
    }

    function extractValidImage(imgEl) {
        if (!imgEl) return null;
        if (imgEl.closest('#mh-suite') || imgEl.closest('#mh-bar') || imgEl.closest('#mh-big-preview')) return null;
        let src = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy-src');
        if (src && src.includes('blank.gif') && imgEl.srcset) {
            let parts = imgEl.srcset.split(',');
            if (parts.length > 0) src = parts[0].trim().split(' ')[0];
        }
        if (src && (src.includes('blank.gif') || src.startsWith('data:'))) return null;
        return src;
    }

    function getFileNameFromUrl(url, type) {
        try {
            if (url.includes('pexels.com/download')) return 'pexels_' + Date.now() + (type === 'video' ? '.mp4' : '.jpg');
            const cleanUrl = url.split('?')[0];
            let filename = cleanUrl.split('/').pop();
            filename = decodeURIComponent(filename);
            if (!filename.includes('.')) filename += (type === 'video' ? '.mp4' : '.jpg');
            return filename;
        } catch (e) {
            return (type === 'video' ? 'video_' : 'image_') + Date.now() + (type === 'video' ? '.mp4' : '.jpg');
        }
    }

    function getYoutubeID(url) {
        let vidId = '';
        if (url.includes('v=')) vidId = url.split('v=')[1].split('&')[0];
        else if (url.includes('youtu.be/')) vidId = url.split('youtu.be/')[1].split('?')[0];
        return vidId;
    }

    function setTheme(color) {
        state.themeColor = color;
        GM_setValue('mh_theme', color);
        document.documentElement.style.setProperty('--mh-theme', color);
    }

    GM_registerMenuCommand(`👁️ Toggle Panel (Alt+M)`, toggleSuite);
    GM_registerMenuCommand(`🎞️ Toggle Bar (Alt+B)`, toggleBar);
    GM_registerMenuCommand(`👻 Stealth Mode (Alt+X)`, toggleMasterVisibility);

    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 'x' || e.key === 'X')) toggleMasterVisibility();
        if (e.altKey && (e.key === 'm' || e.key === 'M')) toggleSuite();
        if (e.altKey && (e.key === 'b' || e.key === 'B')) toggleBar();
        if (e.altKey && (e.key === 's' || e.key === 'S')) toggleSuite();
    });

    function toggleMasterVisibility() {
        state.isVisible = !state.isVisible;
        GM_setValue('mh_is_visible', state.isVisible);
        const elements = ['#mh-suite', '#mh-bar', '#mh-trigger', '#mh-big-preview'];
        elements.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) el.classList.toggle('mh-invisible', !state.isVisible);
        });
    }

    const css = `
        :root { --mh-theme: ${state.themeColor}; }
        #mh-suite { position: fixed; top: 0; right: 0; width: 420px; height: 100vh;
            background: #0a0a0a; border-left: 1px solid #222; z-index: 2147483647;
            display: flex; flex-direction: column; transform: translateX(100%);
            transition: transform 0.3s ease; font-family: system-ui, -apple-system, sans-serif;
            color: #eee; box-shadow: -5px 0 30px rgba(0,0,0,0.8); }
        #mh-suite.visible { transform: translateX(0); }
        .mh-header { padding: 12px 16px; background: #111; border-bottom: 2px solid var(--mh-theme);
            display: flex; justify-content: space-between; align-items: center; }
        .mh-title { font-weight: 800; color: #fff; letter-spacing: 2px; font-size: 14px; }
        .mh-subtitle { color: var(--mh-theme); font-size: 10px; margin-left: 6px; font-weight: 700; }
        .mh-close { cursor: pointer; font-size: 18px; color: #666; transition: 0.2s; }
        .mh-close:hover { color: #fff; }
        .mh-power { cursor: pointer; font-size: 16px; color: #D32F2F; transition: 0.2s; margin-right: auto; margin-left: 12px; }
        .mh-power:hover { color: #ff5252; }
        .mh-nav { display: flex; background: #151515; }
        .mh-nav-btn { flex: 1; padding: 10px 0; text-align: center; cursor: pointer; font-size: 10px;
            font-weight: 700; color: #555; border-bottom: 2px solid transparent; transition: 0.2s; }
        .mh-nav-btn:hover { background: #1a1a1a; color: #999; }
        .mh-nav-btn.active { color: #fff; border-bottom-color: var(--mh-theme); background: #0a0a0a; }
        .mh-content { flex-grow: 1; overflow-y: auto; padding: 16px; }
        .mh-section { display: none; width: 100%; }
        .mh-section.active { display: block; }
        .mh-input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 10px;
            border-radius: 4px; font-size: 13px; outline: none; margin-bottom: 8px; box-sizing: border-box; }
        .mh-input:focus { border-color: var(--mh-theme); }
        .mh-box { background: #111; padding: 10px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #222; }
        .mh-label { font-size: 9px; font-weight: 800; color: #666; margin-bottom: 6px; display: block; text-transform: uppercase; letter-spacing: 1px; }
        .mh-chips { display: flex; gap: 5px; flex-wrap: wrap; }
        .mh-chip { background: #1a1a1a; border: 1px solid #333; padding: 5px 10px; border-radius: 3px;
            font-size: 10px; cursor: pointer; transition: 0.2s; color: #888; }
        .mh-chip:hover { color: #fff; border-color: #555; }
        .mh-chip.selected { background: var(--mh-theme); border-color: var(--mh-theme); color: #000; font-weight: 700; }
        .mh-btn { width: 100%; padding: 10px; border: none; border-radius: 4px; cursor: pointer;
            font-weight: 700; font-size: 11px; display: flex; align-items: center; justify-content: center;
            gap: 6px; transition: 0.2s; text-transform: uppercase; }
        .btn-main { background: var(--mh-theme); color: #000; }
        .btn-main:hover { filter: brightness(1.15); }
        .btn-sec { background: #222; color: #aaa; margin-top: 8px; }
        .btn-sec:hover { background: #333; color: #fff; }
        .mh-engines { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
        .mh-eng-btn { background: #0a0a0a; border: 1px solid #222; color: #777; padding: 8px;
            border-radius: 3px; cursor: pointer; font-size: 10px; text-align: center; transition: 0.2s; }
        .mh-eng-btn:hover { border-color: var(--mh-theme); color: #fff; }
        #mh-res-p, #mh-res-v { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; }
        .mh-res-item { height: 110px; background: #000; border-radius: 4px; overflow: hidden;
            position: relative; border: 2px solid #1a1a1a; cursor: pointer; transition: 0.2s; }
        .mh-res-item:hover { border-color: var(--mh-theme); transform: scale(1.02); z-index: 2; }
        .mh-res-item img, .mh-res-item video { width: 100%; height: 100%; object-fit: cover; }
        #mh-bar { position: fixed; bottom: 0; left: 0; width: 100%; height: 140px; background: #0a0a0a;
            border-top: 2px solid var(--mh-theme); z-index: 2147483646; transform: translateY(100%);
            transition: transform 0.3s; display: flex; flex-direction: column; }
        #mh-bar.visible { transform: translateY(0); }
        .mh-bar-head { padding: 6px 16px; background: #000; display: flex; justify-content: space-between;
            align-items: center; border-bottom: 1px solid #1a1a1a; }
        .mh-gal-ctrl { display: flex; align-items: center; gap: 8px; }
        .mh-select { background: #1a1a1a; color: #fff; border: 1px solid #333; padding: 4px 8px;
            border-radius: 3px; font-size: 10px; outline: none; }
        .mh-icon-btn { cursor: pointer; font-size: 12px; padding: 3px; border-radius: 3px; background: #1a1a1a;
            border: 1px solid #333; color: #aaa; width: 22px; height: 22px; display: flex;
            align-items: center; justify-content: center; }
        .mh-icon-btn:hover { background: #333; color: #fff; }
        .btn-danger:hover { background: #D32F2F; border-color: #D32F2F; }
        .mh-bar-list { flex-grow: 1; display: flex; gap: 10px; padding: 12px; overflow-x: auto; align-items: center; }
        .mh-col-item { min-width: 130px; height: 75px; border: 1px solid #222; border-radius: 4px;
            overflow: hidden; position: relative; transition: 0.2s; flex-shrink: 0; }
        .mh-col-item:hover { border-color: var(--mh-theme); }
        .mh-col-item img, .mh-col-item video { width: 100%; height: 100%; object-fit: cover; }
        .mh-col-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9); display: none; flex-direction: column;
            justify-content: space-evenly; align-items: center; padding: 4px; box-sizing: border-box; }
        .mh-col-item:hover .mh-col-overlay { display: flex; }
        .mh-btn-row { display: flex; gap: 4px; width: 100%; justify-content: center; }
        .mh-mini-btn { font-size: 9px; font-weight: 700; padding: 5px; border-radius: 3px;
            border: 1px solid #444; background: #000; color: #fff; cursor: pointer; text-align: center;
            transition: 0.2s; text-transform: uppercase; }
        .mh-mini-btn:hover { transform: scale(1.05); }
        .btn-dl { width: 90%; border-color: var(--mh-theme); color: var(--mh-theme); }
        .btn-dl:hover { background: var(--mh-theme); color: #000; }
        .btn-google { flex: 1; border-color: #4285F4; color: #4285F4; }
        .btn-google:hover { background: #4285F4; color: #fff; }
        .btn-yandex { flex: 1; border-color: #FC3F1D; color: #FC3F1D; }
        .btn-yandex:hover { background: #FC3F1D; color: #fff; }
        .btn-rmv { width: 90%; border-color: #D32F2F; color: #D32F2F; }
        .btn-rmv:hover { background: #D32F2F; color: #fff; }
        #mh-big-preview { position: fixed; bottom: 160px; left: 16px; width: 400px; height: 225px;
            background: #000; border: 2px solid var(--mh-theme); box-shadow: 0 10px 40px rgba(0,0,0,0.9);
            z-index: 2147483655; display: none; border-radius: 6px; overflow: hidden; }
        #mh-big-preview img, #mh-big-preview video, #mh-big-preview iframe { width: 100%; height: 100%;
            object-fit: contain; background: #000; border: none; }
        #mh-trigger { position: fixed; bottom: 150px; right: 16px; width: 56px; height: 56px;
            background: rgba(10,10,10,0.9); border: 2px solid var(--mh-theme); border-radius: 50%;
            z-index: 2147483645; cursor: pointer; display: flex; align-items: center; justify-content: center;
            color: var(--mh-theme); box-shadow: 0 4px 20px rgba(0,0,0,0.6); transition: all 0.3s ease; }
        #mh-trigger:hover { transform: scale(1.1) rotate(90deg); color: #000; background: var(--mh-theme); }
        .mh-loading { grid-column: span 2; text-align: center; color: #666; padding: 16px; font-size: 11px; }
        .mh-hist-item { padding: 8px; border-bottom: 1px solid #222; cursor: pointer; color: #aaa; font-size: 12px; }
        .mh-hist-item:hover { background: #151515; }
        .mh-badge { position: absolute; bottom: 0; left: 0; width: 100%;
            background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
            color: #fff; font-size: 8px; padding: 12px 4px 3px; text-align: right; box-sizing: border-box; }
        .mh-yt-menu { position: absolute; bottom: 30px; left: 5%; width: 90%; background: #0a0a0a;
            border: 1px solid var(--mh-theme); border-radius: 3px; z-index: 10;
            display: flex; flex-direction: column; }
        .mh-yt-opt { padding: 5px; text-align: center; font-size: 9px; color: #aaa; cursor: pointer;
            border-bottom: 1px solid #222; text-transform: uppercase; font-weight: 700; }
        .mh-yt-opt:last-child { border-bottom: none; }
        .mh-yt-opt:hover { background: var(--mh-theme); color: #000; }
        .mh-invisible { display: none !important; }
        .mh-theme-grid { display: flex; gap: 8px; margin-bottom: 16px; }
        .mh-theme-btn { width: 36px; height: 36px; border-radius: 4px; cursor: pointer; border: 2px solid #222; }
        .mh-theme-btn.active { border-color: #fff; }
        .mh-shortcut-row { display: flex; justify-content: space-between; border-bottom: 1px solid #222;
            padding: 8px 0; font-size: 10px; color: #888; }
        .mh-shortcut-key { color: var(--mh-theme); font-weight: 700; font-family: monospace; }
    `;
    GM_addStyle(css);

    const visibilityClass = state.isVisible ? '' : 'mh-invisible';
    const html = `
        <div id="mh-trigger" class="${visibilityClass}">${ICONS.gear}</div>
        <div id="mh-big-preview" class="${visibilityClass}"></div>
        <div id="mh-suite" class="${visibilityClass}">
            <div class="mh-header">
                <div><span class="mh-title">${TEXT.title}</span><span class="mh-subtitle">${TEXT.subtitle}</span></div>
                <span class="mh-power" id="mh-power-btn" title="${TEXT.power_off}">⏻</span>
                <span class="mh-close" id="mh-close">✕</span>
            </div>
            <div class="mh-nav">
                <div class="mh-nav-btn active" data-tab="photos">📷 ${TEXT.tab_p}</div>
                <div class="mh-nav-btn" data-tab="videos">🎬 ${TEXT.tab_v}</div>
                <div class="mh-nav-btn" data-tab="history">🕒 ${TEXT.tab_h}</div>
                <div class="mh-nav-btn" data-tab="config">⚙️ ${TEXT.tab_c}</div>
            </div>
            <div class="mh-content">
                <div id="tab-photos" class="mh-section active">
                    <input type="text" class="mh-input" id="mh-input-p" placeholder="${TEXT.ph_p}">
                    <div class="mh-box">
                        <span class="mh-label">${TEXT.lbl_ori}</span>
                        <div class="mh-chips">
                            <div class="mh-chip selected" data-orient="all">All</div>
                            <div class="mh-chip" data-orient="landscape">Landscape</div>
                            <div class="mh-chip" data-orient="portrait">Portrait</div>
                            <div class="mh-chip" data-orient="square">Square</div>
                        </div>
                    </div>
                    <button class="mh-btn btn-main" id="btn-search-p">${TEXT.btn_p}</button>
                    <button class="mh-btn btn-sec" id="btn-scan">${TEXT.btn_scan_p}</button>
                    <div class="mh-box" style="margin-top:12px;">
                        <span class="mh-label">${TEXT.lbl_ext}</span>
                        <div class="mh-engines">
                            <button class="mh-eng-btn" data-eng="google">🔍 Google</button>
                            <button class="mh-eng-btn" data-eng="yandex">🔎 Yandex</button>
                            <button class="mh-eng-btn" data-eng="bing">🔍 Bing</button>
                            <button class="mh-eng-btn" data-eng="flickr">📷 Flickr</button>
                            <button class="mh-eng-btn" data-eng="openverse">🌐 Openverse</button>
                            <button class="mh-eng-btn" data-eng="tineye">👁️ TinEye</button>
                        </div>
                        <button class="mh-btn btn-sec" id="btn-search-world" style="margin-top:8px;">${TEXT.btn_ext}</button>
                    </div>
                    <div id="mh-res-p"></div>
                </div>
                <div id="tab-videos" class="mh-section">
                    <input type="text" class="mh-input" id="mh-input-v" placeholder="${TEXT.ph_v}">
                    <button class="mh-btn btn-main" id="btn-search-v">${TEXT.btn_v}</button>
                    <button class="mh-btn btn-sec" id="btn-scan-v">${TEXT.btn_scan_v}</button>
                    <div id="mh-res-v"></div>
                </div>
                <div id="tab-history" class="mh-section">
                    <button class="mh-btn btn-sec" id="btn-clear-hist">🗑️ ${TEXT.btn_clr}</button>
                    <div id="mh-hist-list" style="margin-top:12px;"></div>
                </div>
                <div id="tab-config" class="mh-section">
                    <div class="mh-box">
                        <span class="mh-label">${TEXT.cfg_theme}</span>
                        <div class="mh-theme-grid">
                            <div class="mh-theme-btn" style="background:#00E676" data-color="#00E676"></div>
                            <div class="mh-theme-btn" style="background:#2979FF" data-color="#2979FF"></div>
                            <div class="mh-theme-btn" style="background:#FF1744" data-color="#FF1744"></div>
                            <div class="mh-theme-btn" style="background:#D500F9" data-color="#D500F9"></div>
                            <div class="mh-theme-btn" style="background:#FF9100" data-color="#FF9100"></div>
                        </div>
                        <span class="mh-label" style="margin-top:16px;">${TEXT.cfg_keys}</span>
                        <div class="mh-shortcut-row"><span>${TEXT.key_h}</span><span class="mh-shortcut-key">Alt + X</span></div>
                        <div class="mh-shortcut-row"><span>${TEXT.key_s}</span><span class="mh-shortcut-key">Alt + S</span></div>
                        <div class="mh-shortcut-row"><span>${TEXT.key_b}</span><span class="mh-shortcut-key">Alt + B</span></div>
                        <button class="mh-btn btn-sec" id="btn-hide-ui" style="margin-top:16px; border-color:#D32F2F; color:#D32F2F;">⛔ ${TEXT.cfg_hide}</button>
                    </div>
                </div>
            </div>
        </div>
        <div id="mh-bar" class="visible ${visibilityClass}">
            <div class="mh-bar-head">
                <div class="mh-gal-ctrl">
                    <span style="font-weight:700; color:#fff; font-size:10px;">GALLERY:</span>
                    <select id="mh-gal-select" class="mh-select"></select>
                    <button id="mh-add-gal" class="mh-icon-btn" title="New Gallery">+</button>
                    <button id="mh-clear-gal" class="mh-icon-btn" title="Empty Gallery">♻️</button>
                    <button id="mh-del-gal" class="mh-icon-btn btn-danger" title="Delete Gallery">🗑️</button>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:10px; color:#777;">ITEMS: <span id="col-count">0</span></span>
                    <span style="cursor:pointer; color:var(--mh-theme); font-weight:700; font-size:10px;" id="btn-dl-all">${TEXT.btn_dl}</span>
                    <span style="cursor:pointer;" id="btn-hide-bar">▼</span>
                </div>
            </div>
            <div class="mh-bar-list" id="mh-col-list"></div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div);

    const suite = document.getElementById('mh-suite');
    const bar = document.getElementById('mh-bar');
    const bigPreview = document.getElementById('mh-big-preview');
    const contentArea = document.querySelector('.mh-content');

    document.documentElement.style.setProperty('--mh-theme', state.themeColor);

    document.getElementById('mh-trigger').onclick = toggleSuite;
    document.getElementById('mh-close').onclick = toggleSuite;
    document.getElementById('btn-hide-bar').onclick = toggleBar;
    document.getElementById('mh-power-btn').onclick = toggleMasterVisibility;
    document.getElementById('btn-hide-ui').onclick = toggleMasterVisibility;

    function toggleSuite() {
        state.isOpen = !state.isOpen;
        suite.classList.toggle('visible', state.isOpen);
    }
    function toggleBar() {
        state.isBarOpen = !state.isBarOpen;
        bar.classList.toggle('visible', state.isBarOpen);
    }

    document.querySelectorAll('.mh-nav-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.mh-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.mh-section').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        };
    });

    document.querySelectorAll('.mh-theme-btn').forEach(btn => {
        btn.onclick = () => setTheme(btn.dataset.color);
    });

    document.querySelectorAll('.mh-chip').forEach(chip => {
        chip.onclick = () => {
            if (chip.dataset.orient) {
                chip.parentElement.querySelectorAll('.mh-chip').forEach(c => c.classList.remove('selected'));
                chip.classList.add('selected');
                state.orientation = chip.dataset.orient;
            }
        };
    });

    function addToCollection(fullUrl, thumbUrl, type) {
        const active = getActiveCollection();
        if (active.items.some(i => i.full === fullUrl)) return;
        active.items.push({ full: fullUrl, thumb: thumbUrl, type, name: getFileNameFromUrl(fullUrl, type) });
        saveCollections();
        updateGalleryDropdown();
        renderCollection();
    }

    function removeFromCollection(index) {
        const active = getActiveCollection();
        active.items.splice(index, 1);
        saveCollections();
        updateGalleryDropdown();
        renderCollection();
    }

    function renderCollection() {
        const list = document.getElementById('mh-col-list');
        const active = getActiveCollection();
        document.getElementById('col-count').innerText = active.items.length;
        list.innerHTML = '';
        active.items.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'mh-col-item';
            const isVideo = item.type === 'video' || item.full.match(/\.(mp4|webm|mkv|mov)(\?|$)/i);
            const isYT = item.type === 'youtube' || item.full.includes('youtube.com') || item.full.includes('youtu.be');
            let content = isVideo ? `<video src="${item.thumb}" muted referrerpolicy="no-referrer"></video>` : `<img src="${item.thumb}" referrerpolicy="no-referrer">`;
            if (isYT) {
                const vidId = getYoutubeID(item.full);
                content = `<img src="https://img.youtube.com/vi/${vidId}/mqdefault.jpg" referrerpolicy="no-referrer">`;
            }
            div.innerHTML = `${content}
                <div class="mh-col-overlay">
                    <button class="mh-mini-btn btn-dl">⬇ Download</button>
                    <div class="mh-btn-row">
                        <button class="mh-mini-btn btn-google">G</button>
                        <button class="mh-mini-btn btn-yandex">Y</button>
                    </div>
                    <button class="mh-mini-btn btn-rmv">✕ Remove</button>
                </div>`;
            div.onmouseenter = () => {
                bigPreview.innerHTML = isYT ? `<img src="https://img.youtube.com/vi/${getYoutubeID(item.full)}/maxresdefault.jpg">` :
                    isVideo ? `<video src="${item.full}" autoplay muted loop referrerpolicy="no-referrer"></video>` :
                    `<img src="${item.full}" referrerpolicy="no-referrer">`;
                bigPreview.style.display = 'block';
            };
            div.onmouseleave = () => { bigPreview.style.display = 'none'; bigPreview.innerHTML = ''; };
            div.querySelector('.btn-rmv').onclick = () => removeFromCollection(index);
            div.querySelector('.btn-dl').onclick = () => {
                if (isYT) {
                    GM_setClipboard(item.full);
                    alert(TEXT.yt_copy);
                    window.open('https://cobalt.tools/', '_blank');
                } else {
                    GM_download({ url: item.full, name: item.name, saveAs: false });
                }
            };
            div.querySelector('.btn-google').onclick = () => GM_openInTab(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(item.full)}`, { active: true });
            div.querySelector('.btn-yandex').onclick = () => GM_openInTab(`https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(item.full)}`, { active: true });
            list.appendChild(div);
        });
    }

    function addToHistory(term) {
        state.history = state.history.filter(h => h !== term);
        state.history.unshift(term);
        if (state.history.length > 50) state.history.pop();
        saveHistory();
        renderHistory();
    }

    function renderHistory() {
        const list = document.getElementById('mh-hist-list');
        list.innerHTML = '';
        state.history.forEach(term => {
            const div = document.createElement('div');
            div.className = 'mh-hist-item';
            div.innerText = `🕒 ${term}`;
            div.onclick = () => {
                document.getElementById('mh-input-p').value = term;
                document.getElementById('mh-input-v').value = term;
                if (state.currentMode === 'videos') searchVideos(true);
                else searchPhotos(true);
            };
            list.appendChild(div);
        });
    }

    function searchPhotos(isNew = true) {
        let query = document.getElementById('mh-input-p').value;
        if (!query) return;
        if (isNew) {
            state.isScanning = false;
            wipeResults('photo');
            state.currentMode = 'photos';
            state.currentQuery = query;
            addToHistory(query);
        }
        const container = document.getElementById('mh-res-p');
        if (isNew) container.innerHTML = `<div class="mh-loading">${TEXT.load}</div>`;
        state.isLoading = true;
        const finish = () => { state.isLoading = false; };

        let orientUnsplash = state.orientation === 'all' ? '' : state.orientation;
        let orientPexels = state.orientation === 'all' ? '' : state.orientation;
        let orientPixabay = state.orientation === 'landscape' ? 'horizontal' : state.orientation === 'portrait' ? 'vertical' : state.orientation;

        if (state.sources.unsplash) {
            const uUrl = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=12&page=${state.page}&orientation=${orientUnsplash}`;
            GM_xmlhttpRequest({
                method: "GET", url: uUrl,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (container.innerText.includes('Scanning')) container.innerHTML = '';
                        data.results.forEach(p => renderResult(container, p.urls.small, p.urls.regular, 'Unsplash'));
                    } catch (e) {}
                    finish();
                },
                onerror: finish
            });
        }

        if (state.sources.pexels) {
            const pUrl = `https://www.pexels.com/search/${encodeURIComponent(query)}/?page=${state.page}&orientation=${orientPexels}`;
            GM_xmlhttpRequest({
                method: "GET", url: pUrl, headers: { "User-Agent": navigator.userAgent },
                onload: (res) => {
                    const doc = new DOMParser().parseFromString(res.responseText, "text/html");
                    doc.querySelectorAll('img').forEach(img => {
                        const src = extractValidImage(img);
                        if (src && src.includes('images.pexels.com/photos'))
                            renderResult(container, src.replace('w=500', 'w=300'), src.split('?')[0], 'Pexels');
                    });
                    finish();
                },
                onerror: finish
            });
        }

        if (state.sources.pixabay) {
            const pbUrl = `https://pixabay.com/images/search/${encodeURIComponent(query)}/?pagi=${state.page}&orientation=${orientPixabay}`;
            GM_xmlhttpRequest({
                method: "GET", url: pbUrl, headers: { "User-Agent": navigator.userAgent },
                onload: (res) => {
                    const doc = new DOMParser().parseFromString(res.responseText, "text/html");
                    if (container.innerText.includes('Scanning')) container.innerHTML = '';
                    doc.querySelectorAll('a > img').forEach(img => {
                        const src = extractValidImage(img);
                        if (src && src.includes('pixabay.com/photo'))
                            renderResult(container, src, src.replace('_340', '_1280').replace('__340', '_1280'), 'Pixabay');
                    });
                    finish();
                },
                onerror: finish
            });
        }

        if (state.sources.wikimedia) {
            const wUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=10&gsroffset=${(state.page - 1) * 10}&prop=imageinfo&iiprop=url&format=json&origin=*`;
            GM_xmlhttpRequest({
                method: "GET", url: wUrl,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        Object.values(data.query.pages).forEach(page => {
                            if (page.imageinfo && page.imageinfo[0])
                                renderResult(container, page.imageinfo[0].url, page.imageinfo[0].url, 'Wikimedia');
                        });
                    } catch (e) {}
                    finish();
                },
                onerror: finish
            });
        }
    }

    function searchVideos(isNew = true) {
        const query = document.getElementById('mh-input-v').value;
        if (!query) return alert("Enter a search term!");
        if (isNew) {
            state.isScanning = false;
            addToHistory(query);
            wipeResults('video');
            state.currentMode = 'videos';
            state.currentQuery = query;
        }
        const container = document.getElementById('mh-res-v');
        if (isNew) container.innerHTML = `<div class="mh-loading">${TEXT.load}</div>`;
        state.isLoading = true;
        const finish = () => { state.isLoading = false; };

        if (state.sources.mixkit) {
            const mkUrl = `https://mixkit.co/free-stock-video/${encodeURIComponent(query)}/?page=${state.page}`;
            GM_xmlhttpRequest({
                method: "GET", url: mkUrl,
                onload: (res) => {
                    if (container.innerText.includes('Scanning')) container.innerHTML = '';
                    const doc = new DOMParser().parseFromString(res.responseText, "text/html");
                    doc.querySelectorAll('video').forEach(vid => {
                        if (vid.src) renderResult(container, vid.src, vid.src, 'Mixkit', 'video');
                    });
                    finish();
                },
                onerror: finish
            });
        }

        if (state.sources.pixabayVideo) {
            const pbUrl = `https://pixabay.com/videos/search/${encodeURIComponent(query)}/?pagi=${state.page}`;
            GM_xmlhttpRequest({
                method: "GET", url: pbUrl,
                onload: (res) => {
                    const doc = new DOMParser().parseFromString(res.responseText, "text/html");
                    doc.querySelectorAll('a[href*="/videos/"]').forEach(a => {
                        const img = a.querySelector('img');
                        const thumb = extractValidImage(img);
                        if (thumb && !a.href.includes('search')) {
                            const largeVideo = thumb.replace(/(_tiny|_small|_medium|_large)\.(jpg|jpeg|mp4)/i, '_large.mp4');
                            renderResult(container, thumb, largeVideo, 'Pixabay', 'image');
                        }
                    });
                    finish();
                },
                onerror: finish
            });
        }

        if (state.sources.pexelsVideo) {
            const pxUrl = `https://www.pexels.com/search/videos/${encodeURIComponent(query)}/?page=${state.page}`;
            GM_xmlhttpRequest({
                method: "GET", url: pxUrl, headers: { "User-Agent": navigator.userAgent },
                onload: (res) => {
                    const doc = new DOMParser().parseFromString(res.responseText, "text/html");
                    doc.querySelectorAll('video source').forEach(src => {
                        if (src.type === 'video/mp4') renderResult(container, src.src, src.src, 'Pexels', 'video');
                    });
                    finish();
                },
                onerror: finish
            });
        }

        if (state.sources.youtube) {
            const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}+4k`;
            GM_xmlhttpRequest({
                method: "GET", url: ytUrl,
                onload: (res) => {
                    const match = res.responseText.match(/var ytInitialData = ({.*?});/);
                    if (match && match[1]) {
                        try {
                            const data = JSON.parse(match[1]);
                            const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
                            if (contents) {
                                contents.forEach(section => {
                                    const items = section?.itemSectionRenderer?.contents || [];
                                    items.forEach(item => {
                                        const vid = item?.videoRenderer;
                                        if (vid && vid.videoId) {
                                            const thumb = `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`;
                                            const link = `https://www.youtube.com/watch?v=${vid.videoId}`;
                                            renderResult(container, thumb, link, 'YouTube', 'image');
                                        }
                                    });
                                });
                            }
                        } catch (e) {}
                    }
                    finish();
                },
                onerror: finish
            });
        }
    }

    function scanPage(manual = false, type = 'image') {
        state.isScanning = manual;
        const container = document.getElementById(type === 'video' ? 'mh-res-v' : 'mh-res-p');
        if (manual) {
            wipeResults(type);
            container.innerHTML = `<div class="mh-loading">${TEXT.load}</div>`;
            state.foundItems.clear();
        }
        const foundItems = state.foundItems;

        if (type === 'image') {
            document.querySelectorAll('img').forEach(img => {
                const src = extractValidImage(img);
                if (src && !foundItems.has(src) && src.length < 1000) {
                    foundItems.add(src);
                    if (container.innerText.includes('Scanning')) container.innerHTML = '';
                    renderResult(container, src, src, 'Page Scan');
                }
            });
            document.querySelectorAll('[style*="background-image"]').forEach(el => {
                const match = el.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
                if (match && match[1] && !foundItems.has(match[1])) {
                    foundItems.add(match[1]);
                    if (container.innerText.includes('Scanning')) container.innerHTML = '';
                    renderResult(container, match[1], match[1], 'Background');
                }
            });
        } else {
            document.querySelectorAll('video').forEach(vid => {
                const src = vid.src || vid.querySelector('source')?.src;
                const poster = vid.poster;
                if (src && !foundItems.has(src)) {
                    foundItems.add(src);
                    if (container.innerText.includes('Scanning')) container.innerHTML = '';
                    renderResult(container, poster || src, src, TEXT.vid_tag, 'video');
                }
            });
            const rawHtml = document.body.innerHTML;
            const mp4Matches = rawHtml.match(/https?:\/\/[^\s"']+\.mp4([^\s"']*)/g);
            if (mp4Matches) {
                mp4Matches.forEach(url => {
                    let clean = url.replace(/\\/g, '').replace(/["']/g, '');
                    if (clean.length < 500 && !foundItems.has(clean)) {
                        foundItems.add(clean);
                        if (container.innerText.includes('Scanning')) container.innerHTML = '';
                        renderResult(container, clean, clean, TEXT.xray_src, 'video');
                    }
                });
            }
        }
    }

    function renderResult(container, thumb, full, label, type = 'image') {
        const div = document.createElement('div');
        div.className = 'mh-res-item';
        div.dataset.full = full;
        let content = (type === 'video') ?
            `<video src="${thumb}" referrerpolicy="no-referrer" muted onmouseover="this.play()" onmouseout="this.pause()"></video>` :
            `<img src="${thumb}" referrerpolicy="no-referrer">`;
        div.innerHTML = `${content}<div class="mh-badge">${label}</div>`;
        div.onclick = () => {
            const isVideoFile = full.match(/\.(mp4|webm|mkv|mov|avi|m4v)(\?|$)/i) || full.includes('/video');
            const isYT = full.includes('youtube.com') || full.includes('youtu.be');
            const finalType = isYT ? 'youtube' : (isVideoFile ? 'video' : 'image');
            addToCollection(full, thumb, finalType);
        };
        container.appendChild(div);
    }

    function updateGalleryDropdown() {
        const select = document.getElementById('mh-gal-select');
        select.innerHTML = '';
        state.collections.forEach((col, idx) => {
            const option = document.createElement('option');
            option.value = idx;
            option.text = `${col.name} (${col.items.length})`;
            if (idx === state.activeCollectionIndex) option.selected = true;
            select.appendChild(option);
        });
    }

    document.getElementById('mh-gal-select').onchange = (e) => {
        state.activeCollectionIndex = parseInt(e.target.value);
        saveCollections();
        renderCollection();
    };

    document.getElementById('mh-add-gal').onclick = () => {
        const name = prompt("New Gallery Name:");
        if (name) {
            state.collections.push({ name, items: [] });
            state.activeCollectionIndex = state.collections.length - 1;
            saveCollections();
            updateGalleryDropdown();
            renderCollection();
        }
    };

    document.getElementById('mh-del-gal').onclick = () => {
        if (state.collections.length <= 1) return alert("Cannot delete the default gallery.");
        if (confirm(TEXT.confirm_del)) {
            state.collections.splice(state.activeCollectionIndex, 1);
            state.activeCollectionIndex = 0;
            saveCollections();
            updateGalleryDropdown();
            renderCollection();
        }
    };

    document.getElementById('mh-clear-gal').onclick = () => {
        if (confirm(TEXT.confirm_clr)) {
            getActiveCollection().items = [];
            saveCollections();
            updateGalleryDropdown();
            renderCollection();
        }
    };

    document.getElementById('btn-search-p').onclick = () => searchPhotos(true);
    document.getElementById('btn-scan').onclick = () => scanPage(true, 'image');
    document.getElementById('btn-search-v').onclick = () => searchVideos(true);
    document.getElementById('btn-scan-v').onclick = () => scanPage(true, 'video');
    document.getElementById('btn-clear-hist').onclick = () => { state.history = []; saveHistory(); renderHistory(); };
    document.querySelectorAll('.mh-eng-btn').forEach(btn => btn.onclick = () => openExternal(btn.dataset.eng));
    document.getElementById('btn-search-world').onclick = () => ['google', 'yandex', 'bing', 'flickr', 'openverse'].forEach(eng => openExternal(eng));
    document.getElementById('mh-input-p').addEventListener('keypress', (e) => { if (e.key === 'Enter') searchPhotos(true); });
    document.getElementById('mh-input-v').addEventListener('keypress', (e) => { if (e.key === 'Enter') searchVideos(true); });

    document.getElementById('btn-dl-all').onclick = () => {
        const active = getActiveCollection();
        if (active.items.length === 0) return alert(TEXT.empty);
        const btn = document.getElementById('btn-dl-all');
        btn.innerText = TEXT.dl_wait;
        active.items.forEach((item) => {
            if (item.type !== 'youtube') {
                GM_download({ url: item.full, name: item.name, saveAs: false });
            }
        });
        setTimeout(() => btn.innerText = TEXT.btn_dl, 3000);
    };

    function openExternal(engine) {
        const q = document.getElementById('mh-input-p').value;
        if (!q) return alert("Enter a keyword!");
        const enc = encodeURIComponent(q);
        let url = '';
        switch (engine) {
            case 'google': url = `https://www.google.com/search?tbm=isch&q=${enc}&tbs=isz:lt,islt:2mp`; break;
            case 'yandex': url = `https://yandex.com/images/search?text=${enc}&isize=large`; break;
            case 'bing': url = `https://www.bing.com/images/search?q=${enc}&qft=+filterui:imagesize-large`; break;
            case 'flickr': url = `https://www.flickr.com/search/?text=${enc}&license=2%2C3%2C4%2C5%2C6%2C9`; break;
            case 'openverse': url = `https://openverse.org/search/image?q=${enc}`; break;
            case 'tineye': url = `https://tineye.com/`; break;
        }
        GM_openInTab(url, { active: true });
    }

    updateGalleryDropdown();
    renderCollection();
    renderHistory();
})();
