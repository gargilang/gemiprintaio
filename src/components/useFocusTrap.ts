import { useEffect, type RefObject } from "react";

/**
 * Jebak fokus keyboard di dalam `ref` selama `active` true, dan kembalikan
 * fokus ke elemen pemicu saat dilepas.
 *
 * Catatan desain: hook ini SENGAJA tidak menangani Escape. Penutupan via
 * Escape/backdrop tetap milik komponen modal (mis. ModalFormShell) supaya
 * semantik `allowDismiss` tidak terduplikasi. Hook ini fokus pada satu hal:
 * menahan Tab/Shift+Tab agar tidak keluar dari modal (aksesibilitas U-I3).
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const trapNode: HTMLElement = node;

    const selector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = () =>
      Array.from(trapNode.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null
      );

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      // Saat fokus belum di dalam modal, tarik ke elemen pertama.
      if (!trapNode.contains(activeEl)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    // Simpan elemen yang sedang fokus supaya bisa dikembalikan saat modal tutup.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Fokuskan elemen pertama di dalam modal saat dibuka.
    getFocusable()[0]?.focus();

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [ref, active]);
}
