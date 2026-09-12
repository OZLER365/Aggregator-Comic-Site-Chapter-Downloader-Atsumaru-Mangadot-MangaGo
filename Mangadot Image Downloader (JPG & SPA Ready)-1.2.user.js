// ==UserScript==
// @name         Mangadot Image Downloader (JPG & SPA Ready)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Downloads chapter images, converts to JPG, natively zips, tracks SPA, and mimics native UI.
// @author       ozler
// @match        https://mangadot.net/chapter/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        unsafeWindow
// @run-at       document-start
// @connect      mangadot.net
// ==/UserScript==

(function() {
    'use strict';

    const pagesCache = {};
    let isDownloading = false;
    let lastUrl = location.href;

    const ICONS = {
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a6e3a1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f38ba8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
    };

    function getCurrentChapterId() {
        return window.location.pathname.split('/')[2];
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

    // 1. Intercept SPA Navigation by scanning JSON structures instead of URL strings
    const interceptorCode = `
    (function() {
        // Fetch interceptor
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await origFetch.apply(this, args);
            try {
                const clone = response.clone();
                clone.json().then(data => {
                    // Verifies the exact structure from your network tab screenshot
                    if (data && data.chapter && data.chapter.id && Array.isArray(data.images)) {
                        window.postMessage({ type: 'MANGADOT_PAGES', pages: data.images, chapterId: data.chapter.id.toString() }, '*');
                    }
                }).catch(e => {});
            } catch(e) {}
            return response;
        };

        // XHR interceptor fallback
        const origSend = window.XMLHttpRequest.prototype.send;
        window.XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('load', function() {
                try {
                    if (this.responseText && this.responseText.includes('"images":[')) {
                        const data = JSON.parse(this.responseText);
                        if (data && data.chapter && data.chapter.id && Array.isArray(data.images)) {
                            window.postMessage({ type: 'MANGADOT_PAGES', pages: data.images, chapterId: data.chapter.id.toString() }, '*');
                        }
                    }
                } catch (e) {}
            });
            return origSend.apply(this, args);
        };
    })();
    `;

    const scriptEl = document.createElement('script');
    scriptEl.textContent = interceptorCode;
    (document.head || document.documentElement).appendChild(scriptEl);
    scriptEl.remove();

    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'MANGADOT_PAGES') {
            const chId = event.data.chapterId;
            if (chId) pagesCache[chId] = event.data.pages;
        }
    });

    // 2. UI Injection - Anchored to the native Settings button
    function injectButton() {
        if (document.getElementById('mdot-dl-btn')) return;

        const settingsBtn = document.querySelector('button[aria-label="Open reader settings"], button[title="Settings"]');
        if (!settingsBtn || !settingsBtn.parentElement) return;

        const targetContainer = settingsBtn.parentElement;

        const btn = document.createElement('button');
        btn.id = 'mdot-dl-btn';
        btn.className = settingsBtn.className;
        btn.title = 'Download Chapter ZIP';
        btn.innerHTML = ICONS.download;
        btn.style.opacity = '1';

        targetContainer.appendChild(btn);
        btn.addEventListener('click', startDownload);
    }

    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            isDownloading = false;
            const btn = document.getElementById('mdot-dl-btn');
            if (btn) resetState(btn);
        }
        injectButton();
    }, 1000);

    // 3. Download Process
    async function startDownload() {
        const btn = document.getElementById('mdot-dl-btn');
        const chId = getCurrentChapterId();
        const activePages = pagesCache[chId];

        if (!activePages || isDownloading) {
            btn.innerHTML = ICONS.error;
            setTimeout(() => resetState(btn), 2000);
            return;
        }

        isDownloading = true;
        btn.style.cursor = 'wait';

        const paths = activePages.map(p => {
            if (typeof p === 'string') return p;
            if (p && typeof p === 'object') {
                return p.url || p.src || p.path || p.file || p.image;
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
            btn.innerHTML = `<span style="font-size: 10px; font-weight: bold; line-height: 1;">${percent}%</span>`;

            let url = paths[i];
            if (!url.startsWith('http')) {
                url = 'https://mangadot.net' + (url.startsWith('/') ? '' : '/') + url;
            }

            try {
                const imgBlob = await fetchAsBlob(url);
                const jpgBlob = await convertImageToJpg(imgBlob);
                const arrayBuffer = await jpgBlob.arrayBuffer();
                const fileName = `page_${String(i + 1).padStart(3, '0')}.jpg`;
                filesData.push({ name: fileName, data: new Uint8Array(arrayBuffer) });
            } catch (err) {
                console.error(`Failed to process page ${i + 1}:`, err);
            }
        }

        btn.innerHTML = `<span style="font-size: 10px; font-weight: bold; line-height: 1;">ZIP</span>`;

        try {
            const zipBlob = generateNativeZip(filesData);
            const objectUrl = URL.createObjectURL(zipBlob);
            const safeTitle = document.title.replace(/[/\\?%*:|"<>]/g, '-').trim() || `Mangadot_${chId}`;

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

    // Canvas rendering for quality 95 JPG with fallback white background
    function convertImageToJpg(blob) {
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