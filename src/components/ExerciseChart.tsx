'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

// Wykresy postępu jednego ćwiczenia. Dwa panele, bo wartości mają różną skalę
// (objętość sesji ~ tysiące kg, ciężar ~ setki) — na jednej osi siła byłaby płaską kreską.
// Liczymy tylko serie z ciężarem (set_type 'weighted') — bw/timed/wt mają inne
// jednostki i nie dają się nanieść na oś kg.

const C = { surface:'#181818', border:'#2a2a2a', grid:'#262626', text:'#e8e8e8', muted:'#555', muted2:'#888' }

type Key = 'session' | 'top' | 'maxW' | 'e1rm'

interface Point {
  date: string; t: number
  session: number; top: number; topLabel: string
  maxW: number; maxWLabel: string
  e1rm: number; e1rmLabel: string
}

interface Series { key: Key; label: string; short: string; color: string; dashed?: boolean; note: (p: Point) => string }

// zero: oś od zera (sumy); bez tego oś startuje tuż pod minimum, żeby były widać małe zmiany.
interface PanelDef { title: string; height: number; zero: boolean; series: Series[] }

const PANELS: PanelDef[] = [
  { title: 'Objętość sesji', height: 160, zero: true, series: [
    { key:'session', label:'Objętość sesji', short:'sesja', color:'#3987e5', note: () => '' },
  ]},
  { title: 'Top seria', height: 120, zero: false, series: [
    { key:'top',     label:'Top seria',      short:'top',   color:'#d95926', note: p => p.topLabel },
  ]},
  { title: 'Siła', height: 180, zero: false, series: [
    { key:'maxW', label:'Najwyższy ciężar',  short:'ciężar', color:'#c98500', note: p => p.maxWLabel },
    { key:'e1rm', label:'Szacowany 1RM',     short:'1RM',    color:'#d55181', dashed:true, note: p => p.e1rmLabel },
  ]},
]

const kg = (n: number) => (Math.round(n * 10) / 10).toLocaleString('pl-PL') + ' kg'
const fmtShort = (s: string) => { const [y,m,d]=s.split('-'); return `${d}.${m}.${y.slice(2)}` }
const toT = (s: string) => Date.UTC(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10))

// Wzór Epleya. Dla 1 powtórzenia zwraca sam ciężar.
export const epley = (w: number, r: number) => r <= 1 ? w : w * (1 + r / 30)

function niceScale(lo: number, hi: number): { min: number; max: number; step: number } {
  if (hi <= lo) { hi = lo + 1 }
  const raw = (hi - lo) / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw)!
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step }
}

export function buildPoints(sessions: { date: string; sets: any[] }[]): Point[] {
  const pts: Point[] = []
  for (const { date, sets } of sessions) {
    const p: Point = { date, t: toT(date), session:0, top:0, topLabel:'', maxW:0, maxWLabel:'', e1rm:0, e1rmLabel:'' }
    for (const s of sets) {
      if (s.set_type !== 'weighted' || !s.weight) continue
      for (const r of s.reps_arr ?? []) {
        if (!r) continue
        const v = s.weight * r
        p.session += v
        if (v > p.top) { p.top = v; p.topLabel = `${s.weight}kg×${r}` }
        if (s.weight > p.maxW || (s.weight === p.maxW && r > +p.maxWLabel.split('×')[1])) {
          p.maxW = s.weight; p.maxWLabel = `${s.weight}kg×${r}`
        }
        const e = epley(s.weight, r)
        if (e > p.e1rm) { p.e1rm = e; p.e1rmLabel = `z ${s.weight}kg×${r}` }
      }
    }
    if (p.session > 0) pts.push(p)
  }
  return pts.sort((a, b) => a.t - b.t)
}

