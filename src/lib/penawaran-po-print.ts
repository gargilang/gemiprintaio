/**
 * @deprecated Pakai `generatePurchaseOrderHTML` / `patchQuotationHTML` di
 * `faktur-print.ts` — layout branded Gemiprint (landscape, logo, font).
 *
 * Generator HTML untuk dokumen cetak Penawaran dan Pesanan Pembelian.
 * Desain mengikuti gaya faktur penjualan (faktur-print.ts): logo, kop, tabel dimensi.
 */

type ShopInfo = {
  nama_toko?: string | null;
  slogan?: string | null;
  alamat?: string | null;
  telepon?: string | null;
  email?: string | null;
  website?: string | null;
};

type ItemPrint = {
  nama: string;
  lebar?: number | null;
  panjang?: number | null;
  jumlah_lembar?: number | null; // untuk penawaran
  jumlah_roll?: number | null;   // untuk PO
  jumlah: number;                // total m² atau qty
  nama_satuan: string;
  harga_satuan: number;
  subtotal: number;
};

type CetakPenawaranInput = {
  nomor: string;
  tanggal: string;
  berlaku_sampai?: string | null;
  kepada_nama: string;
  kepada_kota?: string | null;
  items: ItemPrint[];
  total: number;
  catatan?: string | null;
  shop?: ShopInfo | null;
};

type CetakPOInput = {
  nomor: string;
  tanggal: string;
  expected_date?: string | null;
  vendor_nama: string;
  items: ItemPrint[];
  total: number;
  catatan?: string | null;
  shop?: ShopInfo | null;
};

function escHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n));
}

function fmtDim(item: ItemPrint): string {
  const panjang = Number(item.panjang);
  const lebar = Number(item.lebar);
  if (!panjang || !lebar) return "-";
  return `${lebar.toFixed(2)} m × ${panjang.toFixed(2)} m`;
}

function fmtQtyKolom(item: ItemPrint): string {
  if (item.jumlah_lembar && item.panjang && item.lebar) {
    return `${item.jumlah_lembar} lbr`;
  }
  if (item.jumlah_roll && item.panjang && item.lebar) {
    return `${item.jumlah_roll} roll`;
  }
  return `${item.jumlah.toLocaleString("id-ID")} ${escHtml(item.nama_satuan)}`;
}

const CSS = `
  body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;margin:0;padding:28px 32px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;}
  .brand h1{margin:0 0 2px;font-size:22px;color:#0f172a;}
  .brand p{margin:0;font-size:11px;color:#475569;}
  .doc-type{text-align:right;}
  .doc-type h2{margin:0 0 2px;font-size:18px;font-weight:700;color:#0369a1;text-transform:uppercase;}
  .doc-type .nomor{font-size:12px;color:#475569;}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:12px 16px;
        background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;}
  .meta-label{font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-bottom:2px;}
  .meta-value{font-size:12px;color:#0f172a;}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;}
  thead tr{background:#0369a1;color:#fff;}
  th{padding:7px 8px;text-align:left;font-weight:600;}
  tbody tr:nth-child(even){background:#f8fafc;}
  td{padding:6px 8px;border-bottom:1px solid #e2e8f0;}
  .right{text-align:right;}
  .total-block{display:flex;justify-content:flex-end;margin-bottom:16px;}
  .total-table{font-size:13px;}
  .total-table td{padding:3px 8px;}
  .total-table .grand td{font-weight:700;font-size:15px;border-top:2px solid #0369a1;}
  .notes{font-size:11px;color:#475569;margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;
         white-space:pre-wrap;}
  .footer{margin-top:32px;display:flex;justify-content:flex-end;font-size:12px;}
  .footer-box{text-align:center;width:160px;}
  .footer-box .ttd-space{height:56px;border-bottom:1px solid #0f172a;margin-bottom:4px;}
  @media print {
    body{padding:16px;}
    .no-print{display:none;}
  }
`;

