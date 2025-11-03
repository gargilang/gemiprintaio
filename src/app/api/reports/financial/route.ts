import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprintaio.db");

// GemiPrint Brand Colors
const BRAND_COLORS = {
  primary: "#8B5CF6", // Purple
  secondary: "#EC4899", // Pink
  tertiary: "#3B82F6", // Blue
  dark: "#0a1b3d",
  light: "#F3F4F6",
};

interface CashBookRow {
  id: string;
  tanggal: string;
  kategori_transaksi: string;
  debit: number;
  kredit: number;
  keperluan: string;
  saldo: number;
  omzet: number;
  biaya_operasional: number;
  biaya_bahan: number;
  laba_bersih: number;
  kasbon_anwar: number;
  kasbon_suri: number;
  kasbon_cahaya: number;
  kasbon_dinil: number;
  bagi_hasil_anwar: number;
  bagi_hasil_suri: number;
  bagi_hasil_gemi: number;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export async function GET(request: NextRequest) {
  try {
    // Dynamic import jsPDF untuk server-side
    const jsPDF = (await import("jspdf")).default;
    const autoTable = (await import("jspdf-autotable")).default;

    const { searchParams } = new URL(request.url);
    const label = searchParams.get("label");
    const at = searchParams.get("at");

    if (!label || !at) {
      return NextResponse.json(
        { error: "Missing required params: label and at" },
        { status: 400 }
      );
    }

    const db = new Database(DB_FILE);

    const cashBooks = db
      .prepare(
        `SELECT * FROM cash_book 
         WHERE archived_label = ? AND archived_at = ?
         ORDER BY tanggal ASC, created_at ASC`
      )
      .all(label, at) as CashBookRow[];

    db.close();

    if (!cashBooks || cashBooks.length === 0) {
      return NextResponse.json(
        { error: "No data found for this archive" },
        { status: 404 }
      );
    }

    // Calculate summary
    const lastRow = cashBooks[cashBooks.length - 1];
    const summary = {
      saldoAkhir: lastRow.saldo,
      totalOmzet: lastRow.omzet,
      totalBiayaOperasional: lastRow.biaya_operasional,
      totalBiayaBahan: lastRow.biaya_bahan,
      labaBersih: lastRow.laba_bersih,
      kasbonAnwar: lastRow.kasbon_anwar,
      kasbonSuri: lastRow.kasbon_suri,
      kasbonCahaya: lastRow.kasbon_cahaya,
      kasbonDinil: lastRow.kasbon_dinil,
      bagiHasilAnwar: lastRow.bagi_hasil_anwar,
      bagiHasilSuri: lastRow.bagi_hasil_suri,
      bagiHasilGemi: lastRow.bagi_hasil_gemi,
      startDate: cashBooks[0].tanggal,
      endDate: lastRow.tanggal,
      totalTransaksi: cashBooks.length,
    };

    // Generate PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPos = 20;

    // === HEADER WITH COLORED BACKGROUND ===
    // Main purple background
    pdf.setFillColor(139, 92, 246); // Purple
    pdf.rect(0, 0, pageWidth, 45, "F");

    // Pink accent bar at bottom of header
    pdf.setFillColor(236, 72, 153); // Pink
    pdf.rect(0, 40, pageWidth, 5, "F");

    // Logo placeholder - use rectangle instead of circle
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(12, 14, 16, 16, 3, 3, "F");
    pdf.setFontSize(14);
    pdf.setTextColor(139, 92, 246);
    pdf.setFont("helvetica", "bold");
    pdf.text("GP", 20, 24, { align: "center" });

    // Title
    pdf.setFontSize(20);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.text("GEMIPRINT", 35, 20);

    pdf.setFontSize(24);
    pdf.text("LAPORAN KEUANGAN", pageWidth / 2, 30, { align: "center" });

    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    pdf.text(label, pageWidth / 2, 38, { align: "center" });

    yPos = 55;

    // === PERIODE & INFO ===
    pdf.setTextColor(74, 85, 104);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      `Periode: ${formatDate(summary.startDate)} - ${formatDate(
        summary.endDate
      )}`,
      20,
      yPos
    );
    yPos += 5;
    pdf.text(`Total Transaksi: ${summary.totalTransaksi}`, 20, yPos);
    yPos += 5;
    pdf.text(`Tanggal Cetak: ${new Date().toLocaleString("id-ID")}`, 20, yPos);
    yPos += 10;

    // === RINGKASAN KEUANGAN ===
    pdf.setFillColor(243, 244, 246);
    pdf.rect(15, yPos, pageWidth - 30, 8, "F");
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(10, 27, 61);
    pdf.text("📊 RINGKASAN KEUANGAN", 20, yPos + 5.5);
    yPos += 12;

    // Summary boxes
    const summaryData = [
      ["Saldo Akhir", formatRupiah(summary.saldoAkhir), "#3B82F6"],
      ["Total Omzet", formatRupiah(summary.totalOmzet), "#10B981"],
      [
        "Biaya Operasional",
        formatRupiah(summary.totalBiayaOperasional),
        "#F59E0B",
      ],
      ["Biaya Bahan", formatRupiah(summary.totalBiayaBahan), "#EF4444"],
      ["Laba Bersih", formatRupiah(summary.labaBersih), "#8B5CF6"],
    ];

    summaryData.forEach(([label, value, color], index) => {
      const xPos = 20 + (index % 2) * 90;
      const boxY = yPos + Math.floor(index / 2) * 15;

      // Convert hex to RGB
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);

      pdf.setFillColor(r, g, b);
      pdf.setDrawColor(r, g, b);
      pdf.roundedRect(xPos, boxY, 85, 12, 2, 2, "S");

      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.setFont("helvetica", "normal");
      pdf.text(label, xPos + 3, boxY + 4);

      pdf.setFontSize(10);
      pdf.setTextColor(r, g, b);
      pdf.setFont("helvetica", "bold");
      pdf.text(value, xPos + 3, boxY + 9);
    });

