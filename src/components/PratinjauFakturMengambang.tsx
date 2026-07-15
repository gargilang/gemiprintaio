"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface FloatingFakturPreviewProps {
  open: boolean;
  html: string;
  title?: string;
  /** Document orientation — controls zoom calculation. Default: landscape. */
  orientation?: "landscape" | "portrait";
  onClose: () => void;
}

/**
 * Inject styles + a postMessage listener into the faktur HTML.
 * The parent drives zoom dynamically via { type: "set-zoom", zoom: number }.
 * A4 landscape body is 278mm wide — at 96dpi that's ~1050px.
 */
function injectZoom(html: string): string {
  const injection = `
<style id="__floating-preview-zoom__">
  html, body {
    zoom: var(--preview-zoom, 1);
    transform-origin: top left;
  }
  .toolbar, .no-print { display: none !important; }
</style>
<script>
  window.addEventListener("message", function(e) {
    if (e.data && e.data.type === "set-zoom") {
      document.documentElement.style.setProperty("--preview-zoom", e.data.zoom);
    }
  });
</script>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${injection}\n</head>`);
  }
  return injection + html;
}

/** A4 landscape body width in CSS pixels at 96 dpi (278mm body). */
const A4_LANDSCAPE_PX = Math.round((278 / 25.4) * 96); // ≈ 1050px
/** A4 portrait body width in CSS pixels at 96 dpi (186mm body). */
const A4_PORTRAIT_PX = Math.round((186 / 25.4) * 96); // ≈ 703px

const MIN_W = 480;
const MIN_H = 360;
const DEFAULT_W = 1117;
const DEFAULT_H = 577;

type ResizeEdge =
  | "n" | "s" | "e" | "w"
  | "ne" | "nw" | "se" | "sw"
  | null;

