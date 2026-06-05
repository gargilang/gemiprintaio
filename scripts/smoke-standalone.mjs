/**
 * Smoke test bundle Next.js standalone yang dikemas Tauri (O-I5).
 *
 * Tauri menjalankan `node server.js` dari .next/standalone lalu polling port
 * sampai 30 detik. Kalau bundle tidak boot benar, user lihat loading tak
 * berujung. Script ini mereproduksi boot itu di CI/lokal: spawn server di port
 * acak, hit GET /api/auth/me, harap 200/401 (server hidup), lalu keluar.
 *
 * Prasyarat: sudah `npm run build:tauri && npm run prepare:standalone` sehingga
 * .next/standalone/server.js ada.
 *
 * Jalankan: npm run smoke:standalone
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PORT = 30000 + Math.floor(Math.random() * 5000);
const serverPath = join(process.cwd(), ".next", "standalone", "server.js");

if (!existsSync(serverPath)) {
  console.error(
    `Smoke FAIL: ${serverPath} tidak ada. Jalankan dulu: npm run build:tauri && npm run prepare:standalone`
  );
  process.exit(1);
}

const proc = spawn("node", [serverPath], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
    // Secret dummy supaya server boot walau .env produksi tidak ada.
    SESSION_SECRET:
      process.env.SESSION_SECRET || "smoke-session-secret-32-bytes-minimum-x",
    PASSWORD_ENC_SECRET:
      process.env.PASSWORD_ENC_SECRET || "smoke-password-enc-secret-32-bytes-x",
  },
  stdio: "inherit",
});

let done = false;
function finish(code, msg) {
  if (done) return;
  done = true;
  if (msg) console[code === 0 ? "log" : "error"](msg);
  try {
    proc.kill();
  } catch {
    /* ignore */
  }
  process.exit(code);
}

const deadline = Date.now() + 30000;
async function poll() {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`);
      if (res.status === 200 || res.status === 401) {
        finish(0, `Smoke OK: server boot, /api/auth/me = ${res.status}`);
        return;
      }
    } catch {
      // belum siap, coba lagi
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  finish(1, "Smoke FAIL: server tidak merespons dalam 30 detik");
}

proc.on("exit", (code) => {
  if (!done) finish(code === 0 ? 1 : code ?? 1, "Smoke FAIL: server keluar sebelum siap");
});

poll();
