import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { initializeDatabase } from "@/lib/sqlite-db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const db = await initializeDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    }

    // Get only active transactions (not archived)
    // Sort by display_order DESC (newest first = highest display_order)
    const cashBooks = db
      .prepare(
        `SELECT * FROM cash_book 
         WHERE archived_at IS NULL 
         ORDER BY display_order DESC, created_at DESC`
      )
      .all();

    return NextResponse.json({ cashBooks });
  } catch (error) {
    console.error("GET /api/finance/cash-book error:", error);
    return NextResponse.json(
      { error: "Gagal memuat data keuangan" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tanggal,
      kategori_transaksi,
      debit = 0,
      kredit = 0,
      keperluan = "",
      notes = "",
      created_by = "",
    } = body;

    // Validasi input
    if (!tanggal || !kategori_transaksi) {
      return NextResponse.json(
        { error: "Tanggal dan kategori wajib diisi" },
        { status: 400 }
      );
    }

    // Validasi: debit dan kredit tidak boleh diisi bersamaan
    if (debit > 0 && kredit > 0) {
      return NextResponse.json(
        { error: "Tidak boleh mengisi debit dan kredit bersamaan" },
        { status: 400 }
      );
    }

    if (debit === 0 && kredit === 0) {
      return NextResponse.json(
        { error: "Debit atau kredit harus diisi" },
        { status: 400 }
      );
    }

    const db = await initializeDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    }

    // Get the highest display_order to assign next value
    const maxDisplayOrder = db
      .prepare(`SELECT MAX(display_order) as max_order FROM cash_book`)
      .get() as any;

    const nextDisplayOrder = (maxDisplayOrder?.max_order || 0) + 1;

    // Hitung saldo terkini dan running totals dari transaksi terakhir
    // Based on display_order DESC (latest entry = highest display_order)
    const lastEntry = db
      .prepare(
        `SELECT 
          saldo, omzet, biaya_operasional, biaya_bahan, laba_bersih,
          bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi,
          kasbon_anwar, kasbon_suri, kasbon_cahaya, kasbon_dinil
        FROM cash_book 
        ORDER BY display_order DESC 
        LIMIT 1`
      )
      .get() as any;

    // Check if this is the first entry
    const isFirstEntry = !lastEntry;

    // Initialize previous values (0 if first entry)
    const previousSaldo = isFirstEntry ? 0 : lastEntry.saldo;
    const previousOmzet = isFirstEntry ? 0 : lastEntry.omzet;
    const previousBiayaOperasional = isFirstEntry
      ? 0
      : lastEntry.biaya_operasional;
    const previousBiayaBahan = isFirstEntry ? 0 : lastEntry.biaya_bahan;
    const previousLabaBersih = isFirstEntry ? 0 : lastEntry.laba_bersih;
    const previousBagiHasilAnwar = isFirstEntry
      ? 0
      : lastEntry.bagi_hasil_anwar;
    const previousBagiHasilSuri = isFirstEntry ? 0 : lastEntry.bagi_hasil_suri;
    const previousBagiHasilGemi = isFirstEntry ? 0 : lastEntry.bagi_hasil_gemi;
    const previousKasbonAnwar = isFirstEntry ? 0 : lastEntry.kasbon_anwar;
    const previousKasbonSuri = isFirstEntry ? 0 : lastEntry.kasbon_suri;
    const previousKasbonCahaya = isFirstEntry ? 0 : lastEntry.kasbon_cahaya;
    const previousKasbonDinil = isFirstEntry ? 0 : lastEntry.kasbon_dinil;

    // ============================================================
    // CALCULATION BASED ON GOOGLE SHEETS FORMULAS
    // ============================================================

    // G: OMZET
    // =IF(OR(NOT(ISERROR(SEARCH("OMZET", C289))), NOT(ISERROR(SEARCH("PIUTANG", C289)))),
    //    IF(ROW()=2, D289, G288 + D289),
    //    IF(ROW()=2, 0, G288))
    let runningOmzet;
    if (kategori_transaksi === "OMZET" || kategori_transaksi === "PIUTANG") {
      runningOmzet = isFirstEntry ? debit : previousOmzet + debit;
    } else {
      runningOmzet = isFirstEntry ? 0 : previousOmzet;
    }

    // H: BIAYA OPERASIONAL
    // =IF(ROW()=2, 0, IF(OR(C289="BIAYA", C289="TABUNGAN", C289="KOMISI"), H288 + E289, H288))
    let runningBiayaOperasional;
    if (isFirstEntry) {
      runningBiayaOperasional = 0;
    } else {
      if (
        kategori_transaksi === "BIAYA" ||
        kategori_transaksi === "TABUNGAN" ||
        kategori_transaksi === "KOMISI"
      ) {
        runningBiayaOperasional = previousBiayaOperasional + kredit;
      } else {
        runningBiayaOperasional = previousBiayaOperasional;
      }
    }

    // I: BIAYA BAHAN
    // =IF(ROW()=2, 0, IF(OR(C289="SUPPLY", C289="HUTANG"), I288+E289, I288))
    let runningBiayaBahan;
    if (isFirstEntry) {
      runningBiayaBahan = 0;
    } else {
      if (kategori_transaksi === "SUPPLY" || kategori_transaksi === "HUTANG") {
        runningBiayaBahan = previousBiayaBahan + kredit;
      } else {
        runningBiayaBahan = previousBiayaBahan;
      }
    }

    // J: SALDO
    // =IF(ROW()=2, D289 - E289, J288 + D289 - E289)
    const runningSaldo = isFirstEntry
      ? debit - kredit
      : previousSaldo + debit - kredit;

    // K: LABA BERSIH
    // =G289 - (H289 + I289)
    const laba_bersih =
      runningOmzet - (runningBiayaOperasional + runningBiayaBahan);

    // L: KASBON ANWAR
    // =IF(C289="PRIBADI-A",
    //    IF(ROW()=2, IF(D289, -D289, E289), IF(D289, L288-D289, L288+E289)),
    //    IF(ROW()=2, 0, L288))
    let runningKasbonAnwar;
    if (kategori_transaksi === "PRIBADI-A") {
      if (isFirstEntry) {
        runningKasbonAnwar = debit > 0 ? -debit : kredit;
      } else {
        runningKasbonAnwar =
          debit > 0
            ? previousKasbonAnwar - debit
            : previousKasbonAnwar + kredit;
      }
    } else {
      runningKasbonAnwar = isFirstEntry ? 0 : previousKasbonAnwar;
    }

    // M: KASBON SURI
    // =IF(C289="PRIBADI-S",
    //    IF(ROW()=2, IF(D289, -D289, E289), IF(D289, M288-D289, M288+E289)),
    //    IF(ROW()=2, 0, M288))
    let runningKasbonSuri;
    if (kategori_transaksi === "PRIBADI-S") {
      if (isFirstEntry) {
        runningKasbonSuri = debit > 0 ? -debit : kredit;
      } else {
        runningKasbonSuri =
          debit > 0 ? previousKasbonSuri - debit : previousKasbonSuri + kredit;
      }
    } else {
      runningKasbonSuri = isFirstEntry ? 0 : previousKasbonSuri;
    }

    // N: BAGI HASIL ANWAR
    // =(K289/3)-L289
    const runningBagiHasilAnwar = laba_bersih / 3 - runningKasbonAnwar;

    // O: BAGI HASIL SURI
    // =(K289/3)-M289
    const runningBagiHasilSuri = laba_bersih / 3 - runningKasbonSuri;

    // P: BAGI HASIL GEMI
    // =((K289 - IF(ROW()=2, 0, K288)) / 3) + IF(ROW()=2, 0, P288) + IF(C289="INVESTOR", D289, 0) - IF(C289="INVESTOR", E289, 0)
    const labaIncrement = isFirstEntry
      ? laba_bersih
      : laba_bersih - previousLabaBersih;
    const prevBagiHasilGemi = isFirstEntry ? 0 : previousBagiHasilGemi;
    const investorDebit = kategori_transaksi === "INVESTOR" ? debit : 0;
    const investorKredit = kategori_transaksi === "INVESTOR" ? kredit : 0;
    const runningBagiHasilGemi =
      labaIncrement / 3 + prevBagiHasilGemi + investorDebit - investorKredit;

    // Q: KASBON CAHAYA
    // =IF(AND(NOT(ISERROR(SEARCH("Cahaya", F289))), OR(C289="INVESTOR", C289="BIAYA")),
    //    IF(ROW()=2, IF(D289, -D289, E289), IF(D289, Q288-D289, Q288+E289)),
    //    IF(ROW()=2, 0, Q288))
    let runningKasbonCahaya;
    const hasCahaya = keperluan.toLowerCase().includes("cahaya");
    const isCahayaCategory =
      kategori_transaksi === "INVESTOR" || kategori_transaksi === "BIAYA";

    if (hasCahaya && isCahayaCategory) {
      if (isFirstEntry) {
        runningKasbonCahaya = debit > 0 ? -debit : kredit;
      } else {
        runningKasbonCahaya =
          debit > 0
            ? previousKasbonCahaya - debit
            : previousKasbonCahaya + kredit;
      }
    } else {
      runningKasbonCahaya = isFirstEntry ? 0 : previousKasbonCahaya;
    }

    // R: KASBON DINIL
    // =IF(AND(NOT(ISERROR(SEARCH("Dinil", F289))), OR(C289="INVESTOR", C289="BIAYA")),
    //    IF(ROW()=2, IF(D289, -D289, E289), IF(D289, R288-D289, R288+E289)),
    //    IF(ROW()=2, 0, R288))
    let runningKasbonDinil;
    const hasDinil = keperluan.toLowerCase().includes("dinil");
    const isDinilCategory =
      kategori_transaksi === "INVESTOR" || kategori_transaksi === "BIAYA";

    if (hasDinil && isDinilCategory) {
      if (isFirstEntry) {
        runningKasbonDinil = debit > 0 ? -debit : kredit;
      } else {
        runningKasbonDinil =
          debit > 0
            ? previousKasbonDinil - debit
            : previousKasbonDinil + kredit;
      }
    } else {
      runningKasbonDinil = isFirstEntry ? 0 : previousKasbonDinil;
    }

    const newSaldo = runningSaldo;

    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO cash_book (
        id, tanggal, kategori_transaksi, debit, kredit, keperluan,
        omzet, biaya_operasional, biaya_bahan, saldo, laba_bersih,
        kasbon_anwar, kasbon_suri, kasbon_cahaya, kasbon_dinil,
        bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi,
        notes, created_by, created_at, updated_at, display_order
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      id,
      tanggal,
      kategori_transaksi,
      debit,
      kredit,
      keperluan,
      runningOmzet,
      runningBiayaOperasional,
      runningBiayaBahan,
      newSaldo,
      laba_bersih,
      runningKasbonAnwar,
      runningKasbonSuri,
      runningKasbonCahaya,
      runningKasbonDinil,
      runningBagiHasilAnwar,
      runningBagiHasilSuri,
      runningBagiHasilGemi,
      notes,
      created_by,
      now,
      now,
      nextDisplayOrder
    );

    // RECALCULATION: Hitung ulang semua transaksi berdasarkan display_order ASC
    // Ini memastikan perhitungan kumulatif dimulai dari transaksi terlama ke terbaru
    const allEntries = db
      .prepare(
        `SELECT * FROM cash_book WHERE archived_at IS NULL ORDER BY display_order ASC`
      )
      .all() as any[];

    // Reset dan hitung ulang dari awal
    let calcOmzet = 0;
    let calcBiayaOperasional = 0;
    let calcBiayaBahan = 0;
    let calcSaldo = 0;
    let calcLabaBersih = 0;
    let calcBagiHasilAnwar = 0;
    let calcBagiHasilSuri = 0;
    let calcBagiHasilGemi = 0;
    let calcKasbonAnwar = 0;
    let calcKasbonSuri = 0;
    let calcKasbonCahaya = 0;
    let calcKasbonDinil = 0;

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

    for (let i = 0; i < allEntries.length; i++) {
      const entry = allEntries[i];
      const entryDebit = entry.debit || 0;
      const entryKredit = entry.kredit || 0;
      const entryKategori = entry.kategori_transaksi;
      const entryKeperluan = (entry.keperluan || "").toLowerCase();
      const isFirst = i === 0;

      // Keep track of previous values for incremental calculations
      const prevLabaBersih = calcLabaBersih;
      const prevBagiHasilAnwar = calcBagiHasilAnwar;
      const prevBagiHasilSuri = calcBagiHasilSuri;
      const prevBagiHasilGemi = calcBagiHasilGemi;
      const prevKasbonAnwar = calcKasbonAnwar;
      const prevKasbonSuri = calcKasbonSuri;
      const prevKasbonCahaya = calcKasbonCahaya;
      const prevKasbonDinil = calcKasbonDinil;

      // OMZET
      if (entry.override_omzet !== 1) {
        if (entryKategori === "OMZET" || entryKategori === "PIUTANG") {
          calcOmzet += entryDebit;
        }
      } else {
        calcOmzet = entry.omzet;
      }

      // BIAYA OPERASIONAL
      if (entry.override_biaya_operasional !== 1) {
        if (
          entryKategori === "BIAYA" ||
          entryKategori === "TABUNGAN" ||
          entryKategori === "KOMISI"
        ) {
          calcBiayaOperasional += entryKredit;
        }
      } else {
        calcBiayaOperasional = entry.biaya_operasional;
      }

      // BIAYA BAHAN
      if (entry.override_biaya_bahan !== 1) {
        if (entryKategori === "SUPPLY" || entryKategori === "HUTANG") {
          calcBiayaBahan += entryKredit;
        }
      } else {
        calcBiayaBahan = entry.biaya_bahan;
      }

      // SALDO
      if (entry.override_saldo !== 1) {
        calcSaldo += entryDebit - entryKredit;
      } else {
        calcSaldo = entry.saldo;
      }

      // LABA BERSIH
      if (entry.override_laba_bersih !== 1) {
        calcLabaBersih = calcOmzet - calcBiayaOperasional - calcBiayaBahan;
      } else {
        calcLabaBersih = entry.laba_bersih;
      }

      // KASBON ANWAR: Debit berkurang, Kredit bertambah
      if (entry.override_kasbon_anwar !== 1) {
        if (entryKategori === "PRIBADI-A") {
          calcKasbonAnwar += entryKredit - entryDebit;
        }
      } else {
        calcKasbonAnwar = entry.kasbon_anwar;
      }

      // KASBON SURI: Debit berkurang, Kredit bertambah
      if (entry.override_kasbon_suri !== 1) {
        if (entryKategori === "PRIBADI-S") {
          calcKasbonSuri += entryKredit - entryDebit;
        }
      } else {
        calcKasbonSuri = entry.kasbon_suri;
      }

      // BAGI HASIL ANWAR: (Laba Bersih / 3) - Kasbon Anwar
      if (entry.override_bagi_hasil_anwar !== 1) {
        calcBagiHasilAnwar = calcLabaBersih / 3 - calcKasbonAnwar;
      } else {
        calcBagiHasilAnwar = entry.bagi_hasil_anwar;
      }

      // BAGI HASIL SURI: (Laba Bersih / 3) - Kasbon Suri
      if (entry.override_bagi_hasil_suri !== 1) {
        calcBagiHasilSuri = calcLabaBersih / 3 - calcKasbonSuri;
      } else {
        calcBagiHasilSuri = entry.bagi_hasil_suri;
      }

      // BAGI HASIL GEMI: Increment (Laba Bersih / 3) + adjustment INVESTOR
      if (entry.override_bagi_hasil_gemi !== 1) {
        const labaIncrement = calcLabaBersih - prevLabaBersih;
        calcBagiHasilGemi += labaIncrement / 3;

        if (entryKategori === "INVESTOR") {
          calcBagiHasilGemi += entryDebit - entryKredit;
        }
      } else {
        calcBagiHasilGemi = entry.bagi_hasil_gemi;
      }

      // KASBON CAHAYA: Kategori INVESTOR atau BIAYA, Debit berkurang, Kredit bertambah
      if (entry.override_kasbon_cahaya !== 1) {
        const hasCah = entryKeperluan.includes("cahaya");
        const isCahCat =
          entryKategori === "INVESTOR" || entryKategori === "BIAYA";
        if (hasCah && isCahCat) {
          calcKasbonCahaya += entryKredit - entryDebit;
        }
      } else {
        calcKasbonCahaya = entry.kasbon_cahaya;
      }

      // KASBON DINIL: Kategori INVESTOR atau BIAYA, Debit berkurang, Kredit bertambah
      if (entry.override_kasbon_dinil !== 1) {
        const hasDin = entryKeperluan.includes("dinil");
        const isDinCat =
          entryKategori === "INVESTOR" || entryKategori === "BIAYA";
        if (hasDin && isDinCat) {
          calcKasbonDinil += entryKredit - entryDebit;
        }
      } else {
        calcKasbonDinil = entry.kasbon_dinil;
      }

      updateStmt.run(
        calcOmzet,
        calcBiayaOperasional,
        calcBiayaBahan,
        calcSaldo,
        calcLabaBersih,
        calcBagiHasilAnwar,
        calcBagiHasilSuri,
        calcBagiHasilGemi,
        calcKasbonAnwar,
        calcKasbonSuri,
        calcKasbonCahaya,
        calcKasbonDinil,
        now,
        entry.id
      );
    }

    const newEntry = db.prepare(`SELECT * FROM cash_book WHERE id = ?`).get(id);

    return NextResponse.json(
      { message: "Transaksi berhasil ditambahkan", cashBook: newEntry },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/finance/cash-book error:", error);
    return NextResponse.json(
      { error: "Gagal menambahkan transaksi" },
      { status: 500 }
    );
  }
}
