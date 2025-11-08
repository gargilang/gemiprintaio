import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { initializeDatabase } from "@/lib/sqlite-db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const db = await initializeDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    }

    // Cek apakah transaksi ada
    const existingEntry = db
      .prepare(`SELECT * FROM cash_book WHERE id = ?`)
      .get(id) as any;

    if (!existingEntry) {
      console.log(`Transaction not found: ${id}`);
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    console.log(`Deleting transaction: ${id}`);

    // Delete transaksi
    db.prepare(`DELETE FROM cash_book WHERE id = ?`).run(id);

    // RECALCULATION: Hitung ulang semua transaksi dari awal
    // Ambil semua transaksi yang tersisa, urutkan berdasarkan display_order ASC (terlama ke terbaru)
    const allEntries = db
      .prepare(
        `SELECT * FROM cash_book WHERE archived_at IS NULL ORDER BY display_order ASC`
      )
      .all() as any[];

    // Reset dan hitung ulang dari awal
    let runningOmzet = 0;
    let runningBiayaOperasional = 0;
    let runningBiayaBahan = 0;
    let runningSaldo = 0;
    let runningLabaBersih = 0;
    let runningBagiHasilAnwar = 0;
    let runningBagiHasilSuri = 0;
    let runningBagiHasilGemi = 0;
    let runningKasbonAnwar = 0;
    let runningKasbonSuri = 0;
    let runningKasbonCahaya = 0;
    let runningKasbonDinil = 0;

    // Prepare statement untuk update
    const updateStmt = db.prepare(`
      UPDATE cash_book 
      SET omzet = ?, 
          biaya_operasional = ?,
          biaya_bahan = ?,
          saldo = ?, 
          laba_bersih = ?,
          bagi_hasil_anwar = ?,
          bagi_hasil_suri = ?,
          bagi_hasil_gemi = ?,
          kasbon_anwar = ?,
          kasbon_suri = ?,
          kasbon_cahaya = ?,
          kasbon_dinil = ?,
          updated_at = ?
      WHERE id = ?
    `);

    const now = new Date().toISOString();

    // Proses setiap transaksi dan recalculate berdasarkan formula Google Sheets
    for (let i = 0; i < allEntries.length; i++) {
      const entry = allEntries[i];
      const debit = entry.debit || 0;
      const kredit = entry.kredit || 0;
      const kategori = entry.kategori_transaksi;
      const keperluan = (entry.keperluan || "").toLowerCase();
      const isFirstEntry = i === 0;

      // Store previous values
      const prevOmzet = runningOmzet;
      const prevBiayaOp = runningBiayaOperasional;
      const prevBiayaBahan = runningBiayaBahan;
      const prevLabaBersih = runningLabaBersih;
      const prevBagiHasilGemi = runningBagiHasilGemi;
      const prevKasbonAnwar = runningKasbonAnwar;
      const prevKasbonSuri = runningKasbonSuri;
      const prevKasbonCahaya = runningKasbonCahaya;
      const prevKasbonDinil = runningKasbonDinil;

      // G: OMZET
      if (kategori === "OMZET" || kategori === "PIUTANG") {
        runningOmzet = isFirstEntry ? debit : runningOmzet + debit;
      } else {
        runningOmzet = isFirstEntry ? 0 : runningOmzet;
      }

      // H: BIAYA OPERASIONAL
      if (isFirstEntry) {
        runningBiayaOperasional = 0;
      } else {
        if (
          kategori === "BIAYA" ||
          kategori === "TABUNGAN" ||
          kategori === "KOMISI"
        ) {
          runningBiayaOperasional = runningBiayaOperasional + kredit;
        }
      }

      // I: BIAYA BAHAN
      if (isFirstEntry) {
        runningBiayaBahan = 0;
      } else {
        if (kategori === "SUPPLY" || kategori === "HUTANG") {
          runningBiayaBahan = runningBiayaBahan + kredit;
        }
      }

      // J: SALDO
      runningSaldo = isFirstEntry
        ? debit - kredit
        : runningSaldo + debit - kredit;

      // K: LABA BERSIH
      runningLabaBersih =
        runningOmzet - (runningBiayaOperasional + runningBiayaBahan);

      // L: KASBON ANWAR
      if (kategori === "PRIBADI-A") {
        if (isFirstEntry) {
          runningKasbonAnwar = debit > 0 ? -debit : kredit;
        } else {
          runningKasbonAnwar =
            debit > 0 ? prevKasbonAnwar - debit : prevKasbonAnwar + kredit;
        }
      } else {
        runningKasbonAnwar = isFirstEntry ? 0 : prevKasbonAnwar;
      }

      // M: KASBON SURI
      if (kategori === "PRIBADI-S") {
        if (isFirstEntry) {
          runningKasbonSuri = debit > 0 ? -debit : kredit;
        } else {
          runningKasbonSuri =
            debit > 0 ? prevKasbonSuri - debit : prevKasbonSuri + kredit;
        }
      } else {
        runningKasbonSuri = isFirstEntry ? 0 : prevKasbonSuri;
      }

      // N: BAGI HASIL ANWAR
      runningBagiHasilAnwar = runningLabaBersih / 3 - runningKasbonAnwar;

      // O: BAGI HASIL SURI
      runningBagiHasilSuri = runningLabaBersih / 3 - runningKasbonSuri;

      // P: BAGI HASIL GEMI
      const labaIncrement = isFirstEntry
        ? runningLabaBersih
        : runningLabaBersih - prevLabaBersih;
      const investorDebit = kategori === "INVESTOR" ? debit : 0;
      const investorKredit = kategori === "INVESTOR" ? kredit : 0;
      runningBagiHasilGemi =
        labaIncrement / 3 + prevBagiHasilGemi + investorDebit - investorKredit;

      // Q: KASBON CAHAYA
      const hasCahaya = keperluan.includes("cahaya");
      const isCahayaCategory = kategori === "INVESTOR" || kategori === "BIAYA";
      if (hasCahaya && isCahayaCategory) {
        if (isFirstEntry) {
          runningKasbonCahaya = debit > 0 ? -debit : kredit;
        } else {
          runningKasbonCahaya =
            debit > 0 ? prevKasbonCahaya - debit : prevKasbonCahaya + kredit;
        }
      } else {
        runningKasbonCahaya = isFirstEntry ? 0 : prevKasbonCahaya;
      }

      // R: KASBON DINIL
      const hasDinil = keperluan.includes("dinil");
      const isDinilCategory = kategori === "INVESTOR" || kategori === "BIAYA";
      if (hasDinil && isDinilCategory) {
        if (isFirstEntry) {
          runningKasbonDinil = debit > 0 ? -debit : kredit;
        } else {
          runningKasbonDinil =
            debit > 0 ? prevKasbonDinil - debit : prevKasbonDinil + kredit;
        }
      } else {
        runningKasbonDinil = isFirstEntry ? 0 : prevKasbonDinil;
      }

      // Update entry dengan nilai yang baru dihitung
      updateStmt.run(
        runningOmzet,
        runningBiayaOperasional,
        runningBiayaBahan,
        runningSaldo,
        runningLabaBersih,
        runningBagiHasilAnwar,
        runningBagiHasilSuri,
        runningBagiHasilGemi,
        runningKasbonAnwar,
        runningKasbonSuri,
        runningKasbonCahaya,
        runningKasbonDinil,
        now,
        entry.id
      );
    }

    return NextResponse.json(
      {
        message: "Transaksi berhasil dihapus dan data telah direcalculate",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE /api/finance/cash-book/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus transaksi" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { tanggal, kategori_transaksi, debit, kredit, keperluan, notes } =
      body;

    const db = await initializeDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    }

    // Cek apakah transaksi ada
    const existingEntry = db
      .prepare(`SELECT * FROM cash_book WHERE id = ?`)
      .get(id) as any;

    if (!existingEntry) {
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    console.log(`Updating transaction: ${id}`);

    // Validasi input
    if (!tanggal || !kategori_transaksi) {
      return NextResponse.json(
        { error: "Tanggal dan kategori wajib diisi" },
        { status: 400 }
      );
    }

    // Validasi: debit dan kredit tidak boleh diisi bersamaan
    const debitVal = debit || 0;
    const kreditVal = kredit || 0;

    if (debitVal > 0 && kreditVal > 0) {
      return NextResponse.json(
        { error: "Tidak boleh mengisi debit dan kredit bersamaan" },
        { status: 400 }
      );
    }

    if (debitVal === 0 && kreditVal === 0) {
      return NextResponse.json(
        { error: "Debit atau kredit harus diisi" },
        { status: 400 }
      );
    }

    // Update transaksi
    const now = new Date().toISOString();
    db.prepare(
      `
      UPDATE cash_book 
      SET tanggal = ?, 
          kategori_transaksi = ?, 
          debit = ?, 
          kredit = ?, 
          keperluan = ?, 
          notes = ?,
          updated_at = ?
      WHERE id = ?
    `
    ).run(
      tanggal,
      kategori_transaksi,
      debitVal,
      kreditVal,
      keperluan || "",
      notes || "",
      now,
      id
    );

    // RECALCULATION: Hitung ulang semua transaksi dari awal
    // Ambil semua transaksi, urutkan berdasarkan display_order ASC (terlama ke terbaru)
    const allEntries = db
      .prepare(
        `SELECT * FROM cash_book WHERE archived_at IS NULL ORDER BY display_order ASC`
      )
      .all() as any[];

    // Reset dan hitung ulang dari awal
    let runningOmzet = 0;
    let runningBiayaOperasional = 0;
    let runningBiayaBahan = 0;
    let runningSaldo = 0;
    let runningLabaBersih = 0;
    let runningBagiHasilAnwar = 0;
    let runningBagiHasilSuri = 0;
    let runningBagiHasilGemi = 0;
    let runningKasbonAnwar = 0;
    let runningKasbonSuri = 0;
    let runningKasbonCahaya = 0;
    let runningKasbonDinil = 0;

    // Prepare statement untuk update
    const updateStmt = db.prepare(`
      UPDATE cash_book 
      SET omzet = ?, 
          biaya_operasional = ?,
          biaya_bahan = ?,
          saldo = ?, 
          laba_bersih = ?,
          bagi_hasil_anwar = ?,
          bagi_hasil_suri = ?,
          bagi_hasil_gemi = ?,
          kasbon_anwar = ?,
          kasbon_suri = ?,
          kasbon_cahaya = ?,
          kasbon_dinil = ?,
          updated_at = ?
      WHERE id = ?
    `);

    // Proses setiap transaksi dan recalculate berdasarkan formula Google Sheets
    for (let i = 0; i < allEntries.length; i++) {
      const entry = allEntries[i];
      const entryDebit = entry.debit || 0;
      const entryKredit = entry.kredit || 0;
      const kategori = entry.kategori_transaksi;
      const keperluan_entry = (entry.keperluan || "").toLowerCase();
      const isFirstEntry = i === 0;

      // Store previous values
      const prevLabaBersih = runningLabaBersih;
      const prevBagiHasilAnwar = runningBagiHasilAnwar;
      const prevBagiHasilSuri = runningBagiHasilSuri;
      const prevBagiHasilGemi = runningBagiHasilGemi;
      const prevKasbonAnwar = runningKasbonAnwar;
      const prevKasbonSuri = runningKasbonSuri;
      const prevKasbonCahaya = runningKasbonCahaya;
      const prevKasbonDinil = runningKasbonDinil;

      // G: OMZET
      if (entry.override_omzet !== 1) {
        if (kategori === "OMZET" || kategori === "PIUTANG") {
          runningOmzet += entryDebit;
        }
      } else {
        runningOmzet = entry.omzet;
      }

      // H: BIAYA OPERASIONAL
      if (entry.override_biaya_operasional !== 1) {
        if (
          kategori === "BIAYA" ||
          kategori === "TABUNGAN" ||
          kategori === "KOMISI"
        ) {
          runningBiayaOperasional += entryKredit;
        }
      } else {
        runningBiayaOperasional = entry.biaya_operasional;
      }

      // I: BIAYA BAHAN
      if (entry.override_biaya_bahan !== 1) {
        if (kategori === "SUPPLY" || kategori === "HUTANG") {
          runningBiayaBahan += entryKredit;
        }
      } else {
        runningBiayaBahan = entry.biaya_bahan;
      }

      // J: SALDO
      if (entry.override_saldo !== 1) {
        runningSaldo += entryDebit - entryKredit;
      } else {
        runningSaldo = entry.saldo;
      }

      // K: LABA BERSIH
      if (entry.override_laba_bersih !== 1) {
        runningLabaBersih =
          runningOmzet - runningBiayaOperasional - runningBiayaBahan;
      } else {
        runningLabaBersih = entry.laba_bersih;
      }

      // L: KASBON ANWAR: Debit berkurang, Kredit bertambah
      if (entry.override_kasbon_anwar !== 1) {
        if (kategori === "PRIBADI-A") {
          runningKasbonAnwar += entryKredit - entryDebit;
        }
      } else {
        runningKasbonAnwar = entry.kasbon_anwar;
      }

      // M: KASBON SURI: Debit berkurang, Kredit bertambah
      if (entry.override_kasbon_suri !== 1) {
        if (kategori === "PRIBADI-S") {
          runningKasbonSuri += entryKredit - entryDebit;
        }
      } else {
        runningKasbonSuri = entry.kasbon_suri;
      }

      // N: BAGI HASIL ANWAR: (Laba Bersih / 3) - Kasbon Anwar
      if (entry.override_bagi_hasil_anwar !== 1) {
        runningBagiHasilAnwar = runningLabaBersih / 3 - runningKasbonAnwar;
      } else {
        runningBagiHasilAnwar = entry.bagi_hasil_anwar;
      }

      // O: BAGI HASIL SURI: (Laba Bersih / 3) - Kasbon Suri
      if (entry.override_bagi_hasil_suri !== 1) {
        runningBagiHasilSuri = runningLabaBersih / 3 - runningKasbonSuri;
      } else {
        runningBagiHasilSuri = entry.bagi_hasil_suri;
      }

      // P: BAGI HASIL GEMI: Increment (Laba Bersih / 3) + adjustment INVESTOR
      if (entry.override_bagi_hasil_gemi !== 1) {
        const labaIncrement = runningLabaBersih - prevLabaBersih;
        runningBagiHasilGemi += labaIncrement / 3;

        if (kategori === "INVESTOR") {
          runningBagiHasilGemi += entryDebit - entryKredit;
        }
      } else {
        runningBagiHasilGemi = entry.bagi_hasil_gemi;
      }

      // Q: KASBON CAHAYA: Kategori INVESTOR atau BIAYA, Debit berkurang, Kredit bertambah
      if (entry.override_kasbon_cahaya !== 1) {
        const hasCahaya = keperluan_entry.includes("cahaya");
        const isCahayaCategory =
          kategori === "INVESTOR" || kategori === "BIAYA";
        if (hasCahaya && isCahayaCategory) {
          runningKasbonCahaya += entryKredit - entryDebit;
        }
      } else {
        runningKasbonCahaya = entry.kasbon_cahaya;
      }

      // R: KASBON DINIL: Kategori INVESTOR atau BIAYA, Debit berkurang, Kredit bertambah
      if (entry.override_kasbon_dinil !== 1) {
        const hasDinil = keperluan_entry.includes("dinil");
        const isDinilCategory = kategori === "INVESTOR" || kategori === "BIAYA";
        if (hasDinil && isDinilCategory) {
          runningKasbonDinil += entryKredit - entryDebit;
        }
      } else {
        runningKasbonDinil = entry.kasbon_dinil;
      }

      // Update entry dengan nilai yang baru dihitung
      updateStmt.run(
        runningOmzet,
        runningBiayaOperasional,
        runningBiayaBahan,
        runningSaldo,
        runningLabaBersih,
        runningBagiHasilAnwar,
        runningBagiHasilSuri,
        runningBagiHasilGemi,
        runningKasbonAnwar,
        runningKasbonSuri,
        runningKasbonCahaya,
        runningKasbonDinil,
        now,
        entry.id
      );
    }

    return NextResponse.json(
      {
        message: "Transaksi berhasil diupdate dan data telah direcalculate",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("PUT /api/finance/cash-book/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal mengupdate transaksi" },
      { status: 500 }
    );
  }
}
