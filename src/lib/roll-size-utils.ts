export const DEFAULT_ROLL_SIZES = [0.5, 1, 1.5, 2, 2.5, 3];

export function getStoredRollSizes(): number[] {
  if (typeof window === "undefined") {
    return [...DEFAULT_ROLL_SIZES];
  }
  try {
    const stored = localStorage.getItem("rollSizes");
    const parsed = stored ? JSON.parse(stored) : null;
    if (Array.isArray(parsed) && parsed.every((n) => typeof n === "number")) {
      return [...parsed].sort((a, b) => a - b);
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_ROLL_SIZES];
}

/**
 * Roll size with the smallest billable area (cheapest), considering rotation.
 */
export function suggestCheapestRollSize(
  panjang: number,
  lebar: number,
  rollSizes: number[] = getStoredRollSizes()
): number {
  let bestRoll: number | null = null;
  let bestArea = Infinity;

  for (const size of rollSizes) {
    const billed = getBillableDimensionsForRoll(panjang, lebar, size);
    if (!billed) continue;
    if (billed.area < bestArea) {
      bestArea = billed.area;
      bestRoll = size;
    }
  }

  if (bestRoll != null) return bestRoll;

  const shorter = Math.min(panjang, lebar);
  const sorted = [...rollSizes].sort((a, b) => a - b);
  for (const size of sorted) {
    if (size >= shorter) return size;
  }
  return sorted[sorted.length - 1] ?? shorter;
}

/**
 * Billing recommendation: pick the smallest roll that can cover the shorter
 * side of the order. Operators may still override the actual roll in SPK.
 */
export function suggestSmallestCoveringRollSize(
  panjang: number,
  lebar: number,
  rollSizes: number[] = getStoredRollSizes()
): number {
  const shorter = Math.min(panjang, lebar);
  const sorted = [...rollSizes].sort((a, b) => a - b);
  for (const size of sorted) {
    if (size >= shorter) return size;
  }
  return sorted[sorted.length - 1] ?? shorter;
}

/** @deprecated Use suggestCheapestRollSize with both dimensions */
export function suggestRollSize(
  smallerDim: number,
  rollSizes: number[] = getStoredRollSizes()
): number {
  return suggestCheapestRollSize(smallerDim, smallerDim, rollSizes);
}

export type BillableDimensions = {
  panjang: number;
  lebar: number;
  area: number;
  /** Roll width aligned with the longer cut side (rotated layout). */
  usesRotation: boolean;
};

/**
 * Billable size for a roll: roll width is fixed; print length is the other side.
 * Tries both orientations (normal + rotated) and picks the smallest valid area.
 *
 * Example 1.2 × 2.7 m with roll 3 m:
 * - Roll across 1.2 m → 3 × 2.7 = 8.1 m²
 * - Roll across 2.7 m (rotated) → 3 × 1.2 = 3.6 m² ✓
 */
export function getBillableDimensionsForRoll(
  panjang: number,
  lebar: number,
  rollSize: number
): BillableDimensions | null {
  const shorter = Math.min(panjang, lebar);
  const longer = Math.max(panjang, lebar);
  const panjangIsShorter = panjang <= lebar;
  const candidates: BillableDimensions[] = [];

  const addCandidate = (
    rollAcrossShorter: boolean,
    widthAcrossRoll: number,
    lengthAlongRoll: number
  ) => {
    const area = widthAcrossRoll * lengthAlongRoll;
    let p: number;
    let l: number;
    if (rollAcrossShorter) {
      if (panjangIsShorter) {
        p = widthAcrossRoll;
        l = lengthAlongRoll;
      } else {
        p = lengthAlongRoll;
        l = widthAcrossRoll;
      }
    } else if (panjangIsShorter) {
      p = lengthAlongRoll;
      l = widthAcrossRoll;
    } else {
      p = widthAcrossRoll;
      l = lengthAlongRoll;
    }
    candidates.push({
      panjang: p,
      lebar: l,
      area,
      usesRotation: !rollAcrossShorter,
    });
  };

  if (rollSize >= shorter) {
    addCandidate(true, rollSize, longer);
  }
  if (rollSize >= longer) {
    addCandidate(false, rollSize, shorter);
  }

  if (candidates.length === 0) return null;

  return candidates.reduce((best, c) => (c.area < best.area ? c : best));
}

export interface NestedRollBilling {
  itemsPerRow: number;
  rows: number;
  sisiMelintang: number;
  sisiCetak: number;
  totalPanjangRoll: number;
  totalAreaRoll: number;
  areaEfektifPerLembar: number;
  usesRotation: boolean;
}

/**
 * Billing roll dengan nesting: berapa lembar identik muat berdampingan di lebar
 * roll (floor(rollWidth / sisiMelintang)), lalu total area roll terpakai.
 * Coba dua orientasi (non-rotasi & rotasi), pilih total area terkecil.
 * Return null bila roll tak cukup lebar untuk salah satu orientasi.
 *
 * Contoh: 2 lembar 1×1.5 di roll 2m → rotasi: 2 muat berdampingan, 1 baris,
 * panjang 1.5m, area 2×1.5=3m² (efektif 1.5m²/lembar = luas banner).
 */
export function getNestedRollBilling(
  panjang: number,
  lebar: number,
  jumlahLembar: number,
  rollWidth: number,
): NestedRollBilling | null {
  const lembar = Math.max(1, Math.round(jumlahLembar) || 1);
  const sisiPanjang = Math.max(panjang, lebar);
  const candidates: NestedRollBilling[] = [];

  const addCandidate = (sisiMelintang: number, sisiCetak: number) => {
    if (rollWidth < sisiMelintang) return; // tak muat 1 pun
    const itemsPerRow = Math.max(1, Math.floor(rollWidth / sisiMelintang));
    const rows = Math.ceil(lembar / itemsPerRow);
    const totalPanjangRoll = rows * sisiCetak;
    const totalAreaRoll = rollWidth * totalPanjangRoll;
    // Konvensi rotasi mengikuti getBillableDimensionsForRoll: dianggap "rotasi"
    // bila sisi lembar yang lebih panjang yang membentang di lebar roll.
    const usesRotation = sisiMelintang >= sisiPanjang;
    candidates.push({
      itemsPerRow,
      rows,
      sisiMelintang,
      sisiCetak,
      totalPanjangRoll,
      totalAreaRoll,
      areaEfektifPerLembar: totalAreaRoll / lembar,
      usesRotation,
    });
  };

  // Orientasi 1: lebar membentang di lebar roll, panjang sepanjang cetak.
  addCandidate(lebar, panjang);
  // Orientasi 2: panjang membentang di lebar roll, lebar sepanjang cetak.
  addCandidate(panjang, lebar);

  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) =>
    c.totalAreaRoll < best.totalAreaRoll ? c : best,
  );
}

