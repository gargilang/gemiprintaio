/**
 * Skrip boot inline yang menerapkan tema yang dipilih pengguna SEBELUM React
 * hydrates. Rendered into <head>, so it runs synchronously on first paint
 * dan mencegah kedipan tema light saat pengguna memilih dark.
 *
 * Catatan implementasi: skrip ini membaca key yang sama (`gemiprint_theme`)
 * dan mengikuti logika resolusi yang sama dengan `src/lib/theme.ts`. Jaga
 * keduanya tetap sinkron kalau salah satu berubah.
 */

import { THEME_KEY } from "@/lib/theme";

const SCRIPT = `(function(){try{var k=localStorage.getItem(${JSON.stringify(
  THEME_KEY
)})||"system";var d=k==="dark"||(k==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var c=document.documentElement.classList;if(d){c.add("dark");}else{c.remove("dark");}}catch(e){}})();`;

export default function ThemeScript() {
  // suppressHydrationWarning: this script mutates <html> before React hydrates.
  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: SCRIPT }}
    />
  );
}