export default function PratinjauFakturMengambang({
  open,
  html,
  title = "Pratinjau Faktur",
  orientation = "landscape",
  onClose,
}: FloatingFakturPreviewProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ── drag state ──────────────────────────────────────────────────────────────
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // ── resize state ─────────────────────────────────────────────────────────────
  const resizeState = useRef<{
    pointerId: number;
    edge: ResizeEdge;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originW: number;
    originH: number;
  } | null>(null);

  const [position, setPosition] = useState(() => {
    if (typeof window === "undefined") return { x: 80, y: 80 };
    return {
      x: Math.max(8, Math.round((window.innerWidth - DEFAULT_W) / 2)),
      y: Math.max(8, Math.round((window.innerHeight - DEFAULT_H) / 2)),
    };
  });
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  // Re-center when first opened
  useEffect(() => {
    if (!open) return;
    setPosition({
      x: Math.max(8, Math.round((window.innerWidth - DEFAULT_W) / 2)),
      y: Math.max(8, Math.round((window.innerHeight - DEFAULT_H) / 2)),
    });
    setSize({ w: DEFAULT_W, h: DEFAULT_H });
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── drag handlers ────────────────────────────────────────────────────────────
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const nextX = s.originX + e.clientX - s.startX;
    const nextY = s.originY + e.clientY - s.startY;
    setPosition({
      x: Math.max(8, Math.min(nextX, window.innerWidth - size.w - 8)),
      y: Math.max(8, Math.min(nextY, window.innerHeight - 48)),
    });
  };

  const stopDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId === e.pointerId) dragState.current = null;
  };

  // ── resize handlers ──────────────────────────────────────────────────────────
  const startResize = useCallback(
    (edge: ResizeEdge) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      resizeState.current = {
        pointerId: e.pointerId,
        edge,
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
        originW: size.w,
        originH: size.h,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [position, size]
  );

  const onResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = resizeState.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    let { originX: x, originY: y, originW: w, originH: h } = s;

    if (s.edge?.includes("e")) w = Math.max(MIN_W, w + dx);
    if (s.edge?.includes("s")) h = Math.max(MIN_H, h + dy);
    if (s.edge?.includes("w")) {
      const newW = Math.max(MIN_W, w - dx);
      x = x + (w - newW);
      w = newW;
    }
    if (s.edge?.includes("n")) {
      const newH = Math.max(MIN_H, h - dy);
      y = y + (h - newH);
      h = newH;
    }

    setPosition({ x, y });
    setSize({ w, h });
  }, []);

  const stopResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (resizeState.current?.pointerId === e.pointerId)
      resizeState.current = null;
  }, []);

  // ── dynamic zoom ─────────────────────────────────────────────────────────────
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const sendZoom = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    // Available width inside the iframe container (panel width minus border)
    const availW = size.w - 4;
    const docWidth =
      orientation === "portrait" ? A4_PORTRAIT_PX : A4_LANDSCAPE_PX;
    const zoom = Math.min(1, availW / docWidth);
    iframe.contentWindow.postMessage({ type: "set-zoom", zoom }, "*");
  }, [size.w, orientation]);

  // Send zoom whenever panel is resized (small delay so iframe DOM is ready)
  useEffect(() => {
    const id = window.setTimeout(sendZoom, 30);
    return () => window.clearTimeout(id);
  }, [sendZoom]);

  // Re-send zoom when a new faktur is loaded (html prop changes)
  useEffect(() => {
    const id = window.setTimeout(sendZoom, 80);
    return () => window.clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  };

  if (!open) return null;

  const HANDLE = 6; // px — resize handle thickness

  return (
    <div
      ref={panelRef}
      className="fixed z-[110] flex flex-col rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
      style={{ left: position.x, top: position.y, width: size.w, height: size.h }}
      role="dialog"
      aria-label={title}
    >
      {/* ── Title bar / drag handle ─────────────────────────────────────────── */}
      <div
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        className="cursor-move flex-shrink-0 px-4 py-3 bg-gradient-to-r from-[#0a1b3d] to-[#123b7a] text-white flex items-center justify-between select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* document icon */}
          <svg className="w-4 h-4 shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 className="font-bold leading-tight truncate text-base">{title}</h2>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Print button */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00afef] hover:bg-[#0098d0] text-white text-base font-bold transition-colors"
            aria-label="Cetak faktur"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Cetak
          </button>

          {/* Close button */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-lg leading-none"
            aria-label="Tutup pratinjau faktur"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── iframe content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative bg-white overflow-hidden pt-3">
        <iframe
          ref={iframeRef}
          title={title}
          srcDoc={injectZoom(html)}
          className="w-full h-full border-0"
          sandbox="allow-same-origin allow-modals allow-scripts"
          onLoad={sendZoom}
        />
      </div>

      {/* ── Resize handles ──────────────────────────────────────────────────── */}
      {/* corners */}
      {(["nw", "ne", "sw", "se"] as ResizeEdge[]).map((edge) => (
        <div
          key={edge!}
          onPointerDown={startResize(edge)}
          onPointerMove={onResize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          className="absolute z-10"
          style={{
            width: HANDLE * 2,
            height: HANDLE * 2,
            top: edge!.includes("n") ? 0 : undefined,
            bottom: edge!.includes("s") ? 0 : undefined,
            left: edge!.includes("w") ? 0 : undefined,
            right: edge!.includes("e") ? 0 : undefined,
            cursor: `${edge}-resize`,
          }}
        />
      ))}
      {/* edges */}
      {(["n", "s", "e", "w"] as ResizeEdge[]).map((edge) => (
        <div
          key={edge!}
          onPointerDown={startResize(edge)}
          onPointerMove={onResize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          className="absolute z-10"
          style={{
            ...(edge === "n" || edge === "s"
              ? { left: HANDLE * 2, right: HANDLE * 2, height: HANDLE }
              : { top: HANDLE * 2, bottom: HANDLE * 2, width: HANDLE }),
            top: edge === "n" ? 0 : undefined,
            bottom: edge === "s" ? 0 : undefined,
            left: edge === "w" ? 0 : undefined,
            right: edge === "e" ? 0 : undefined,
            cursor: `${edge === "n" || edge === "s" ? "ns" : "ew"}-resize`,
          }}
        />
      ))}
    </div>
  );
}
