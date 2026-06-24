import "server-only";

import fs from "fs";
import path from "path";

const FONT_DIR = path.join(process.cwd(), "public", "assets", "fonts");

function readFontDataUri(filename: string, mime: string): string {
  const filePath = path.join(FONT_DIR, filename);
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

let embeddedFontFacesCss: string | null = null;

/**
 * @font-face dengan font di-embed base64 — andal untuk cetak/PDF di Firefox/Zen
 * dan jendela popup about:blank (tanpa fetch font eksternal).
 */
export function renderEmbeddedGemiprintFontFaces(): string {
  if (embeddedFontFacesCss) return embeddedFontFacesCss;

  const bauhaus = readFontDataUri("BAUHS93.ttf", "font/truetype");
  const twCen = readFontDataUri("Tw Cen MT.ttf", "font/truetype");
  const twCenBold = readFontDataUri("TwCenMTStdBold.otf", "font/opentype");

  embeddedFontFacesCss = `
    @font-face {
      font-family: 'Bauhaus 93';
      src: url('${bauhaus}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('${twCen}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('${twCenBold}') format('opentype');
      font-weight: bold;
      font-style: normal;
    }`;

  return embeddedFontFacesCss;
}

/** Ganti blok @font-face URL dengan versi embedded (untuk HTML cetak). */
export function embedGemiprintFontsInHtml(html: string): string {
  if (html.includes("data:font/")) return html;
  const embedded = renderEmbeddedGemiprintFontFaces().trim();
  const stripped = html.replace(/@font-face\s*\{[^}]*\}\s*/g, "");
  if (stripped.includes("<style>")) {
    return stripped.replace("<style>", `<style>\n${embedded}\n`);
  }
  return stripped.replace("</head>", `<style>${embedded}</style>\n</head>`);
}
