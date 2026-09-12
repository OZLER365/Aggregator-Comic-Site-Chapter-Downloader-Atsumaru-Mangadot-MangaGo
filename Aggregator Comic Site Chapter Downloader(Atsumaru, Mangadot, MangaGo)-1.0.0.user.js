// ==UserScript==
// @name         Aggregator Comic Site Chapter Downloader(Atsumaru, Mangadot, MangaGo)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Downloads chapter images, Native ZIP, SPA Ready. Combined script for Atsu, Mangadot, and MangaGo.
// @author       ozler365
// @icon         https://atsu.moe//favicon/apple-touch-icon.png
// @license      MIT
// @match        https://atsu.moe/*
// @match        https://mangadot.net/*
// @match        *://*.mangago.me/*
// @match        *://*.mangago.zone/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        unsafeWindow
// @run-at       document-start
// @connect      cdn.atsu.moe
// @connect      mangadot.net
// @connect      mangapicgallery.com
// @downloadURL https://update.greasyfork.org/scripts/595572/Aggregator%20Comic%20Site%20Chapter%20Downloader%28Atsumaru%2C%20Mangadot%2C%20MangaGo%29.user.js
// @updateURL https://update.greasyfork.org/scripts/595572/Aggregator%20Comic%20Site%20Chapter%20Downloader%28Atsumaru%2C%20Mangadot%2C%20MangaGo%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    const host = window.location.hostname;

    if (host.includes('atsu.moe')) {
        runAtsuScript();
    } else if (host.includes('mangadot.net')) {
        runMangadotScript();
    } else if (host.includes('mangago.me') || host.includes('mangago.zone')) {
        runMangaGoScript();
    }

    // ==========================================
    // 1. ATSU.MOE LOGIC
    // ==========================================
    function runAtsuScript() {
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
                    const jpgBlob = await convertAvifToJpg(avifBlob);
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
            checkReadyState();
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
    }

    // ==========================================
    // 2. MANGADOT.NET LOGIC
    // ==========================================
    function runMangadotScript() {
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

        const interceptorCode = `
        (function() {
            const origFetch = window.fetch;
            window.fetch = async function(...args) {
                const response = await origFetch.apply(this, args);
                try {
                    const clone = response.clone();
                    clone.json().then(data => {
                        if (data && data.chapter && data.chapter.id && Array.isArray(data.images)) {
                            window.postMessage({ type: 'MANGADOT_PAGES', pages: data.images, chapterId: data.chapter.id.toString() }, '*');
                        }
                    }).catch(e => {});
                } catch(e) {}
                return response;
            };

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
    }

    // ==========================================
    // 3. MANGAGO LOGIC
    // ==========================================
    function runMangaGoScript() {
        let isDownloading = false;

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

        function getChapterImages() {
            const images = document.querySelectorAll('#pic_container img[id^="page"]');
            return Array.from(images)
                .map(img => img.src)
                .filter(src => src && !src.toLowerCase().endsWith('.gif'));
        }

        function getChapterFilename() {
            try {
                const seriesEl = document.getElementById('series');
                if (seriesEl) {
                    const h3 = seriesEl.closest('h3');
                    if (h3) {
                        let cleanName = h3.innerText.replace(/>/g, '-').replace(/\s+/g, ' ').trim();
                        return cleanName.replace(/[\/\\?%*:|"<>]/g, '');
                    }
                }
            } catch (e) {
                console.warn("Could not parse chapter name from DOM");
            }
            return document.title.replace(/[\/\\?%*:|"<>]/g, '-').trim() || 'chapter';
        }

        function injectButton() {
            if (document.getElementById('mangago-dl-btn')) return;

            const nextBtn = document.querySelector('.pagebar.top .page_select .next_page');
            if (!nextBtn) return;
            const nextBtnContainer = nextBtn.parentNode;

            const wrapper = document.createElement('div');
            wrapper.className = 'left';
            wrapper.style.position = 'relative';
            wrapper.style.top = '3px';
            wrapper.style.marginLeft = '8px';
            wrapper.style.marginRight = '8px';

            const btn = document.createElement('a');
            btn.id = 'mangago-dl-btn';
            btn.className = 'prev_page'; 
            btn.href = 'javascript:void(0);';

            btn.style.width = '60px';
            btn.style.textAlign = 'center';
            btn.style.display = 'inline-block';
            btn.style.boxSizing = 'border-box';

            function setReady() {
                if (isDownloading) return;
                btn.innerText = 'Download';
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                btn.style.cursor = 'pointer';
            }

            function setWait() {
                btn.innerText = 'Wait...';
                btn.style.opacity = '0.5';
                btn.style.pointerEvents = 'none';
                btn.style.cursor = 'wait';
            }

            if (document.readyState === 'complete') {
                setReady();
            } else {
                setWait();
                window.addEventListener('load', setReady);
            }

            btn.addEventListener('click', startDownload);

            wrapper.appendChild(btn);
            nextBtnContainer.parentNode.insertBefore(wrapper, nextBtnContainer);
        }

        async function startDownload() {
            const btn = document.getElementById('mangago-dl-btn');
            const paths = getChapterImages();

            if (paths.length === 0 || isDownloading) {
                if(paths.length === 0) alert("No valid page images found to download!");
                return;
            }

            isDownloading = true;
            btn.style.cursor = 'wait';
            btn.style.opacity = '0.8';

            let filesData = [];

            for (let i = 0; i < paths.length; i++) {
                const percent = Math.round(((i) / paths.length) * 100);
                btn.innerText = `[ ${percent}% ]`;
                const url = paths[i];

                try {
                    const blob = await fetchAsBlob(url);
                    const arrayBuffer = await blob.arrayBuffer();

                    const extMatch = url.match(/\.([^.?]+)(?:\?.*)?$/);
                    const ext = extMatch ? extMatch[1] : 'jpg';

                    const fileName = `page_${String(i + 1).padStart(3, '0')}.${ext}`;
                    filesData.push({ name: fileName, data: new Uint8Array(arrayBuffer) });
                } catch (err) {
                    console.error(`Failed to process page ${i + 1}:`, err);
                }
            }

            btn.innerText = `Zipping...`;

            try {
                const zipBlob = generateNativeZip(filesData);
                const objectUrl = URL.createObjectURL(zipBlob);
                const safeTitle = getChapterFilename();

                GM_download({
                    url: objectUrl,
                    name: `${safeTitle}.zip`,
                    saveAs: false,
                    onload: () => {
                        btn.innerText = 'Done!';
                        setTimeout(() => {
                            URL.revokeObjectURL(objectUrl);
                            resetState(btn);
                        }, 3000);
                    },
                    onerror: (err) => {
                        console.error("GM_download failed:", err);
                        btn.innerText = 'Error!';
                        setTimeout(() => resetState(btn), 3000);
                    }
                });
            } catch (err) {
                console.error("Zip generation failed:", err);
                btn.innerText = 'Error!';
                setTimeout(() => resetState(btn), 3000);
            }
        }

        function resetState(btn) {
            isDownloading = false;
            btn.innerText = 'Download ZIP';
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
        }

        function fetchAsBlob(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'blob',
                    onload: (res) => res.status === 200 ? resolve(res.response) : reject(res.statusText),
                    onerror: (err) => reject(err)
                });
            });
        }

        setInterval(() => injectButton(), 1000);
    }
})();