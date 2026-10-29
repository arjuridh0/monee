/**
 * Rounding — dok 08 §5
 * Semua alokasi di-floor ke ratusan terdekat agar tidak ada "sen" di UI.
 * ponytail: 2 fungsi pure, no dep
 */

/** Floor ke kelipatan 100 terdekat ke bawah */
export function floorToHundreds(amount: number): number {
  return Math.floor(amount / 100) * 100
}

/** Hitung jatah alokasi: percent% dari total, di-floor ke ratusan */
export function roundAllocation(totalIncome: number, percent: number): number {
  return floorToHundreds((totalIncome * percent) / 100)
}