function buildHTML(
  tipeDoc: "PENAWARAN HARGA" | "PURCHASE ORDER",
  nomorLabel: string,
  metaKiri: { label: string; value: string }[],
  metaKanan: { label: string; value: string }[],
  items: ItemPrint[],
  total: number,
  catatan: string | null | undefined,
  shop: ShopInfo | null | undefined
): string {
  const namaToko = shop?.nama_toko || "gemiprint";
  const slogan = shop?.slogan || "Digital Printing & Advertising";
  const alamat = shop?.alamat ? escHtml(shop.alamat).replace(/\n/g, "<br>") : "";
  const kontak = [shop?.telepon, shop?.email].filter(Boolean).map(escHtml).join(" · ");

  const hasDim = items.some(
    (i) => Number(i.panjang) > 0 && Number(i.lebar) > 0
  );

  const headersTh = [
    `<th>#</th>`,
    `<th>Barang</th>`,
    hasDim ? `<th>Dimensi</th>` : "",
    `<th class="right">Qty</th>`,
    `<th class="right">Harga Satuan</th>`,
    `<th class="right">Subtotal</th>`,
  ]
    .filter(Boolean)
    .join("");

  const rowsHtml = items
    .map((item, idx) => {
      const dimTd = hasDim ? `<td>${fmtDim(item)}</td>` : "";
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escHtml(item.nama)}</td>
        ${dimTd}
        <td class="right">${fmtQtyKolom(item)}</td>
        <td class="right">Rp ${fmtRp(item.harga_satuan)}</td>
        <td class="right">Rp ${fmtRp(item.subtotal)}</td>
      </tr>`;
    })
    .join("");

  const metaKiriHtml = metaKiri
    .map(
      (m) =>
        `<div><div class="meta-label">${escHtml(m.label)}</div><div class="meta-value">${escHtml(m.value)}</div></div>`
    )
    .join("");
  const metaKananHtml = metaKanan
    .map(
      (m) =>
        `<div><div class="meta-label">${escHtml(m.label)}</div><div class="meta-value">${escHtml(m.value)}</div></div>`
    )
    .join("");

  return `<!doctype html><html lang="id"><head>
<meta charset="utf-8">
<title>${escHtml(nomorLabel)}</title>
<style>${CSS}</style>
</head><body>
<div class="header">
  <div class="brand">
    <h1>${escHtml(namaToko)}</h1>
    <p>${escHtml(slogan)}</p>
    ${alamat ? `<p>${alamat}</p>` : ""}
    ${kontak ? `<p>${kontak}</p>` : ""}
  </div>
  <div class="doc-type">
    <h2>${tipeDoc}</h2>
    <div class="nomor">${escHtml(nomorLabel)}</div>
  </div>
</div>
<div class="meta">
  <div>${metaKiriHtml}</div>
  <div>${metaKananHtml}</div>
</div>
<table>
  <thead><tr>${headersTh}</tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="total-block">
  <table class="total-table">
    <tbody>
      <tr class="grand"><td>TOTAL</td><td class="right">Rp ${fmtRp(total)}</td></tr>
    </tbody>
  </table>
</div>
${catatan ? `<div class="notes"><strong>Catatan:</strong>\n${escHtml(catatan)}</div>` : ""}
<div class="footer">
  <div class="footer-box">
    <div class="ttd-space"></div>
    <div>${escHtml(namaToko)}</div>
  </div>
</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
}

/** Generate HTML untuk dokumen Penawaran Harga */
export function generateHtmlPenawaran(input: CetakPenawaranInput): string {
  const metaKiri = [
    { label: "Kepada", value: input.kepada_nama },
    input.kepada_kota ? { label: "Kota", value: input.kepada_kota } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const metaKanan = [
    { label: "Tanggal", value: input.tanggal },
    input.berlaku_sampai
      ? { label: "Berlaku sampai", value: input.berlaku_sampai }
      : { label: "Berlaku sampai", value: "-" },
  ];

  return buildHTML(
    "PENAWARAN HARGA",
    input.nomor,
    metaKiri,
    metaKanan,
    input.items,
    input.total,
    input.catatan,
    input.shop
  );
}

/** Generate HTML untuk dokumen Purchase Order */
export function generateHtmlPO(input: CetakPOInput): string {
  const metaKiri = [{ label: "Vendor", value: input.vendor_nama }];
  const metaKanan = [
    { label: "Tanggal", value: input.tanggal },
    input.expected_date
      ? { label: "Estimasi tiba", value: input.expected_date }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return buildHTML(
    "PURCHASE ORDER",
    input.nomor,
    metaKiri,
    metaKanan,
    input.items,
    input.total,
    input.catatan,
    input.shop
  );
}
