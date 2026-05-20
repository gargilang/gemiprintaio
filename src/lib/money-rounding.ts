/** Round up to the nearest Rp 1.000 (e.g. 81.250 → 82.000). */
export function roundUpToThousand(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount / 1000) * 1000;
}

/**
 * Allocate charges per line; rounding applies once on the transaction total.
 * The last line absorbs any remainder so lines sum exactly to the rounded total.
 */
export function allocateCartLineCharges(
  items: Array<{ subtotalRaw: number }>,
  roundPrices: boolean
): number[] {
  if (items.length === 0) return [];

  const raws = items.map((i) => i.subtotalRaw);
  if (!roundPrices) return raws;

  const totalRaw = raws.reduce((sum, n) => sum + n, 0);
  const totalCharged = roundUpToThousand(totalRaw);
  if (totalCharged === totalRaw) return raws;

  const charges = [...raws];
  charges[charges.length - 1] += totalCharged - totalRaw;
  return charges;
}

export function getCartLineCharge(
  items: Array<{ subtotalRaw: number }>,
  lineIndex: number,
  roundPrices: boolean
): number {
  const charges = allocateCartLineCharges(items, roundPrices);
  return charges[lineIndex] ?? 0;
}

/** @deprecated Use getCartLineCharge with line index */
export function getLineCharge(
  subtotalRaw: number,
  roundPrices: boolean
): number {
  return roundPrices ? roundUpToThousand(subtotalRaw) : subtotalRaw;
}

export function getCartChargeTotal(
  items: Array<{ subtotalRaw: number }>,
  roundPrices: boolean
): number {
  return allocateCartLineCharges(items, roundPrices).reduce(
    (sum, n) => sum + n,
    0
  );
}

export function formatPosUnitPrice(amount: number): string {
  const rounded = Math.round(amount);
  if (Math.abs(amount - rounded) < 0.005) {
    return rounded.toLocaleString("id-ID");
  }
  return amount.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

const DIM_EPS = 0.001;

/** Print length along roll vs roll width (for cart/receipt display). */
export function getRollPrintLength(
  billedPanjang: number,
  billedLebar: number,
  rollSize: number
): number {
  if (Math.abs(billedPanjang - rollSize) < DIM_EPS) return billedLebar;
  if (Math.abs(billedLebar - rollSize) < DIM_EPS) return billedPanjang;
  return Math.min(billedPanjang, billedLebar);
}

export function formatRollCartDetailLine(item: {
  billedPanjang?: number;
  billedLebar?: number;
  selectedRollSize?: number;
  jumlah: number;
  harga_satuan: number;
}): string {
  const { billedPanjang, billedLebar, selectedRollSize, jumlah, harga_satuan } =
    item;
  if (
    billedPanjang == null ||
    billedLebar == null ||
    selectedRollSize == null
  ) {
    return "";
  }
  const printLen = getRollPrintLength(
    billedPanjang,
    billedLebar,
    selectedRollSize
  );
  return `${printLen.toFixed(2)} × Roll ${selectedRollSize.toFixed(2)} m = ${jumlah.toFixed(2)} m² @ Rp ${formatPosUnitPrice(harga_satuan)}`;
}