    yPos += Math.ceil(summaryData.length / 2) * 15 + 5;

    // === KASBON KARYAWAN ===
    pdf.setFillColor(243, 244, 246);
    pdf.rect(15, yPos, pageWidth - 30, 8, "F");
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(10, 27, 61);
    pdf.text("👤 KASBON KARYAWAN", 20, yPos + 5.5);
    yPos += 12;

    const kasbonData = [
      ["Kasbon Anwar", formatRupiah(summary.kasbonAnwar)],
      ["Kasbon Suri", formatRupiah(summary.kasbonSuri)],
      ["Kasbon Cahaya", formatRupiah(summary.kasbonCahaya)],
      ["Kasbon Dinil", formatRupiah(summary.kasbonDinil)],
    ];

    autoTable(pdf, {
      startY: yPos,
      head: [["Nama", "Jumlah"]],
      body: kasbonData,
      theme: "grid",
      headStyles: {
        fillColor: [139, 92, 246],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      margin: { left: 20, right: 20 },
    });

    yPos = (pdf as any).lastAutoTable.finalY + 8;

    // === BAGI HASIL ===
    pdf.setFillColor(243, 244, 246);
    pdf.rect(15, yPos, pageWidth - 30, 8, "F");
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(10, 27, 61);
    pdf.text("💼 BAGI HASIL PARTNER", 20, yPos + 5.5);
    yPos += 12;

    const bagiHasilData = [
      ["Anwar", formatRupiah(summary.bagiHasilAnwar)],
      ["Suri", formatRupiah(summary.bagiHasilSuri)],
      ["Gemi", formatRupiah(summary.bagiHasilGemi)],
    ];

    autoTable(pdf, {
      startY: yPos,
      head: [["Partner", "Jumlah"]],
      body: bagiHasilData,
      theme: "grid",
      headStyles: {
        fillColor: [236, 72, 153],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      margin: { left: 20, right: 20 },
    });

    yPos = (pdf as any).lastAutoTable.finalY + 10;

    // === DETAIL TRANSAKSI ===
    // Check if we need new page
    if (yPos > pageHeight - 60) {
      pdf.addPage();
      yPos = 20;
    }

    pdf.setFillColor(243, 244, 246);
    pdf.rect(15, yPos, pageWidth - 30, 8, "F");
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(10, 27, 61);
    pdf.text("📝 DETAIL TRANSAKSI", 20, yPos + 5.5);
    yPos += 12;

    const transactionData = cashBooks.map((row) => [
      formatDate(row.tanggal),
      row.kategori_transaksi,
      row.debit > 0 ? formatRupiah(row.debit) : "-",
      row.kredit > 0 ? formatRupiah(row.kredit) : "-",
      row.keperluan || "-",
      formatRupiah(row.saldo),
    ]);

    autoTable(pdf, {
      startY: yPos,
      head: [["Tanggal", "Kategori", "Debit", "Kredit", "Keperluan", "Saldo"]],
      body: transactionData,
      theme: "striped",
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        overflow: "linebreak",
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 25 },
        2: { cellWidth: 25, halign: "right" },
        3: { cellWidth: 25, halign: "right" },
        4: { cellWidth: 40 },
        5: { cellWidth: 28, halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      margin: { left: 20, right: 20 },
    });

    // === FOOTER ===
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.setFont("helvetica", "italic");
      pdf.text(
        `Halaman ${i} dari ${totalPages}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );
      pdf.text(
        "Dokumen ini dibuat secara otomatis oleh sistem GemiPrint AIO",
        pageWidth / 2,
        pageHeight - 6,
        { align: "center" }
      );
    }

    // Generate PDF buffer
    const pdfBuffer = Buffer.from(pdf.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Laporan-Keuangan-${label.replace(
          /\s+/g,
          "-"
        )}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Generate financial report error:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      {
        error: "Failed to generate report",
        details: error.message,
        stack: error.stack,
        line: error.line,
      },
      { status: 500 }
    );
  }
}
