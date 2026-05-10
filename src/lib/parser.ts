export interface ParsedSet {
  weight: number
  repsArr: number[]
  rest: string | null
}

export function parseSetStr(raw: string): ParsedSet | null {
  raw = raw.trim()
  let rest: string | null = null
  const rm = raw.match(/\(([^)]+)\)\s*$/)
  if (rm) { rest = rm[1].trim(); raw = raw.slice(0, rm.index!).trim() }
  const parts = raw.split(/[x*×]/i).map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const weight = parseFloat(parts[0])
  if (isNaN(weight)) return null
  const repsArr = parts.slice(1).map(Number)
  if (repsArr.some(isNaN)) return null
  return { weight, repsArr, rest }
}

export function volOf(weight: number, repsArr: number[]): number {
  return repsArr.reduce((a, r) => a + r * weight, 0)
}