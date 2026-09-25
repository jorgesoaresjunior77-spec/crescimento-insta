import type { DailyMetric } from './api'

export const AGE_RANGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const
export type AgeRange = (typeof AGE_RANGES)[number]

export const GENDERS = ['female', 'male', 'other'] as const
export type Gender = (typeof GENDERS)[number]

export const GENDER_LABELS: Record<Gender, string> = {
  female: 'Feminino',
  male: 'Masculino',
  other: 'Outro',
}

/** Porcentagem no padrão brasileiro: vírgula decimal, sem separador de milhar, símbolo %. */
export function formatPercentBR(value: number | null): string {
  if (value === null) return 'indisponível'
  const text = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)
  return `${text}%`
}

/** Alias mantido para compatibilidade com chamadas existentes. */
export const formatPercent = formatPercentBR

/** Percentual compacto (1 casa decimal) usado em rótulos curtos, como o tooltip do mapa. */
export function formatPercentShortBR(value: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`
}

/**
 * O backend devolve `city` no formato combinado "Nome UF" (compatibilidade com o gráfico
 * "Principais cidades"). Remove apenas o sufixo " UF" já confirmado por `state` (nunca
 * "adivinhado" a partir do texto).
 */
export function bareCityName(city: string, state: string | null): string {
  if (!state) return city
  const suffix = ` ${state}`
  return city.endsWith(suffix) ? city.slice(0, city.length - suffix.length) : city
}

/** Quantidade no padrão brasileiro: ponto como separador de milhares, sem casas decimais. */
export function formatNumber(value: number | null): string {
  return value === null ? 'indisponível' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)
}

/** Remove tudo que não for dígito (aceita colar/digitar com ou sem separador de milhar). */
export function stripThousandsSep(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Igual a stripThousandsSep, mas preserva um '-' inicial — usado só por seguidores líquidos. */
export function stripSignedThousandsSep(raw: string): string {
  const negative = raw.trim().startsWith('-')
  const digits = raw.replace(/\D/g, '')
  return negative ? `-${digits}` : digits
}

/** Formata uma string de dígitos puros com separador de milhar, para exibição em campos de quantidade. */
export function formatIntegerInputBR(digits: string): string {
  if (digits === '') return ''
  const n = Number(digits)
  if (!Number.isFinite(n)) return digits
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n)
}

/** Converte um texto digitado no padrão BR (vírgula decimal) em número; 'invalid' se não for um percentual bem formado. */
export function parsePercentBR(raw: string): number | 'invalid' {
  const cleaned = raw.trim().replace(/\./g, '')
  if (!/^\d+,\d+$/.test(cleaned) && !/^\d+$/.test(cleaned)) return 'invalid'
  const n = Number(cleaned.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 'invalid'
}

/** '' -> null (campo não informado); "74,9"/"74" -> número 0–100; qualquer outra coisa -> 'invalid'. */
export function parseOptionalPercentBR(raw: string): number | null | 'invalid' {
  if (raw.trim() === '') return null
  const parsed = parsePercentBR(raw)
  if (parsed === 'invalid') return 'invalid'
  return parsed > 100 ? 'invalid' : parsed
}

/**
 * Sanitiza digitação livre de um campo percentual: mantém só dígitos e uma única
 * vírgula decimal (a primeira digitada vence; vírgulas extras são descartadas).
 */
export function sanitizePercentDraft(raw: string): string {
  const digitsAndComma = raw.replace(/[^\d,]/g, '')
  const firstComma = digitsAndComma.indexOf(',')
  return firstComma === -1 ? digitsAndComma : digitsAndComma.slice(0, firstComma + 1) + digitsAndComma.slice(firstComma + 1).replace(/,/g, '')
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

/** Diferença em dias corridos entre duas datas YYYY-MM-DD (b - a), em aritmética UTC pura. */
export function daysBetweenIsoDates(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / msPerDay)
}

export type PeriodPreset = 'today' | '7d' | '30d' | 'custom'

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  custom: 'Personalizado',
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

/** Igual a parseOptionalInt, mas aceita um '-' inicial — usado só por seguidores líquidos. */
export function parseOptionalSignedInt(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-') return null
  if (!/^-?\d+$/.test(trimmed)) return 'invalid'
  const n = Number(trimmed)
  return Number.isInteger(n) ? n : 'invalid'
}

export interface GoalEstimate {
  status: 'reached' | 'unavailable' | 'estimated'
  daysRemaining?: number
  dailyAverageGrowth?: number
}

/**
 * Estima quantos dias faltam para atingir a meta, com base na média diária de
 * crescimento de seguidores observada no histórico (primeiro vs. último registro).
 * Nunca inventa um número quando não há dados suficientes.
 */
export function estimateGoalCompletion(
  sortedMetrics: DailyMetric[],
  currentFollowers: number,
  goal: number,
): GoalEstimate {
  if (currentFollowers >= goal) {
    return { status: 'reached' }
  }
  if (sortedMetrics.length < 2) {
    return { status: 'unavailable' }
  }
  const first = sortedMetrics[0]
  const last = sortedMetrics[sortedMetrics.length - 1]
  const days = daysBetweenIsoDates(first.date, last.date)
  if (days <= 0) {
    return { status: 'unavailable' }
  }
  const dailyAverageGrowth = (last.followers - first.followers) / days
  if (dailyAverageGrowth <= 0) {
    return { status: 'unavailable' }
  }
  const remaining = goal - currentFollowers
  const daysRemaining = Math.ceil(remaining / dailyAverageGrowth)
  return { status: 'estimated', daysRemaining, dailyAverageGrowth }
}
