import { render, screen, fireEvent } from "@testing-library/react";
import DialogKonfirmasi from "../DialogKonfirmasi";

describe("DialogKonfirmasi", () => {
  test("tidak render apa pun saat show=false", () => {
    const { container } = render(
      <DialogKonfirmasi
        show={false}
        title="Hapus data?"
        message="Yakin?"
        onConfirm={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("menampilkan judul + pesan dan memanggil onConfirm saat tombol diklik", () => {
    const onConfirm = jest.fn();
    render(
      <DialogKonfirmasi
        show
        title="Hapus data?"
        message="Tindakan ini tidak bisa dibatalkan."
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByText("Hapus data?")).toBeInTheDocument();
    expect(
      screen.getByText("Tindakan ini tidak bisa dibatalkan.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ya, lanjutkan/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("tombol batal memanggil onCancel", () => {
    const onCancel = jest.fn();
    render(
      <DialogKonfirmasi
        show
        title="Konfirmasi"
        message="Lanjut?"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /batal/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
