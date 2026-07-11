import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ModalTambahItemLainnya from "../ModalTambahItemLainnya";

describe("ModalTambahItemLainnya", () => {
  it("simpan dengan nama+satuan+harga saja (tanpa vendor/biaya) → onSuccess field opsional null", async () => {
    const onSave = jest.fn();
    render(
      <ModalTambahItemLainnya
        open
        subkontraktor={[]}
        kategoriOptions={[]}
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Nama item/i), {
      target: { value: "Banner Custom" },
    });
    fireEvent.change(screen.getByLabelText(/Harga jual/i), {
      target: { value: "60000" },
    });
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const v = onSave.mock.calls[0][0];
    expect(v.barang_nama).toBe("Banner Custom");
    expect(v.harga_satuan).toBe(60000);
    expect(v.vendor_subkontrak_id).toBeNull();
    expect(v.biaya_subkontrak).toBeNull();
    expect(v.metode_bayar_vendor).toBeNull();
  });
});
