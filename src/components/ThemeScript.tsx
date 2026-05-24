/**
 * Inline boot script that applies the user's preferred theme BEFORE React
 * hydrates. Rendered into <head>, so it runs synchronously on first paint
 * and prevents a flash of light theme when the user prefers dark.
 *
 * Implementation note: the script reads the same key (`gemiprint_theme`)
 * and follows the same resolution logic as `src/lib/theme.ts`. Keep them
 * in sync if either changes.
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
