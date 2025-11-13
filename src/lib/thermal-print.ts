export interface ThermalInvoiceData {
  nomor_invoice: string;
  tanggal: string;
  pelanggan_nama?: string;
  pelanggan_telepon?: string;
  kasir_nama: string;
  items: {
    nama: string;
    jumlah: number;
    satuan: string;
    harga: number;
    subtotal: number;
    dimensi?: string;
  }[];
  total: number;
  jumlah_bayar: number;
  kembalian: number;
  metode_pembayaran: string;
  catatan?: string;
}

export function generateThermalInvoice(data: ThermalInvoiceData): string {
  const {
    nomor_invoice,
    tanggal,
    pelanggan_nama,
    pelanggan_telepon,
    kasir_nama,
    items,
    total,
    jumlah_bayar,
    kembalian,
    metode_pembayaran,
    catatan,
  } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${nomor_invoice}</title>
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
      margin-bottom: 10px;
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
      font-weight: normal;
    }
    .contact {
      font-family: 'TW Cen MT', sans-serif;
      font-size: 9px;
      color: #555;
      margin-top: 2px;
    }
    .invoice-title {
      font-size: 13px;
      font-weight: bold;
      text-align: center;
      margin: 8px 0;
    }
    .info-section {
      margin: 8px 0;
      font-size: 10px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
    }
    .info-label {
      font-weight: bold;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .items-table {
      width: 100%;
      margin: 8px 0;
    }
    .item-row {
      margin: 4px 0;
      font-size: 10px;
    }
    .item-name {
      font-weight: bold;
      margin-bottom: 2px;
    }
    .item-detail {
      display: flex;
      justify-content: space-between;
      color: #333;
    }
    .item-dimensi {
      font-size: 9px;
      color: #666;
      margin-bottom: 2px;
    }
    .totals {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 2px solid #000;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      font-size: 11px;
    }
    .total-row.grand {
      font-size: 13px;
      font-weight: bold;
      margin-top: 5px;
      padding-top: 5px;
      border-top: 1px dashed #000;
    }
    .payment-section {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #000;
      font-size: 10px;
    }
    .notes {
      margin-top: 8px;
      padding: 6px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      font-size: 9px;
    }
    .footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 2px dashed #000;
      text-align: center;
      font-size: 9px;
    }
    .footer-thanks {
      font-weight: bold;
      margin-bottom: 4px;
    }
    @media print {
      body {
        width: 72mm;
      }
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
    <div class="subtitle">Digital Printing & Advertising</div>
    <div class="contact">Telp: 0812-3456-7890</div>
    <div class="contact">www.gemiprint.com</div>
  </div>

  <div class="invoice-title">INVOICE PENJUALAN</div>

  <div class="info-section">
    <div class="info-row">
      <span class="info-label">No. Invoice:</span>
      <span>${nomor_invoice}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Tanggal:</span>
      <span>${new Date(tanggal).toLocaleString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Kasir:</span>
      <span>${kasir_nama}</span>
    </div>
    ${
      pelanggan_nama
        ? `
    <div class="info-row">
      <span class="info-label">Pelanggan:</span>
      <span>${pelanggan_nama}</span>
    </div>
    `
        : ""
    }
    ${
      pelanggan_telepon
        ? `
    <div class="info-row">
      <span class="info-label">Telepon:</span>
      <span>${pelanggan_telepon}</span>
    </div>
    `
        : ""
    }
  </div>

  <div class="divider"></div>

  <div class="items-table">
    ${items
      .map(
        (item) => `
    <div class="item-row">
      <div class="item-name">${item.nama}</div>
      ${item.dimensi ? `<div class="item-dimensi">${item.dimensi}</div>` : ""}
      <div class="item-detail">
        <span>${item.jumlah} ${item.satuan} x ${item.harga.toLocaleString(
          "id-ID"
        )}</span>
        <span>${item.subtotal.toLocaleString("id-ID")}</span>
      </div>
    </div>
    `
      )
      .join("")}
  </div>

  <div class="totals">
    <div class="total-row grand">
      <span>TOTAL:</span>
      <span>Rp ${total.toLocaleString("id-ID")}</span>
    </div>
  </div>

  <div class="payment-section">
    <div class="total-row">
      <span>Metode Bayar:</span>
      <span>${metode_pembayaran}</span>
    </div>
    <div class="total-row">
      <span>Jumlah Bayar:</span>
      <span>Rp ${jumlah_bayar.toLocaleString("id-ID")}</span>
    </div>
    ${
      kembalian > 0
        ? `
    <div class="total-row">
      <span>Kembalian:</span>
      <span>Rp ${kembalian.toLocaleString("id-ID")}</span>
    </div>
    `
        : ""
    }
  </div>

  ${
    catatan
      ? `
  <div class="notes">
    <strong>Catatan:</strong><br>
    ${catatan}
  </div>
  `
      : ""
  }

  <div class="footer">
    <div class="footer-thanks">Terima Kasih Atas Kunjungan Anda!</div>
    <div>Barang yang sudah dibeli tidak dapat dikembalikan</div>
    <div style="margin-top: 6px;">Simpan struk ini sebagai bukti pembayaran</div>
  </div>

  <script>
    // Print dialog removed - user can manually print using Ctrl+P or browser print button
  </script>
</body>
</html>
  `;
}

export function printThermalInvoice(data: ThermalInvoiceData) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Gagal membuka window print");
  }

  const invoiceHTML = generateThermalInvoice(data);
  printWindow.document.write(invoiceHTML);
  printWindow.document.close();
  printWindow.focus();

  // Auto-print removed - user can manually trigger print with Ctrl+P
}
