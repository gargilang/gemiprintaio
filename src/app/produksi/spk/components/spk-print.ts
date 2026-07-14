import type { ProductionOrder } from "@/lib/services/production-service";
import {
  formatTampilanDimensiSpk,
  formatTampilanQtySpk,
} from "@/lib/penjualan-cetak-utils";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateSPKHTML(order: ProductionOrder): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SPK - ${order.nomor_spk}</title>
  <style>
    @font-face {
      font-family: 'Bauhaus 93';
      src: url('/assets/fonts/BAUHS93.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/Tw Cen MT.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/TwCenMTStdItalic.otf') format('opentype');
      font-weight: normal;
      font-style: italic;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/TwCenMTStdBold.otf') format('opentype');
      font-weight: bold;
      font-style: normal;
    }
    @page {
      size: 80mm auto;
      margin: 5mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'TW Cen MT', 'Arial', sans-serif;
      font-size: 11px;
      line-height: 1.4;
      width: 72mm;
      margin: 0 auto;
      padding: 8px;
    }
    .header {
      text-align: center;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 2px dashed #000;
    }
    .logo-image {
      width: 48px;
      height: 48px;
      margin: 0 auto 8px;
    }
    .logo {
      font-family: 'Bauhaus 93', serif;
      font-size: 28px;
      font-weight: normal;
      font-style: italic;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .logo-gemi {
      color: #00afef;
    }
    .logo-print {
      color: #0a1b3d;
    }
    .subtitle {
      font-family: 'TW Cen MT', sans-serif;
      font-size: 10px;
      margin-top: 2px;
      font-weight: bold;
    }
    .spk-title {
      font-size: 14px;
      font-weight: bold;
      margin: 8px 0;
      text-align: center;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      font-size: 10px;
    }
    .info-label {
      font-weight: bold;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .items {
      margin: 8px 0;
    }
    .item {
      margin: 6px 0;
      padding: 6px;
      border: 1px solid #000;
    }
    .item-name {
      font-weight: bold;
      font-size: 11px;
    }
    .item-detail {
      font-size: 10px;
      margin: 2px 0;
    }
    .finishing {
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px dotted #666;
      font-size: 9px;
    }
    .priority {
      display: inline-block;
      padding: 2px 6px;
      border: 1px solid #000;
      font-weight: bold;
      font-size: 10px;
    }
    .priority-KILAT {
      background: #000;
      color: #fff;
    }
    .footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 2px dashed #000;
      text-align: center;
      font-size: 9px;
    }
  </style>
</head>
<body>
  <div class="header">
    <svg class="logo-image" viewBox="0 0 38 45" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M11.1519 0.00085052H29.1766C38.4569 0.00085052 42.4009 44.1129 24.9542 44.1006H9.98877C27.0196 43.0487 25.6697 -0.221045 11.1484 0.00085052H11.1519Z" fill="#373435"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M9.08292 1.29121C-0.976261 1.29121 -2.18167 22.7863 3.02062 29.2213C4.54324 31.1074 5.59357 31.054 7.54972 30.1171C9.44595 29.209 11.0496 27.4215 11.395 24.0725C11.885 18.6237 9.79841 16.7993 6.86595 13.5119H14.5707C15.0042 11.1574 15.7197 8.8932 16.6925 6.9701C14.9267 3.54304 12.3714 1.31176 9.07587 1.31176V1.29943L9.08292 1.29121Z" fill="#00AFEF"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M7.17259 43.4268C2.76685 43.02 1.19136 40.7312 0.377177 36.396L16.9181 36.2028C14.8139 40.2052 11.3633 43.0118 7.17259 43.4268Z" fill="#00AFEF"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M10.4293 14.868C14.5284 18.3608 14.3733 28.8885 9.61513 30.7582C9.31554 30.8773 8.32513 31.0088 8.66349 31.0088L10.4399 31.0129H19.0011C20.2488 27.7831 20.3757 18.8744 19.5756 14.868H10.4293Z" fill="#00AFEF"/>
    </svg>
    <div class="logo">
      <span class="logo-gemi">gemi</span><span class="logo-print">print</span>
    </div>
    <div class="subtitle">SURAT PERINTAH KERJA</div>
  </div>

  <div class="spk-title">SPK #${order.nomor_spk}</div>

  <div class="info-row">
    <span class="info-label">Faktur:</span>
    <span>${order.nomor_faktur || "-"}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Pelanggan:</span>
    <span>${order.pelanggan_nama || "Pelanggan Umum"}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Tanggal:</span>
    <span>${
      order.dibuat_pada
        ? new Date(order.dibuat_pada).toLocaleString("id-ID", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "-"
    }</span>
  </div>
  ${
    order.tanggal_deadline
      ? `
  <div class="info-row">
    <span class="info-label">Deadline:</span>
    <span>${new Date(order.tanggal_deadline).toLocaleDateString("id-ID")}</span>
  </div>
  `
      : ""
  }
  <div class="info-row">
    <span class="info-label">Prioritas:</span>
    <span class="priority priority-${order.prioritas}">${order.prioritas}</span>
  </div>

  <div class="divider"></div>

  <div class="items">
    ${(order.items || [])
      .map((item, idx) => {
        return `
    <div class="item">
      <div class="item-name">${idx + 1}. ${escapeHtml(item.barang_nama)}</div>
      <div class="item-detail">Jumlah: ${escapeHtml(formatTampilanQtySpk(item))}</div>
      ${
        formatTampilanDimensiSpk(item)
          ? `<div class="item-detail">Ukuran: ${escapeHtml(formatTampilanDimensiSpk(item)!)}</div>`
          : ""
      }
      ${
        item.jenis_bahan
          ? `<div class="item-detail">Bahan: ${item.jenis_bahan}</div>`
          : ""
      }
      ${
        item.mesin_printing
          ? `<div class="item-detail">Mesin: ${item.mesin_printing}</div>`
          : ""
      }
      ${
        item.finishing && item.finishing.length > 0
          ? `
      <div class="finishing">
        <strong>Finishing:</strong><br>
        ${item.finishing
          .map(
            (f) =>
              `- ${f.jenis_finishing}${
                f.keterangan ? ` (${f.keterangan})` : ""
              }`,
          )
          .join("<br>")}
      </div>
      `
          : ""
      }
      ${
        item.catatan_item
          ? `<div class="item-detail" style="font-style:italic;color:#4f46e5;">${escapeHtml(item.catatan_item)}</div>`
          : ""
      }
      ${
        item.catatan_produksi
          ? `<div class="item-detail"><strong>Catatan:</strong> ${escapeHtml(item.catatan_produksi)}</div>`
          : ""
      }
    </div>
    `;
      })
      .join("")}
  </div>

  ${
    order.catatan
      ? `
  <div class="divider"></div>
  <div class="item-detail"><strong>Catatan Umum:</strong><br>${order.catatan}</div>
  `
      : ""
  }

  <div class="footer">
    <div>Terima kasih!</div>
    <div style="margin-top: 4px;">www.gemiprint.com</div>
  </div>

</body>
</html>
    `;
}