/** @deprecated Use getBillableDimensionsForRoll */
export function applyRollSizeToDimensions(
  panjang: number,
  lebar: number,
  rollSize: number
): { panjang: number; lebar: number } {
  const billed =
    getBillableDimensionsForRoll(panjang, lebar, rollSize) ??
    getBillableDimensionsForRoll(
      panjang,
      lebar,
      suggestCheapestRollSize(panjang, lebar)
    );
  if (!billed) {
    return { panjang, lebar };
  }
  return { panjang: billed.panjang, lebar: billed.lebar };
}

export function getRoundedDimensions(
  panjang: number,
  lebar: number,
  useRounding: boolean,
  selectedRollSize?: number | null
): { panjang: number; lebar: number; rollSize: number | null } {
  if (!useRounding) {
    return { panjang, lebar, rollSize: null };
  }

  const rollSizes = getStoredRollSizes();
  const rollSize =
    selectedRollSize != null && selectedRollSize > 0
      ? selectedRollSize
      : suggestCheapestRollSize(panjang, lebar, rollSizes);

  const billed = getBillableDimensionsForRoll(panjang, lebar, rollSize);
  if (!billed) {
    return { panjang, lebar, rollSize };
  }
  return { panjang: billed.panjang, lebar: billed.lebar, rollSize };
}

export function isRollSizeValidForDimensions(
  panjang: number,
  lebar: number,
  rollSize: number
): boolean {
  return getBillableDimensionsForRoll(panjang, lebar, rollSize) != null;
}
