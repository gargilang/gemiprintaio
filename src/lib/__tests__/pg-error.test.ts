import { friendlyPgError } from "../pg-error";

describe("friendlyPgError", () => {
  test("23505 unique violation → pesan nomor sudah dipakai", () => {
    const msg = friendlyPgError({ code: "23505", message: "duplicate key" }, "penjualan");
    expect(msg).toContain("sudah dipakai");
  });

  test("23503 FK violation → data terkait sudah dihapus", () => {
    const msg = friendlyPgError({ code: "23503", message: "fk" }, "penjualan");
    expect(msg).toContain("terkait");
  });

  test("23514 check violation → tidak memenuhi aturan", () => {
    const msg = friendlyPgError({ code: "23514", message: "check" }, "barang");
    expect(msg).toContain("aturan");
  });

  test("error tak dikenal → pesan generik tanpa membocorkan constraint", () => {
    const msg = friendlyPgError(
      { code: "XXXXX", message: "internal pg constraint detail xyz_key" },
      "x"
    );
    expect(msg).not.toContain("constraint");
    expect(msg).not.toContain("xyz_key");
    expect(msg.length).toBeGreaterThan(0);
  });
});
