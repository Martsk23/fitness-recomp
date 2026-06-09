import { useEffect, useState } from 'react'
import { Sun, TrendingDown } from 'lucide-react'
import { db } from '../db.js'
import { C, num, todayKey } from '../ui.js'

// Phase 0 : tableau de bord en lecture seule, alimenté par Dexie.
// Les écrans de SAISIE (ajout rapide, tickers interactifs, pesée) arrivent en Phase 1.
export default function Jour() {
  const [settings, setSettings] = useState(null)
  const [consumed, setConsumed] = useState({ kcal: 0, p: 0, c: 0, f: 0, s: 0 })
  const [entryCount, setEntryCount] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await db.settings.get(1)
      const entries = await db.journalEntries.where('date').equals(todayKey()).toArray()
      if (!alive) return
      const agg = entries.reduce(
        (a, e) => ({
          kcal: a.kcal + (e.kcal || 0),
          p: a.p + (e.protein || 0),
          c: a.c + (e.carb || 0),
          f: a.f + (e.fat || 0),
          s: a.s + (e.sugarsSimple || 0),
        }),
        { kcal: 0, p: 0, c: 0, f: 0, s: 0 },
      )
      setSettings(s)
      setConsumed(agg)
      setEntryCount(entries.length)
    })()
    return () => {
      alive = false
    }
  }, [])

  if (!settings) return null

  const targetKcal = settings.targetKcal
  const remaining = Math.round(targetKcal - consumed.kcal)
  const pct = Math.min(100, (consumed.kcal / targetKcal) * 100)

  return (
    <div className="px-5 pb-4">
      {/* HÉRO : énergie restante */}
      <div className="flex items-center gap-5 mt-2 mb-5">
        <EnergyRing pct={pct} />
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: C.faint }}>
            Restant aujourd'hui
          </div>
          <div className="flex items-baseline gap-1.5">
            <span style={num} className="text-[40px] font-black leading-none">
              {remaining}
            </span>
            <span className="text-sm font-semibold" style={{ color: C.muted }}>
              kcal
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[12px]" style={{ color: C.muted }}>
            <span style={num}>{Math.round(consumed.kcal)} mangé</span>
            <span style={{ color: C.line }}>·</span>
            <span style={num} className="flex items-center gap-1">
              <TrendingDown size={12} style={{ color: C.energy }} /> objectif {targetKcal}
            </span>
          </div>
        </div>
      </div>

      {/* Macros */}
      <div className="space-y-3">
        <MacroBar name="Protéines" v={Math.round(consumed.p)} t={settings.targetProtein} color={C.protein} />
        <MacroBar name="Glucides" v={Math.round(consumed.c)} t={settings.targetCarb} color={C.carb} />
        <MacroBar name="Lipides" v={Math.round(consumed.f)} t={settings.targetFat} color={C.fat} />
      </div>

      {/* Sucres simples */}
      <div className="mt-4 rounded-2xl p-3.5 border" style={{ background: C.surface, borderColor: C.line }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
            Sucres simples
          </span>
          <span style={num} className="text-[12px] font-semibold">
            <span
              style={{
                color:
                  consumed.s >= settings.targetSugarsSimple
                    ? C.warn
                    : consumed.s >= settings.targetSugarsSimple * 0.75
                      ? C.carb
                      : C.text,
              }}
            >
              {Math.round(consumed.s)}
            </span>
            <span style={{ color: C.faint }}> / {settings.targetSugarsSimple} g</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.surfaceHi }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (consumed.s / settings.targetSugarsSimple) * 100)}%`,
              background: consumed.s >= settings.targetSugarsSimple ? C.warn : C.carb,
            }}
          />
        </div>
        <div className="flex items-center gap-1.5 mt-2.5 text-[12px]" style={{ color: C.muted }}>
          <Sun size={13} style={{ color: C.carb }} />
          Recomp · sucres simples &lt; {settings.targetSugarsSimple} g/jour
        </div>
      </div>

      {/* Bandeau Phase 0 — honnête sur l'état réel */}
      {entryCount === 0 && (
        <div
          className="mt-4 rounded-2xl p-3.5 border text-[12.5px] leading-relaxed"
          style={{ background: 'rgba(190,242,100,0.05)', borderColor: 'rgba(190,242,100,0.2)', color: C.muted }}
        >
          <span style={{ color: C.energy, fontWeight: 600 }}>Coquille Phase 0.</span> Données vides,
          objectifs personnalisables. La saisie (aliments, pesée, tickers) arrive en Phase 1. Sauvegarde
          / restauration déjà fonctionnelles via l'icône réglages ⚙.
        </div>
      )}
    </div>
  )
}

// ── Jauge énergie (SVG, élément signature) ─────────────────────────
function EnergyRing({ pct }) {
  const r = 34,
    cx = 44,
    cy = 44,
    circ = 2 * Math.PI * r
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surfaceHi} strokeWidth="7" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={C.energy}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ - (pct / 100) * circ}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
      <text x="44" y="40" textAnchor="middle" fill={C.text} style={{ fontSize: 18, fontWeight: 800, ...num }}>
        {Math.round(pct)}%
      </text>
      <text
        x="44"
        y="55"
        textAnchor="middle"
        fill={C.faint}
        style={{ fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' }}
      >
        budget
      </text>
    </svg>
  )
}

// ── Barre macro ────────────────────────────────────────────────────
function MacroBar({ name, v, t, color }) {
  const pct = Math.min(100, (v / t) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] font-medium">{name}</span>
        <span style={num} className="text-[12.5px]">
          <span className="font-semibold">{v}</span>
          <span style={{ color: C.faint }}> / {t} g</span>
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: C.surfaceHi }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
