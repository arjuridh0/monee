/**
 * Period — dok 08 §4 (periode kustom, zona waktu WIB diabstraksi via DateStr)
 * ponytail: murni string manipulation, no date lib dependency
 */
import type { DateStr, PeriodBounds } from './types'

/** Validate a calendar date without Date's rollover or year 0..99 coercion. */
export function isValidDateStr(value: unknown): value is DateStr {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const { year, month, day } = parse(value)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const limit = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
  return day <= limit
}

/** Historical keys may use a different start day than the current profile. */
export function isValidPeriodKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (/^\d{4}-\d{2}$/.test(value)) return isValidDateStr(`${value}-01`)
  return isValidDateStr(value) && Number(value.slice(8)) <= 28
}

/** YYYY-MM-DD ? { year, month, day } */
function parse(d: DateStr) {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return { year: y, month: m, day }
}

/** { year, month, day } ? YYYY-MM-DD */
function fmt(year: number, month: number, day: number): DateStr {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Jumlah hari dalam bulan (tanpa timezone issue) */
function daysInMonth(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
}

/**
 * Hitung batas periode berdasarkan tanggal & startDay.
 * startDay=1: periode = bulan kalender biasa.
 * startDay=25: periode = tanggal 25 bulan lalu s/d 24 bulan ini.
 */
export function getPeriodBounds(date: DateStr, startDay: number): PeriodBounds {
  const { year, month, day } = parse(date)

  if (startDay === 1) {
    const end = fmt(year, month, daysInMonth(year, month))
    return { start: fmt(year, month, 1), end, key: fmt(year, month, 1).slice(0, 7) }
  }

  // Tentukan apakah tanggal sudah melewati startDay di bulan ini
  if (day >= startDay) {
    // periode dimulai di startDay bulan ini
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear  = month === 12 ? year + 1 : year
    const end       = fmt(nextYear, nextMonth, startDay - 1)
    const start     = fmt(year, month, startDay)
    return { start, end, key: start }
  } else {
    // periode dimulai di startDay bulan lalu
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear  = month === 1 ? year - 1 : year
    const end       = fmt(year, month, startDay - 1)
    const start     = prevYear < 1 ? '0001-01-01' : fmt(prevYear, prevMonth, startDay)
    return { start, end, key: start }
  }
}

export function isInPeriod(date: DateStr, period: PeriodBounds): boolean {
  return date >= period.start && date <= period.end
}

export function getPeriodKey(date: DateStr, startDay: number): string {
  return getPeriodBounds(date, startDay).key
}

/** Hari ini dalam format YYYY-MM-DD (WIB: UTC+7) */
export function getToday(): DateStr {
  const d = new Date()
  // shift to WIB (UTC+7)
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000)
  return wib.toISOString().slice(0, 10)
}
