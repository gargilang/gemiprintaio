// @jest-environment node
/**
 * Test untuk guard hapus barang (deleteMaterial).
 * Memastikan barang yang dipakai sebagai komponen di rakitan/BOM (barang_komponen.komponen_id)
 * TIDAK bisa dihapus, dengan pesan Bahasa Indonesia yang menyebut nama rakitan induk —
 * bukan meleak error FK mentah "barang_komponen_komponen_id_fkey".
 */

const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/lib/db-unified", () => ({
  db: {
    query: mockQuery,
    queryOne: mockQueryOne,
    delete: mockDelete,
  },
  getServerSupabaseClient: jest.fn(),
}));

jest.mock("@/lib/server-data-supabase", () => ({
  getReferencedHargaSatuanIds: jest.fn(),
}));

jest.mock("@/lib/barang-unit-utils", () => ({
  findDuplicateNamaProduk: jest.fn(),
  getReferensiUnitPrice: jest.fn(),
  normalizeDefaultStatusForSave: jest.fn(),
}));

import { deleteMaterial } from "@/lib/services/materials-service";

/** Helper: atur respons db.query per tabel. */
function setupQueryByTable(byTable: Record<string, any[]>) {
  mockQuery.mockImplementation((table: string) =>
    Promise.resolve({ data: byTable[table] ?? [], error: null })
  );
}

describe("deleteMaterial - guard komponen rakitan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDelete.mockResolvedValue({ data: { id: "x" }, error: null });
  });

  it("menolak hapus barang yang dipakai sebagai komponen, dengan menyebut nama rakitan induk", async () => {
    setupQueryByTable({
      item_pembelian: [],
      item_penjualan: [],
      barang_komponen: [
        { id: "bk-1", komponen_id: "b-kaki", parent_barang_id: "b-xbanner", is_deleted: 0 },
      ],
      harga_barang_satuan: [],
    });
    mockQueryOne.mockResolvedValue({ data: { id: "b-xbanner", nama: "X-Banner Set" }, error: null });

    await expect(deleteMaterial("b-kaki")).rejects.toThrow(
      /dipakai sebagai komponen di rakitan: X-Banner Set/
    );
    // Tidak boleh sempat memanggil delete("barang", ...)
    expect(mockDelete).not.toHaveBeenCalledWith("barang", "b-kaki");
  });

  it("mengabaikan baris komponen yang sudah is_deleted (soft-delete)", async () => {
    setupQueryByTable({
      item_pembelian: [],
      item_penjualan: [],
      barang_komponen: [
        { id: "bk-1", komponen_id: "b-kaki", parent_barang_id: "b-xbanner", is_deleted: 1 },
      ],
      harga_barang_satuan: [],
    });

    await expect(deleteMaterial("b-kaki")).resolves.toBe(true);
    expect(mockDelete).toHaveBeenCalledWith("barang", "b-kaki");
  });

  it("tetap bisa hapus barang yang tidak dipakai di mana pun", async () => {
    setupQueryByTable({
      item_pembelian: [],
      item_penjualan: [],
      barang_komponen: [],
      harga_barang_satuan: [],
    });

    await expect(deleteMaterial("b-bebas")).resolves.toBe(true);
    expect(mockDelete).toHaveBeenCalledWith("barang", "b-bebas");
  });
});
