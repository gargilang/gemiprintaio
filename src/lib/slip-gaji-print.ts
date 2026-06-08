/**
 * Generator slip gaji (A5/struk sederhana) untuk satu karyawan dalam satu
 * payroll run. Berisi rincian komponen (snapshot), bruto, potongan kasbon, dan
 * neto (yang diterima). Mengikuti pola cetak faktur-print: tulis HTML ke window
 * popup, fallback ke iframe tersembunyi bila popup diblokir.
 */

import { formatRupiahPlain } from "@/lib/format-id";

export interface SlipKomponenBaris {
  nama: string;
  tipe?: string;
  nilai: number;
}

export interface SlipGajiData {
  /** Nama toko untuk kop slip. */
  nama_toko: string;
  periode: string;
  tanggal_bayar: string | null;
  nama_karyawan: string;
  jabatan?: string;
  komponen: SlipKomponenBaris[];
  bruto: number;
  potongan_kasbon: number;
  neto: number;
  metode_bayar?: string;
}

const TIPE_LABEL: Record<string, string> = {
  GAJI_POKOK: "Gaji Pokok",
  TUNJANGAN: "Tunjangan",
  KOMISI: "Komisi",
  BONUS: "Bonus",
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Bangun HTML slip gaji lengkap (dokumen mandiri siap cetak). */
export function generateSlipGajiHTML(data: SlipGajiData): string {
  const komponenRows = data.komponen.length
    ? data.komponen
        .map(
          (k) =>
            "<tr><td>" +
            escapeHtml(k.nama) +
            (k.tipe
              ? ' <span class="tipe">(' +
                escapeHtml(TIPE_LABEL[k.tipe] ?? k.tipe) +
                ")</span>"
              : "") +
            "</td><td class=\"num\">" +
            formatRupiahPlain(k.nilai) +
            "</td></tr>"
        )
        .join("")
    : '<tr><td colspan="2" class="kosong">Tidak ada rincian komponen</td></tr>';

  const tanggalBayar = data.tanggal_bayar
    ? escapeHtml(data.tanggal_bayar)
    : "-";

  return (
    "<!DOCTYPE html><html lang=\"id\"><head><meta charset=\"utf-8\" />" +
    "<title>Slip Gaji - " +
    escapeHtml(data.nama_karyawan) +
    " - " +
    escapeHtml(data.periode) +
    "</title><style>" +
    "*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;}" +
    "body{margin:0;padding:24px;color:#1e293b;}" +
    ".slip{max-width:480px;margin:0 auto;border:1px solid #cbd5e1;border-radius:12px;padding:24px;}" +
    ".kop{text-align:center;border-bottom:2px solid #4f46e5;padding-bottom:12px;margin-bottom:16px;}" +
    ".kop h1{font-size:18px;margin:0;color:#4f46e5;text-transform:uppercase;letter-spacing:1px;}" +
    ".kop p{font-size:12px;margin:4px 0 0;color:#64748b;}" +
    ".info{font-size:13px;margin-bottom:16px;}" +
    ".info div{display:flex;justify-content:space-between;padding:2px 0;}" +
    ".info .label{color:#64748b;}" +
    "table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;}" +
    "th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #e2e8f0;}" +
    "th{color:#64748b;font-size:11px;text-transform:uppercase;}" +
    ".num{text-align:right;font-variant-numeric:tabular-nums;}" +
    ".tipe{color:#94a3b8;font-size:11px;}" +
    ".kosong{color:#94a3b8;font-style:italic;text-align:center;}" +
    ".totals{font-size:13px;margin-top:8px;}" +
    ".totals div{display:flex;justify-content:space-between;padding:3px 0;}" +
    ".totals .neto{font-size:16px;font-weight:bold;color:#059669;border-top:2px solid #4f46e5;margin-top:6px;padding-top:8px;}" +
    ".potongan{color:#dc2626;}" +
    ".ttd{margin-top:32px;display:flex;justify-content:space-between;font-size:12px;}" +
    ".ttd div{text-align:center;width:45%;}" +
    ".ttd .garis{margin-top:48px;border-top:1px solid #94a3b8;padding-top:4px;}" +
    "@media print{body{padding:0;}.slip{border:none;}}" +
    "</style></head><body><div class=\"slip\">" +
    "<div class=\"kop\"><h1>Slip Gaji</h1><p>" +
    escapeHtml(data.nama_toko) +
    "</p></div>" +
    "<div class=\"info\">" +
    "<div><span class=\"label\">Nama</span><span>" +
    escapeHtml(data.nama_karyawan) +
    "</span></div>" +
    (data.jabatan
      ? "<div><span class=\"label\">Jabatan</span><span>" +
        escapeHtml(data.jabatan) +
        "</span></div>"
      : "") +
    "<div><span class=\"label\">Periode</span><span>" +
    escapeHtml(data.periode) +
    "</span></div>" +
    "<div><span class=\"label\">Tanggal Bayar</span><span>" +
    tanggalBayar +
    "</span></div>" +
    (data.metode_bayar
      ? "<div><span class=\"label\">Metode</span><span>" +
        escapeHtml(data.metode_bayar) +
        "</span></div>"
      : "") +
    "</div>" +
    "<table><thead><tr><th>Komponen</th><th class=\"num\">Jumlah</th></tr></thead><tbody>" +
    komponenRows +
    "</tbody></table>" +
    "<div class=\"totals\">" +
    "<div><span>Gaji Bruto</span><span class=\"num\">" +
    formatRupiahPlain(data.bruto) +
    "</span></div>" +
    "<div class=\"potongan\"><span>Potongan Kasbon</span><span class=\"num\">- " +
    formatRupiahPlain(data.potongan_kasbon) +
    "</span></div>" +
    "<div class=\"neto\"><span>Diterima (Neto)</span><span class=\"num\">" +
    formatRupiahPlain(data.neto) +
    "</span></div>" +
    "</div>" +
    "<div class=\"ttd\"><div><div class=\"garis\">Penerima</div></div>" +
    "<div><div class=\"garis\">Hormat Kami</div></div></div>" +
    "</div></body></html>"
  );
}

function writeToWindow(target: Window, html: string): void {
  target.document.open();
  target.document.write(html);
  target.document.close();
  target.focus();
}

function printAfterAssetsReady(target: Window): void {
  const print = () => {
    try {
      target.focus();
      target.print();
    } catch {
      // print() bisa diblokir; pratinjau tetap tersedia di dokumen target.
    }
  };
  const fontsReady = target.document.fonts?.ready ?? Promise.resolve();
  fontsReady.then(print).catch(print);
}

/** Buka pratinjau cetak slip gaji. Mengembalikan true bila window/iframe terbuka. */
export function printSlipGaji(data: SlipGajiData): boolean {
  const html = generateSlipGajiHTML(data);

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    writeToWindow(printWindow, html);
    printAfterAssetsReady(printWindow);
    return true;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Cetak slip gaji");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    document.body.removeChild(iframe);
    return false;
  }

  writeToWindow(frameWindow, html);
  printAfterAssetsReady(frameWindow);

  window.setTimeout(() => {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }, 120_000);

  return true;
}
