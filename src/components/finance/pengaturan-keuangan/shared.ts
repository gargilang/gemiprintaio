"use client";

// Helper bersama untuk komponen tab PengaturanKeuangan (Fase 6 B2).

/** Fetch JSON dengan header default + lempar Error berisi pesan server. */
export async function apiJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body?.error as string) || "Terjadi kesalahan");
  return body as T;
}

/** Permintaan dialog konfirmasi yang dioper dari tab ke induk. */
export type ConfirmRequest = {
  title: string;
  message: string;
  confirmText?: string;
  type?: "warning" | "danger" | "info";
  onConfirm: () => void;
};

/** Notifikasi inline (sukses/error) di header modal. */
export interface Notice {
  type: "success" | "error";
  message: string;
}

/** Kategori transaksi keuangan (tabel `keuangan_kategori` via /api/keuangan/config). */
export interface KategoriApi {
  id?: string;
  category_code: string;
  display_name: string;
}
