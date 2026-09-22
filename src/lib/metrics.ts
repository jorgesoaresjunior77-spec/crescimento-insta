export const AGE_RANGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const
export type AgeRange = (typeof AGE_RANGES)[number]

export const GENDERS = ['female', 'male', 'other'] as const
export type Gender = (typeof GENDERS)[number]

export const GENDER_LABELS: Record<Gender, string> = {
  female: 'Feminino',
  male: 'Masculino',
  other: 'Outro',
}

export function percentage(part: number, total: number): number | null {
  if (!total) return null
  return (part / total) * 100
}

export function formatPercent(value: number | null): string {
  return value === null ? 'indisponível' : `${value.toFixed(1)}%`
}

export function formatNumber(value: number | null): string {
  return value === null ? 'indisponível' : value.toLocaleString('pt-BR')
}

export interface Variation {
  absolute: number
  percent: number | null
}

export function computeVariation(current: number, previous: number | null): Variation | null {
  if (previous === null) return null
  return {
    absolute: current - previous,
    percent: previous === 0 ? null : ((current - previous) / previous) * 100,
  }
}

export function formatCalendarDateBR(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** Data de hoje no calendário local do dispositivo (intencional: só usada para valor inicial de filtro). */
export function todayIsoLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Soma/subtrai dias de uma data YYYY-MM-DD usando aritmética em UTC (sem depender do fuso do navegador). */
export function addDaysToIsoDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

export type PeriodPreset = 'today' | '7d' | '30d' | 'custom'

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  custom: 'Personalizado',
}

/** '' -> null (campo não informado); string numérica -> número; qualquer outra coisa -> 'invalid' */
export function parseOptionalInt(raw: string): number | null | 'invalid' {
  if (raw.trim() === '') return null
  if (!/^\d+$/.test(raw.trim())) return 'invalid'
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : 'invalid'
}

export function parseRequiredInt(raw: string): number | 'invalid' {
  if (!/^\d+$/.test(raw.trim())) return 'invalid'
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : 'invalid'
}

export function periodRange(
  preset: PeriodPreset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  if (preset === 'custom') return { from: customFrom, to: customTo }
  const today = todayIsoLocal()
  const daysBack = preset === 'today' ? 0 : preset === '7d' ? 6 : 29
  return { from: addDaysToIsoDate(today, -daysBack), to: today }
}
