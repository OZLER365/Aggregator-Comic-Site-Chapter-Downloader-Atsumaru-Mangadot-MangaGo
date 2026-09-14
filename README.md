# ⚡ Universal Image Downloader (Atsu, Mangadot, MangaGo)

A high-performance, unified Tampermonkey userscript designed to scrape, convert, and natively package manga and comic chapters into ZIP files directly within your browser. 

Currently supported platforms: **Atsumaru (atsu.moe)**, **Mangadot (mangadot.net)**, and **MangaGo (mangago.me / mangago.zone)**.

---

## ✨ Key Features

* **🚀 10x Concurrent Downloading:** Multi-threaded worker system dramatically accelerates image fetching, utilizing up to 10 simultaneous connections to max out your download speed.
* **📦 Native Client-Side ZIP Generation:** Bypasses the need for external servers or CORS workarounds by generating CSP-safe `.zip` files entirely within the browser's memory using `ArrayBuffer` and native Blob APIs.
* **🖼️ AVIF to High-Quality JPG Conversion:** Automatically intercepts `.avif` and transparent images (crucial for Atsu.moe), rendering them onto a canvas with a solid white background and converting to optimized JPG.
* **🧭 SPA (Single Page Application) Tracking:** Dynamically hooks into `window.fetch` and `XMLHttpRequest` to intercept JSON payloads. It updates the download cache on the fly when you change chapters.
* **🎨 Seamless Native UI Integration:** Injects custom download buttons equipped with dynamic SVG icons and percentage trackers that perfectly match the native styling and layout grids of each respective site.
* **🛡️ Isolated Execution:** Code for each supported site runs in entirely separate function scopes based on the active hostname, guaranteeing zero variable contamination or cross-site layout breakage.
* **📱 Mobile Compatible:** Works on both desktop and mobile devices via Tampermonkey or other script managers (e.g., Violentmonkey, Greasemonkey).

---

## 📥 Installation Guide

*This script is designed for educational purposes. Please do not repost downloaded images.*

### Desktop Installation
1. Install the **[Tampermonkey](https://www.tampermonkey.net/)** extension for your browser. *(Recommended)*
2. Click on the Tampermonkey extension icon and choose **Create a new script**.
3. Clear the default template code.
4. Copy the complete userscript code and paste it into the editor.
5. Save the script via **File > Save** (or `Ctrl+S`).
6. Open any chapter on Atsu, Mangadot, or MangaGo, and use the integrated download button.

### Mobile Installation
1. Install **Tampermonkey** or another script manager (e.g., **Violentmonkey**) from your device's app store or browser extensions.
2. Follow the same steps as desktop installation above.
3. The script will work seamlessly on mobile browsers, allowing you to download chapters directly to your device.

*Note: Dedicated Chrome, Edge, and Firefox extension builds are coming soon.*

---

## 🤝 Support & Contact

Maintaining userscripts against frequent site updates takes ongoing effort. If you find this tool helpful, consider supporting its development:

* **☕ Buy Me A Coffee:** [buymeacoffee.com/ozler](https://buymeacoffee.com/ozler)
* **💻 GitHub Repositories:** [Visit My Website](https://ozler365.github.io/ozler-s-works-info/#/repositories)
* **📧 Queries & Feature Requests:** Leave a review on Greasyfork or reach out via email at [devjk6918@gmail.com](mailto:devjk6918@gmail.com)