function Panel({ def, pts, width }: { def: PanelDef; pts: Point[]; width: number }) {
  const { title, series, zero } = def
  const [hover, setHover] = useState<number|null>(null)

  const H = def.height
  const M = { top: 10, right: 12, bottom: 22, left: 52 }
  const iw = width - M.left - M.right
  const ih = H - M.top - M.bottom

  const t0 = pts[0].t, t1 = pts[pts.length-1].t
  const x = (t: number) => M.left + (t1 === t0 ? iw / 2 : (t - t0) / (t1 - t0) * iw)

  const vals = pts.flatMap(p => series.map(s => p[s.key]))
  const lo = zero ? 0 : Math.min(...vals) * 0.9
  const { min: yMin, max: yMax, step } = niceScale(lo, Math.max(...vals))
  const y = (v: number) => M.top + ih - (v - yMin) / (yMax - yMin) * ih
  const yTicks: number[] = []
  for (let v = yMin; v <= yMax + 1e-9; v += step) yTicks.push(v)

  // Etykiety dat: pierwsza wyrównana do lewej, ostatnia do prawej, środkowe centralnie.
  // Kolizje liczymy na rzeczywistych krawędziach tekstu, bo oś jest czasowa
  // i dwie sesje dzień po dniu stoją tuż obok siebie.
  const last = pts.length - 1
  const LABEL_W = 50, PAD = 10
  const anchor = (i: number) => pts.length === 1 ? 'middle' : i === 0 ? 'start' : i === last ? 'end' : 'middle'
  const span = (i: number): [number, number] => {
    const px = x(pts[i].t), a = anchor(i)
    return a === 'start' ? [px, px + LABEL_W] : a === 'end' ? [px - LABEL_W, px] : [px - LABEL_W/2, px + LABEL_W/2]
  }
  const xLabelIdx: number[] = [0]
  if (last > 0) {
    const lastL = span(last)[0]
    for (let i = 1; i < last; i++) {
      const [l, r] = span(i)
      if (l >= span(xLabelIdx[xLabelIdx.length - 1])[1] + PAD && r + PAD <= lastL) xLabelIdx.push(i)
    }
    // ostatnia data zawsze; pierwsza zostaje tylko, jeśli się z nią nie zderza
    if (span(0)[1] + PAD > lastL) xLabelIdx.length = 0
    xLabelIdx.push(last)
  }

  const path = (key: Key) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join('')

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    const px = (e.clientX - rect.left) * (width / rect.width)
    let best = 0, bd = Infinity
    pts.forEach((p, i) => { const d = Math.abs(x(p.t) - px); if (d < bd) { bd = d; best = i } })
    setHover(best)
  }

  const hp = hover !== null ? pts[hover] : null
  const TIP_W = 180
  const tipLeft = hp ? Math.min(Math.max(x(hp.t) - TIP_W / 2, 0), width - TIP_W) : 0

  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:6, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, color:C.muted2, textTransform:'uppercase', letterSpacing:'0.04em' }}>{title}</span>
        {series.length > 1 && series.map(s => (
          <span key={s.key} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.muted2 }}>
            <svg width={14} height={2} style={{ display:'block' }}>
              <line x1={0} x2={14} y1={1} y2={1} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
      <div style={{ position:'relative' }}>
        <svg width="100%" height={H} viewBox={`0 0 ${width} ${H}`} style={{ display:'block', touchAction:'pan-y' }}
          role="img" aria-label={`Wykres: ${series.map(s => s.label).join(', ')}`}>
          {yTicks.map(v => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke={C.grid} strokeWidth={1} />
              <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={10} fill={C.muted2} fontFamily="monospace">
                {v.toLocaleString('pl-PL')}
              </text>
            </g>
          ))}
          {xLabelIdx.map(i => (
            <text key={pts[i].date} x={x(pts[i].t)} y={H - 6} fontSize={10} fill={C.muted2} fontFamily="monospace"
              textAnchor={anchor(i)}>
              {fmtShort(pts[i].date)}
            </text>
          ))}

          {hp && <line x1={x(hp.t)} x2={x(hp.t)} y1={M.top} y2={M.top + ih} stroke={C.muted} strokeWidth={1} />}

          {series.map(s => (
            <g key={s.key}>
              {pts.length > 1 && <path d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2}
                strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />}
              {pts.map((p, i) => (pts.length <= 30 || i === hover) && (
                <circle key={p.date} cx={x(p.t)} cy={y(p[s.key])} r={i === hover ? 4.5 : 3}
                  fill={s.color} stroke={C.surface} strokeWidth={2} />
              ))}
            </g>
          ))}

          <rect x={M.left} y={0} width={iw} height={H} fill="transparent"
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>

        {hp && (
          <div style={{ position:'absolute', top:0, left:tipLeft, width:TIP_W, boxSizing:'border-box', pointerEvents:'none',
            background:'#111', border:`1px solid ${C.border}`, borderRadius:7, padding:'6px 8px', fontSize:11, fontFamily:'monospace', color:C.text }}>
            <div style={{ color:C.muted2, marginBottom:4 }}>{fmtShort(hp.date)}</div>
            {series.map(s => (
              <div key={s.key}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:8, height:8, borderRadius:4, background:s.color }} />
                  <span style={{ flex:1 }}>{s.short}</span><span>{kg(hp[s.key])}</span>
                </div>
                {s.note(hp) && <div style={{ color:C.muted2, textAlign:'right' }}>{s.note(hp)}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const RANGES = [
  { key:'1m',  label:'1M',  months:1 },
  { key:'3m',  label:'3M',  months:3 },
  { key:'6m',  label:'6M',  months:6 },
  { key:'1y',  label:'1R',  months:12 },
  { key:'all', label:'Wszystko', months:0 },
] as const
type RangeKey = typeof RANGES[number]['key']

function rangeStart(months: number): number {
  if (!months) return -Infinity
  const d = new Date()
  return Date.UTC(d.getFullYear(), d.getMonth() - months, d.getDate())
}

export default function ExerciseChart({ sessions }: { sessions: { date: string; sets: any[] }[] }) {
  const allPts = useMemo(() => buildPoints(sessions), [sessions])
  const [range, setRange] = useState<RangeKey>('3m')
  const pts = useMemo(() => {
    const from = rangeStart(RANGES.find(r => r.key === range)!.months)
    return allPts.filter(p => p.t >= from)
  }, [allPts, range])
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [showTable, pts.length > 0])

  if (allPts.length === 0) return null

  const pill = (on: boolean): React.CSSProperties => ({
    background: on ? '#c8f135' : 'transparent', color: on ? '#111' : C.muted2,
    border: `1px solid ${on ? '#c8f135' : C.border}`, borderRadius:99, padding:'2px 10px',
    fontSize:11, cursor:'pointer', fontFamily:'inherit', fontWeight: on ? 600 : 400,
  })

  const th: React.CSSProperties = { fontWeight:400, padding:'4px 0 4px 8px' }

  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {RANGES.map(r => (
            <button key={r.key} style={pill(range === r.key)} onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
        </div>
        <button onClick={() => setShowTable(v => !v)}
          style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.muted2, borderRadius:7, padding:'2px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
          {showTable ? 'wykres' : 'tabela'}
        </button>
      </div>

      {pts.length === 0 ? (
        <p style={{ fontSize:12, color:C.muted, margin:'8px 0' }}>Brak treningów z ciężarem w tym zakresie.</p>
      ) : showTable ? (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', fontSize:11, fontFamily:'monospace', borderCollapse:'collapse', whiteSpace:'nowrap' }}>
            <thead>
              <tr style={{ color:C.muted2, textAlign:'right' }}>
                <th style={{ ...th, textAlign:'left', paddingLeft:0 }}>Data</th>
                <th style={th}>Sesja</th>
                <th style={th}>Top seria</th>
                <th style={th}>Max ciężar</th>
                <th style={th}>Szac. 1RM</th>
              </tr>
            </thead>
            <tbody>
              {[...pts].reverse().map(p => (
                <tr key={p.date} style={{ borderTop:`1px solid ${C.border}`, color:C.text, textAlign:'right' }}>
                  <td style={{ textAlign:'left', padding:'4px 0' }}>{fmtShort(p.date)}</td>
                  <td style={th}>{kg(p.session)}</td>
                  <td style={th}>{kg(p.top)}</td>
                  <td style={th}>{p.maxWLabel}</td>
                  <td style={th}>{kg(p.e1rm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} style={{ width:'100%' }}>
          {PANELS.map(pn => <Panel key={pn.title} def={pn} pts={pts} width={width} />)}
          <div style={{ fontSize:10, color:C.muted, marginTop:-4 }}>1RM szacowany wzorem Epleya: ciężar × (1 + powt./30)</div>
        </div>
      )}
    </div>
  )
}
