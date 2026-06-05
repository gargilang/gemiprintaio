/**
 * Wrapper logging terstruktur (O-I7).
 *
 * Mengganti `console.error("...", e)` ad-hoc dengan output JSON satu baris yang
 * greppable (ts, level, msg, + meta). Memudahkan debugging incident produksi
 * tanpa harus menambah dependency berat. Bisa diupgrade ke pino/Sentry nanti
 * tanpa mengubah call-site.
 */
type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
