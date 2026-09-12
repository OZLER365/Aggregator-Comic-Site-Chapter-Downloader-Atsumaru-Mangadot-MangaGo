// ==UserScript==
// @name         MangaGo Image Downloader (ZIP Ready)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Downloads chapter images. Waits for page load, shows percentage, matches site layout using native floated div wrappers.
// @author       You
// @match        *://*.mangago.me/*
// @match        *://*.mangago.zone/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      mangapicgallery.com
// ==/UserScript==

(function() {
    'use strict';

    let isDownloading = false;

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

    // --- DOM Scraping ---
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

    // --- UI and State Management ---
    function injectButton() {
        if (document.getElementById('mangago-dl-btn')) return;

        // Find the "next" button's parent container to insert our button before it
        const nextBtn = document.querySelector('.pagebar.top .page_select .next_page');
        if (!nextBtn) return;
        const nextBtnContainer = nextBtn.parentNode;

        // Create a dedicated floating wrapper to match the site's layout structure
        const wrapper = document.createElement('div');
        wrapper.className = 'left';
        wrapper.style.position = 'relative';
        wrapper.style.top = '3px';
        wrapper.style.marginLeft = '8px';
        wrapper.style.marginRight = '8px';

        // Create the button itself
        const btn = document.createElement('a');
        btn.id = 'mangago-dl-btn';
        btn.className = 'prev_page'; // Inherit styling
        btn.href = 'javascript:void(0);';

        // Ensure a fixed width so the text changing doesn't bounce the layout around
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

        // Lock button until the tab spinner completely stops
        if (document.readyState === 'complete') {
            setReady();
        } else {
            setWait();
            window.addEventListener('load', setReady);
        }

        btn.addEventListener('click', startDownload);

        // Append button to wrapper, then insert the wrapper right before the "next" button wrapper
        wrapper.appendChild(btn);
        nextBtnContainer.parentNode.insertBefore(wrapper, nextBtnContainer);
    }

    // --- Download Process ---
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

            // Short text keeps the button size stable
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

})();