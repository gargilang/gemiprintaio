/**
 * Hitung persentase omzet hari ini terhadap kemarin untuk donut beranda.
 * Aman dari pembagian nol dan input tidak valid.
 *
 * @param hariIni omzet hari ini
 * @param kemarin omzet kemarin
 * @returns bilangan bulat persen (0..100+). Bila kemarin 0: 100 jika hari ini > 0, selain itu 0.
 */
export function hitungPersenDonut(hariIni: number, kemarin: number): number {
  const a = Number.isFinite(hariIni) && hariIni > 0 ? hariIni : 0;
  const b = Number.isFinite(kemarin) && kemarin > 0 ? kemarin : 0;
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round((a / b) * 100);
}
