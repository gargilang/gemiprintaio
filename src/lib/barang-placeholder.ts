/**
 * Barang placeholder sistem untuk pekerjaan maklon (subkontrak).
 *
 * Baris ini WAJIB ada di DB karena dipatok keras oleh jalur maklon di POS &
 * Pembelian (lihat `pos-mutations.ts` / `purchases-mutations.ts`) agar foreign
 * key valid tanpa memasukkan barang stok palsu ke katalog. Stok tidak pernah
 * bergerak (`lacak_inventori_status = 0`).
 *
 * Karena bukan barang katalog, placeholder ini TIDAK boleh tampil di pemilih
 * barang mana pun yang dilihat pengguna (grid POS, form Pembelian, Pesanan
 * Pembelian, penyesuaian/mutasi inventori, halaman Barang). Pakai
 * {@link sembunyikanPlaceholderBarang} untuk menyaringnya secara konsisten —
 * jangan menulis ulang string id di tiap halaman (gampang terlewat).
 *
 * Catatan: API `/api/barang` & `getMaterials()` SENGAJA tetap mengembalikannya,
 * sebab logika mutasi maklon dan generator data uji bergantung pada
 * keberadaannya. Penyaringan dilakukan di lapisan tampilan saja.
 */
export const ID_BARANG_PLACEHOLDER_MAKLON = "barang-jasa-maklon";
export const ID_HARGA_PLACEHOLDER_MAKLON = "harga-jasa-maklon-pcs";

/** Benar bila barang ini adalah placeholder sistem (bukan barang katalog). */
export function adalahPlaceholderBarang(
  barang: { id?: string | null } | null | undefined
): boolean {
  return barang?.id === ID_BARANG_PLACEHOLDER_MAKLON;
}

/**
 * Saring placeholder sistem dari daftar barang untuk ditampilkan ke pengguna.
 * Tetap utuh untuk lookup internal — panggil hanya saat membangun opsi/visual.
 */
export function sembunyikanPlaceholderBarang<T extends { id?: string | null }>(
  daftar: readonly T[] | null | undefined
): T[] {
  return (daftar ?? []).filter((b) => b.id !== ID_BARANG_PLACEHOLDER_MAKLON);
}
