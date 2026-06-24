/**
 * Font branding Gemiprint + helper cetak browser (popup/iframe).
 * Font diambil dari /public/assets/fonts — tidak bergantung font sistem.
 */

/** Asal absolut untuk URL font saat dokumen cetak dibuka di jendela baru. */
export function resolvePrintAssetOrigin(explicit?: string): string {
  if (explicit) return explicit.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function renderGemiprintFontFaces(assetOrigin: string): string {
  const fontBase = assetOrigin
    ? `${assetOrigin}/assets/fonts`
    : "/assets/fonts";
  return `
    @font-face {
      font-family: 'Bauhaus 93';
      src: url('${fontBase}/Bauhaus 93 Regular.ttf') format('truetype'),
           url('${fontBase}/BAUHS93.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('${fontBase}/Tw Cen MT.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('${fontBase}/TwCenMTStdBold.otf') format('opentype');
      font-weight: bold;
      font-style: normal;
    }`;
}

export function printAfterAssetsReady(target: Window): void {
  const print = () => {
    try {
      target.focus();
      target.print();
    } catch {
      // print() bisa diblokir; pratinjau tetap ada di dokumen
    }
  };

  const doc = target.document;
  const fontsReady = doc.fonts?.ready ?? Promise.resolve();

  fontsReady
    .then(() => {
      // Gecko (Firefox/Zen): beri jeda singkat agar layout cetak pakai font embedded
      const families = ["Bauhaus 93", "TW Cen MT"];
      const loads = families.map((family) =>
        doc.fonts?.load(`16px "${family}"`).catch(() => undefined)
      );
      return Promise.all(loads);
    })
    .then(() => new Promise((r) => setTimeout(r, 150)))
    .then(print)
    .catch(print);
}

export function writeHtmlToPrintWindow(target: Window, html: string): void {
  target.document.open();
  target.document.write(html);
  target.document.close();
  target.focus();
}

/** Sisipkan origin aplikasi agar @font-face resolve saat cetak dari jendela baru. */
export function injectPrintAssetOrigin(html: string): string {
  if (typeof window === "undefined") return html;
  // HTML sudah pakai font embedded base64 — tidak perlu patch URL
  if (html.includes("data:font/")) return html;
  const origin = window.location.origin;
  const fontBase = `${origin}/assets/fonts`;
  const enc = (name: string) =>
    `${fontBase}/${encodeURIComponent(name).replace(/%2F/g, "/")}`;
  return html
    .replace(/<base href="[^"]*">/, `<base href="${origin}/">`)
    .replace(/url\('\/assets\/fonts\/([^']+)'\)/g, (_, file: string) => {
      const decoded = decodeURIComponent(file);
      return `url('${enc(decoded)}')`;
    });
}

/** Buka popup atau iframe tersembunyi lalu cetak setelah font siap. */
export function printHtmlDocument(html: string, title: string): boolean {
  return openPrintDocument(html, title, { autoPrint: true });
}

/**
 * Buka dokumen cetak: popup dengan toolbar (tanpa auto-print), atau iframe
 * tersembunyi yang langsung memanggil dialog cetak bila popup diblokir.
 */
export function openPrintDocument(
  html: string,
  title: string,
  options: { autoPrint?: boolean } = {}
): boolean {
  const autoPrint = options.autoPrint ?? false;
  const readyHtml = injectPrintAssetOrigin(html);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    writeHtmlToPrintWindow(printWindow, readyHtml);
    if (autoPrint) printAfterAssetsReady(printWindow);
    return true;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", title);
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    document.body.removeChild(iframe);
    return false;
  }

  writeHtmlToPrintWindow(frameWindow, readyHtml);
  printAfterAssetsReady(frameWindow);

  setTimeout(() => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  }, 120_000);

  return true;
}
