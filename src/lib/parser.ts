export type ParsedGroup =
  | { type: 'weighted'; weight: number; repsArr: number[] }
  | { type: 'bw'; reps: number }
  | { type: 'timed'; seconds: number[] }

export interface ParsedSet {
  groups: ParsedGroup[]
  rest: string | null
}

function parseSingleGroup(raw: string): ParsedGroup | null {
  raw = raw.trim().replace(',', '.')

  // timed comma-separated e.g. "60s,55s,45s"
  if (/^[\d.,s]+s$/i.test(raw.replace(/\s/g, ''))) {
    const times = raw.split(/[,，]/).map(t => {
      const m = t.trim().match(/^(\d+(?:\.\d+)?)s$/i)
      return m ? parseFloat(m[1]) : null
    })
    if (times.every(t => t !== null)) return { type:'timed', seconds: times as number[] }
  }

  // single time e.g. "60s"
  const tm = raw.match(/^(\d+(?:\.\d+)?)s$/i)
  if (tm) return { type:'timed', seconds:[parseFloat(tm[1])] }

  // weighted e.g. "100x5x5"
  if (/[x*×]/i.test(raw)) {
    const parts = raw.split(/[x*×]/i).map(p => p.trim()).filter(Boolean)
    if (parts.length < 2) return null
    const weight = parseFloat(parts[0])
    if (isNaN(weight)) return null
    const repsArr = parts.slice(1).map(Number)
    if (repsArr.some(isNaN)) return null
    return { type:'weighted', weight, repsArr }
  }

  // bodyweight e.g. "10"
  if (/^\d+$/.test(raw)) return { type:'bw', reps: parseInt(raw) }

  return null
}

export function parseSetStr(raw: string): ParsedSet | null {
  raw = raw.trim()
  let rest: string | null = null
  const rm = raw.match(/\(([^)]+)\)\s*$/)
  if (rm) { rest = rm[1].trim(); raw = raw.slice(0, rm.index!).trim() }
  const groups = raw.split(/\s+/).map(parseSingleGroup)
  if (groups.some(g => g === null)) return null
  return { groups: groups as ParsedGroup[], rest }
}

export function groupLabel(g: ParsedGroup): string {
  if (g.type === 'timed')    return g.seconds.map(s => s+'s').join(' · ')
  if (g.type === 'bw')       return g.reps + ' powt.'
  return `${g.weight} kg · ${g.repsArr.join('·')} powt.`
}

export function volOf(weight: number, repsArr: number[]): number {
  return repsArr.reduce((a, r) => a + r * weight, 0)
}

export function groupVolLabel(g: ParsedGroup): string {
  if (g.type === 'weighted') return g.repsArr.reduce((a,r)=>a+r*g.weight,0) + ' kg'
  if (g.type === 'timed')    return g.seconds.reduce((a,s)=>a+s,0) + 's'
  if (g.type === 'bw')       return g.reps + ' powt.'
  return ''
}