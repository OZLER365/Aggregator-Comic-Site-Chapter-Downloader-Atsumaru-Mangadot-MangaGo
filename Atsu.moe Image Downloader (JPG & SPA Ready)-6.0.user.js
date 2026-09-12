// ==UserScript==
// @name         Atsu.moe Image Downloader (JPG & SPA Ready)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Downloads images, converts AVIF to high-quality JPG, natively zips, and tracks SPA navigation.
// @author       ozler
// @match        https://atsu.moe/read/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        unsafeWindow
// @connect      cdn.atsu.moe
// ==/UserScript==

(function() {
    'use strict';

    const pagesCache = {};
    let isDownloading = false;
    let lastUrl = location.href;

    const ICONS = {
        download: `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 512 512" fill="currentColor"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>`,
        check: `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 448 512" fill="#a6e3a1"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>`,
        error: `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 512 512" fill="#f38ba8"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480H40c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24V296c0 13.3 10.7 24 24 24s24-10.7 24-24V184c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>`
    };

    function getCurrentChapterId() {
        return window.location.pathname.split('/')[3];
    }

    // --- Native CSP-Safe ZIP Generator ---
    function generateNativeZip(files) {
        const crcTable = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
            crcTable[i] = c;
        }
        function crc32(buf) {
            let crc = 0xFFFFFFFF;
            for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
            return (crc ^ 0xFFFFFFFF) >>> 0;
        }

        let zipData = [];
        let centralDirectory = [];
        let offset = 0;

        files.forEach(file => {
            const nameBuf = new TextEncoder().encode(file.name);
            const data = file.data;
            const crc = crc32(data);
            const size = data.length;

            const lfh = new ArrayBuffer(30 + nameBuf.length);
            const lfhView = new DataView(lfh);
            lfhView.setUint32(0, 0x04034b50, true);
            lfhView.setUint16(4, 20, true);
            lfhView.setUint16(8, 0, true);
            lfhView.setUint32(14, crc, true);
            lfhView.setUint32(18, size, true);
            lfhView.setUint32(22, size, true);
            lfhView.setUint16(26, nameBuf.length, true);
            new Uint8Array(lfh, 30).set(nameBuf);
            zipData.push(new Uint8Array(lfh));
            zipData.push(data);

            const cdfh = new ArrayBuffer(46 + nameBuf.length);
            const cdfhView = new DataView(cdfh);
            cdfhView.setUint32(0, 0x02014b50, true);
            cdfhView.setUint16(4, 20, true);
            cdfhView.setUint16(6, 20, true);
            cdfhView.setUint32(16, crc, true);
            cdfhView.setUint32(20, size, true);
            cdfhView.setUint32(24, size, true);
            cdfhView.setUint16(28, nameBuf.length, true);
            cdfhView.setUint32(42, offset, true);
            new Uint8Array(cdfh, 46).set(nameBuf);
            centralDirectory.push(new Uint8Array(cdfh));

            offset += lfh.byteLength + size;
        });

        const cdSize = centralDirectory.reduce((acc, val) => acc + val.length, 0);
        const eocd = new ArrayBuffer(22);
        const eocdView = new DataView(eocd);
        eocdView.setUint32(0, 0x06054b50, true);
        eocdView.setUint16(8, files.length, true);
        eocdView.setUint16(10, files.length, true);
        eocdView.setUint32(12, cdSize, true);
        eocdView.setUint32(16, offset, true);

        return new Blob([...zipData, ...centralDirectory, new Uint8Array(eocd)], { type: 'application/zip' });
    }

    // 1. Intercept SPA Navigation dynamically routing to current Chapter ID
    const interceptorCode = `
    (function() {
        function findPages(obj) {
            if (!obj) return null;
            if (obj.readChapter && obj.readChapter.pages) return obj.readChapter.pages;
            if (typeof obj === 'object') {
                for (let key in obj) {
                    if (obj[key] && typeof obj[key] === 'object') {
                        let res = findPages(obj[key]);
                        if (res) return res;
                    }
                }
            }
            return null;
        }

        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await origFetch.apply(this, args);
            try {
                const clone = response.clone();
                clone.json().then(data => {
                    const pages = findPages(data);
                    if (pages && pages.length > 0) {
                        let extractedChId = "unknown";
                        const firstEntry = pages[0];
                        const urlStr = typeof firstEntry === 'string' ? firstEntry : (firstEntry.url || firstEntry.src || firstEntry.path || Object.values(firstEntry).find(v => typeof v === 'string' && v.includes('/static/')));
                        if (urlStr) {
                            const match = urlStr.match(/\\/pages\\/([^/]+)\\//);
                            if (match) extractedChId = match[1];
                        }
                        window.postMessage({ type: 'ATSU_PAGES', pages: pages, chapterId: extractedChId }, '*');
                    }
                }).catch(e => {});
            } catch(e) {}
            return response;
        };
    })();
    `;
    const scriptEl = document.createElement('script');
    scriptEl.textContent = interceptorCode;
    document.documentElement.appendChild(scriptEl);
    scriptEl.remove();

    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'ATSU_PAGES') {
            let chId = event.data.chapterId;
            if (chId === "unknown") chId = getCurrentChapterId();
            if (chId) pagesCache[chId] = event.data.pages;
            checkReadyState();
        }
    });

    function scanInitialState() {
        const chId = getCurrentChapterId();
        if (!chId || pagesCache[chId]) return;

        function findPages(obj) {
            if (!obj) return null;
            if (obj.readChapter && obj.readChapter.pages) return obj.readChapter.pages;
            if (typeof obj === 'object') {
                for (let key in obj) {
                    if (obj[key] && typeof obj[key] === 'object') {
                        let res = findPages(obj[key]);
                        if (res) return res;
                    }
                }
            }
            return null;
        }

        if (typeof unsafeWindow !== 'undefined' && unsafeWindow.__NEXT_DATA__) {
            const pages = findPages(unsafeWindow.__NEXT_DATA__);
            if (pages) pagesCache[chId] = pages;
        }
        if (!pagesCache[chId]) {
            const nextScript = document.querySelector('script[id="__NEXT_DATA__"]');
            if (nextScript) {
                try {
                    const pages = findPages(JSON.parse(nextScript.textContent));
                    if (pages) pagesCache[chId] = pages;
                } catch (e) {}
            }
        }
    }

    // 2. Continuous UI and State Management
    function injectButton() {
        if (document.getElementById('atsu-dl-btn')) return;
        const targetContainer = document.querySelector('div.absolute.top-12.right-12.z-10.h-fit > div.flex.flex-col');
        if (!targetContainer) return;

        const btn = document.createElement('button');
        btn.id = 'atsu-dl-btn';
        btn.className = 'size-40 relative focus:outline-none cursor-pointer hover:bg-slate3 rounded-md bg-slate2 grid place-items-center text-inherit';
        btn.title = 'Download Chapter ZIP (JPG)';
        btn.innerHTML = ICONS.download;
        btn.style.opacity = '0.4';

        targetContainer.appendChild(btn);
        btn.addEventListener('click', startDownload);
    }

    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            isDownloading = false;
            const btn = document.getElementById('atsu-dl-btn');
            if (btn) resetState(btn);
        }
        injectButton();
        scanInitialState();
        checkReadyState();
    }, 1000);

    function checkReadyState() {
        const btn = document.getElementById('atsu-dl-btn');
        const chId = getCurrentChapterId();
        if (btn && !isDownloading && pagesCache[chId]) {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    }

    // 3. Download Process
    async function startDownload() {
        const btn = document.getElementById('atsu-dl-btn');
        const chId = getCurrentChapterId();
        const activePages = pagesCache[chId];

        if (!activePages || isDownloading) return;

        isDownloading = true;
        btn.style.cursor = 'wait';

        const paths = activePages.map(p => {
            if (typeof p === 'string') return p;
            if (p && typeof p === 'object') {
                return p.url || p.src || p.path || p.file || p.image || Object.values(p).find(v => typeof v === 'string' && (v.includes('/static/') || v.includes('.avif')));
            }
            return null;
        }).filter(url => typeof url === 'string');

        if (paths.length === 0) {
            btn.innerHTML = ICONS.error;
            setTimeout(() => resetState(btn), 3000);
            return;
        }

        let filesData = [];

        for (let i = 0; i < paths.length; i++) {
            const percent = Math.round(((i) / paths.length) * 100);
            btn.innerHTML = `<span style="font-size: 11px; font-weight: bold;">${percent}%</span>`;

            let url = paths[i];
            if (!url.startsWith('http')) {
                url = 'https://cdn.atsu.moe' + (url.startsWith('/') ? '' : '/') + url;
            }

            try {
                const avifBlob = await fetchAsBlob(url);
                const jpgBlob = await convertAvifToJpg(avifBlob); // Converts to JPG
                const arrayBuffer = await jpgBlob.arrayBuffer();
                const fileName = `page_${String(i + 1).padStart(3, '0')}.jpg`;
                filesData.push({ name: fileName, data: new Uint8Array(arrayBuffer) });
            } catch (err) {
                console.error(`Failed to process page ${i + 1}:`, err);
            }
        }

        btn.innerHTML = `<span style="font-size: 11px; font-weight: bold;">ZIP</span>`;

        try {
            const zipBlob = generateNativeZip(filesData);
            const objectUrl = URL.createObjectURL(zipBlob);
            const safeTitle = document.title.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'chapter';

            GM_download({
                url: objectUrl,
                name: `${safeTitle}.zip`,
                saveAs: false,
                onload: () => {
                    btn.innerHTML = ICONS.check;
                    setTimeout(() => {
                        URL.revokeObjectURL(objectUrl);
                        resetState(btn);
                    }, 3000);
                },
                onerror: (err) => {
                    console.error("GM_download failed:", err);
                    btn.innerHTML = ICONS.error;
                    setTimeout(() => resetState(btn), 3000);
                }
            });
        } catch (err) {
            console.error("Zip generation failed:", err);
            btn.innerHTML = ICONS.error;
            setTimeout(() => resetState(btn), 3000);
        }
    }

    function resetState(btn) {
        isDownloading = false;
        btn.innerHTML = ICONS.download;
        btn.style.cursor = 'pointer';
        checkReadyState(); // Will return opacity back to 1 if pages are cached
    }

    function fetchAsBlob(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url: url, responseType: 'blob',
                onload: (res) => res.status === 200 ? resolve(res.response) : reject(res.statusText),
                onerror: (err) => reject(err)
            });
        });
    }

    // High Quality JPG Conversion with White Background applied to prevent transparent layer blackouts
    function convertAvifToJpg(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(blob);

            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);

                canvas.toBlob((jpgBlob) => {
                    URL.revokeObjectURL(objectUrl);
                    jpgBlob ? resolve(jpgBlob) : reject(new Error('Canvas failed'));
                }, 'image/jpeg', 0.95);
            };
            img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Load failed')); };
            img.src = objectUrl;
        });
    }
})();