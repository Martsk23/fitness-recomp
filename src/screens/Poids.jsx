import { useEffect, useState } from 'react'
import { Scale, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { db, newRow } from '../db.js'
import { C, num, todayKey } from '../ui.js'
import { movingAverage, trend, MA_WINDOW } from '../lib/weight.js'

// 'YYYY-MM-DDTHH:mm' local (valeur d'un <input type="datetime-local">).
function toDatetimeLocal(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fmtKg = (kg) => kg.toFixed(1).replace('.', ',')
const parseKg = (s) => parseFloat(String(s).replace(',', '.').trim())
const shortDate = (ms) => {
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
const shortTime = (ms) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function Poids() {
  const [logs, setLogs] = useState(null) // tri ascendant (ancien → récent)
  const [kgStr, setKgStr] = useState('')
  const [dtLocal, setDtLocal] = useState(() => toDatetimeLocal(new Date()))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    const rows = await db.weightLogs.orderBy('datetime').toArray()
    setLogs(rows)
  }
  useEffect(() => {
    let alive = true
    ;(async () => {
      const rows = await db.weightLogs.orderBy('datetime').toArray()
      if (alive) setLogs(rows)
    })()
    return () => {
      alive = false
    }
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    const kg = parseKg(kgStr)
    if (!Number.isFinite(kg) || kg < 20 || kg > 400) {
      setError('Poids invalide (attendu entre 20 et 400 kg).')
      return
    }
    const datetime = new Date(dtLocal).getTime()
    if (!Number.isFinite(datetime)) {
      setError('Date/heure invalide.')
      return
    }
    // Invariants 1.1 : newRow() → UUID + updatedAt ; date dérivée du datetime (local).
    await db.weightLogs.add(
      newRow({ date: todayKey(new Date(datetime)), datetime, weightKg: kg, note: note.trim() }),
    )
    setKgStr('')
    setNote('')
    setDtLocal(toDatetimeLocal(new Date()))
    await reload()
  }

  if (!logs) return null

  const values = logs.map((l) => l.weightKg)
  const ma = movingAverage(values)
  const chartData = logs.map((l, i) => ({
    d: shortDate(l.datetime),
    kg: l.weightKg,
    ma: Math.round(ma[i] * 10) / 10,
  }))
  const latest = logs.length ? logs[logs.length - 1] : null
  const t = trend(values)

  return (
    <div className="px-5 pb-4">
      {/* En-tête : dernière pesée + tendance */}
      <div className="flex items-center gap-4 mt-2 mb-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: C.surfaceHi }}
        >
          <Scale size={24} style={{ color: C.energy }} />
        </div>
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: C.faint }}>
            Dernière pesée
          </div>
          {latest ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <span style={num} className="text-[34px] font-black leading-none">
                  {fmtKg(latest.weightKg)}
                </span>
                <span className="text-sm font-semibold" style={{ color: C.muted }}>
                  kg
                </span>
              </div>
              <TrendBadge t={t} />
            </>
          ) : (
            <div className="text-[13px] mt-1" style={{ color: C.muted }}>
              Aucune pesée enregistrée.
            </div>
          )}
        </div>
      </div>

      {/* Formulaire de saisie */}
      <form
        onSubmit={onSubmit}
        className="rounded-2xl p-3.5 border mb-4"
        style={{ background: C.surface, borderColor: C.line }}
      >
        <div className="flex items-end gap-2.5">
          <label className="flex-1">
            <span className="block text-[11px] uppercase tracking-[0.14em] mb-1" style={{ color: C.faint }}>
              Poids (kg)
            </span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Poids en kilogrammes"
              placeholder="78,4"
              value={kgStr}
              onChange={(e) => setKgStr(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-[15px] outline-none border"
              style={{ background: C.bg, borderColor: C.line, color: C.text, ...num }}
            />
          </label>
          <button
            type="submit"
            className="rounded-xl px-4 py-2 text-[14px] font-semibold active:scale-95 transition"
            style={{ background: C.energy, color: '#0B0E13' }}
          >
            Enregistrer
          </button>
        </div>
        <label className="block mt-2.5">
          <span className="block text-[11px] uppercase tracking-[0.14em] mb-1" style={{ color: C.faint }}>
            Date / heure
          </span>
          <input
            type="datetime-local"
            aria-label="Date et heure de la pesée"
            value={dtLocal}
            onChange={(e) => setDtLocal(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-[14px] outline-none border"
            style={{ background: C.bg, borderColor: C.line, color: C.text, ...num }}
          />
        </label>
        {error && (
          <div className="mt-2 text-[12px]" style={{ color: C.warn }}>
            {error}
          </div>
        )}
      </form>

      {/* Courbe : points bruts + moyenne glissante */}
      {chartData.length >= 2 && (
        <div className="rounded-2xl p-3.5 border mb-4" style={{ background: C.surface, borderColor: C.line }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
              Tendance
            </span>
            <span className="text-[11px]" style={{ color: C.faint }}>
              moy. glissante {MA_WINDOW} pesées
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="d" tick={{ fill: C.faint, fontSize: 10 }} stroke={C.line} />
              <YAxis
                domain={['dataMin - 1', 'dataMax + 1']}
                tick={{ fill: C.faint, fontSize: 10 }}
                stroke={C.line}
                width={40}
              />
              <Tooltip
                contentStyle={{ background: C.surfaceHi, border: `1px solid ${C.line}`, borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: C.muted }}
                formatter={(v, name) => [`${fmtKg(v)} kg`, name === 'ma' ? 'moy.' : 'pesée']}
              />
              <Line type="monotone" dataKey="kg" stroke={C.protein} strokeWidth={1.5} dot={{ r: 2.5 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="ma" stroke={C.energy} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Historique */}
      <div className="space-y-2">
        {[...logs].reverse().map((l) => (
          <div
            key={l.id}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 border"
            style={{ background: C.surface, borderColor: C.line }}
          >
            <div className="flex items-center gap-2.5 text-[12.5px]" style={{ color: C.muted }}>
              <span style={num}>{shortDate(l.datetime)}</span>
              <span style={{ color: C.line }}>·</span>
              <span style={num}>{shortTime(l.datetime)}</span>
              {l.note && <span style={{ color: C.faint }}>— {l.note}</span>}
            </div>
            <span style={num} className="text-[14px] font-semibold">
              {fmtKg(l.weightKg)} kg
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendBadge({ t }) {
  const map = {
    down: { Icon: TrendingDown, color: C.energy },
    up: { Icon: TrendingUp, color: C.carb },
    flat: { Icon: Minus, color: C.muted },
  }
  const { Icon, color } = map[t.direction]
  const abs = Math.abs(t.deltaKg)
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: C.muted }}>
      <Icon size={13} style={{ color }} />
      {t.direction === 'flat' ? (
        <span>stable sur la période</span>
      ) : (
        <span style={num}>
          {t.direction === 'down' ? '−' : '+'}
          {fmtKg(abs)} kg (moy. glissante)
        </span>
      )}
    </div>
  )
}
