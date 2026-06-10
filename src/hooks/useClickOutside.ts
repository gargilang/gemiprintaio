import { useEffect, RefObject } from "react";

/**
 * Module-level stack of modal refs that are currently registered for
 * outside-click handling. The TOP of the stack is the most recently
 * opened modal — only it should respond to outside clicks. Modals
 * below it stay open even when the user interacts with the topmost
 * modal (e.g. clicking Batal inside a DialogKonfirmasi stacked on top
 * of a settings modal must not also close the settings modal).
 *
 * The stack is intentionally ordered by registration time, not by
 * z-index. Each modal pushes itself when it mounts (with enabled=true)
 * and pops when it unmounts or disables. Because nested modals always
 * mount AFTER their parents, registration order matches visual stacking
 * order in practice.
 */
const modalStack: HTMLElement[] = [];

/**
 * Hook to detect clicks outside of a specified element.
 *
 * Stack-aware: when multiple modals are open, only the topmost modal
 * (most recently registered) reacts to outside clicks. Clicks inside
 * a higher modal are NOT treated as "outside" for any lower modal.
 *
 * @param ref - React ref object for the element to detect outside clicks
 * @param handler - Callback function to execute when click outside is detected
 * @param enabled - Whether the hook should be active (default: true)
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    // Register this modal as the topmost as soon as it mounts.
    const el = ref?.current;
    if (!el) return;
    modalStack.push(el);

    const listener = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      // Klik di dalam menu mengambang (portal MenuAksi, dropdown, dsb.) yang
      // dirender lewat portal ke document.body BUKAN "klik di luar". Tanpa ini,
      // mengeklik item menu kebab akan menutup modal di event mousedown sebelum
      // onClick item sempat berjalan (membuat tombol aksi seolah tidak berfungsi).
      if (target instanceof Element && target.closest("[data-floating-menu]")) {
        return;
      }

      // Click inside this modal — ignore.
      if (el.contains(target)) return;

      // Stack discipline: only the topmost modal closes on outside clicks.
      // Modals below it stay open even when the user clicks in/around the
      // topmost modal (e.g. closing a DialogKonfirmasi must not also close the
      // settings modal underneath).
      const top = modalStack[modalStack.length - 1];
      if (top !== el) return;

      handler(event);
    };

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);

    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
      // Remove this modal from the stack on unmount.
      const idx = modalStack.lastIndexOf(el);
      if (idx >= 0) modalStack.splice(idx, 1);
    };
  }, [ref, handler, enabled]);
}
