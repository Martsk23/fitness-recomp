import { useEffect, useState } from 'react'
import { Sun, TrendingDown, TrendingUp, Minus, Plus, Scale, Droplet, Pill, Check, CircleDot } from 'lucide-react'
import { db, SETTINGS_KEY } from '../db.js'
import { C, num, todayKey } from '../ui.js'
import { trend, shouldWeighNow } from '../lib/weight.js'
import { loadActiveConfigs, loadStates, setValue, nextValue } from '../lib/tickers.js'

const fmtKg = (kg) => kg.toFixed(1).replace('.', ',')

// Phase 0 : tableau de bord en lecture seule, alimenté par Dexie.
// Les écrans de SAISIE (ajout rapide, tickers interactifs, pesée) arrivent en Phase 1.
export default function Jour() {
  const [settings, setSettings] = useState(null)
  const [consumed, setConsumed] = useState({ kcal: 0, p: 0, c: 0, f: 0, s: 0 })
  const [entryCount, setEntryCount] = useState(0)
  const [weight, setWeight] = useState({ today: null, t: { direction: 'flat', deltaKg: 0 } })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await db.settings.get(SETTINGS_KEY)
      const entries = await db.journalEntries.where('date').equals(todayKey()).toArray()
      const logs = await db.weightLogs.orderBy('datetime').toArray()
      if (!alive) return
      const todayLogs = logs.filter((l) => l.date === todayKey())
      setWeight({
        today: todayLogs.length ? todayLogs[todayLogs.length - 1].weightKg : null,
        t: trend(logs.map((l) => l.weightKg)),
      })
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

  // Fallback propre : tant que le profil n'a pas calculé de cibles, pas de budgets
  // faux ni de NaN. (En pratique l'onboarding gate déjà l'app — ceinture + bretelles.)
  if (settings.targetsSource !== 'computed' || settings.targetKcal == null) {
    return (
      <div className="px-5 py-16 text-center" style={{ color: C.muted }}>
        <Scale size={22} style={{ color: C.faint }} className="mx-auto mb-2" />
        <div className="text-[13px]">Configure ton profil pour calculer tes budgets.</div>
      </div>
    )
  }

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

      {/* Routine du jour : tickers interactifs (eau + compléments) */}
      <Tickers />

      {/* Poids du jour + tendance, ou invitation à se peser le matin */}
      <WeightCard today={weight.today} t={weight.t} />

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

// ── Carte poids du jour ────────────────────────────────────────────
function WeightCard({ today, t }) {
  if (today != null) {
    const map = {
      down: { Icon: TrendingDown, color: C.energy },
      up: { Icon: TrendingUp, color: C.carb },
      flat: { Icon: Minus, color: C.muted },
    }
    const { Icon, color } = map[t.direction]
    return (
      <div
        className="mt-4 rounded-2xl p-3.5 border flex items-center justify-between"
        style={{ background: C.surface, borderColor: C.line }}
      >
        <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: C.muted }}>
          <Scale size={16} style={{ color: C.energy }} /> Pesée enregistrée
          {t.direction !== 'flat' && (
            <Icon size={13} style={{ color }} />
          )}
        </span>
        <span style={num} className="text-[15px] font-semibold">
          {fmtKg(today)} kg
        </span>
      </div>
    )
  }
  // Pas pesé aujourd'hui : CTA "à jeun" le matin, sinon rappel discret.
  const inviteNow = shouldWeighNow({ hasLoggedToday: false })
  if (inviteNow) {
    return (
      <div
        className="mt-4 rounded-2xl p-3.5 border flex items-center gap-2 text-[13px] font-medium"
        style={{ background: 'rgba(56,189,248,0.06)', borderColor: 'rgba(56,189,248,0.25)', color: C.protein }}
      >
        <Scale size={16} /> Bon moment pour te peser — à jeun, avant le petit-déj.
      </div>
    )
  }
  return (
    <div
      className="mt-4 rounded-2xl p-3.5 border flex items-center gap-2 text-[13px]"
      style={{ background: C.surface, borderColor: C.line, color: C.muted }}
    >
      <Scale size={16} style={{ color: C.faint }} /> Pas encore pesé aujourd'hui.
    </div>
  )
}

// ── Tickers interactifs (routine du jour) ──────────────────────────
// Compteurs (eau) : − / + bornés à 0. Cases (compléments) : toggle.
// État keyé par (tickerId, date) → reset auto à minuit (D3), pas de cron.
const TICKER_ICONS = { droplet: Droplet, pill: Pill }

function Tickers() {
  const [configs, setConfigs] = useState(null)
  const [states, setStates] = useState({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [cfgs, st] = await Promise.all([loadActiveConfigs(), loadStates()])
      if (alive) {
        setConfigs(cfgs)
        setStates(st)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  async function act(cfg, action) {
    const v = nextValue(cfg, states[cfg.id] || 0, action)
    setStates((s) => ({ ...s, [cfg.id]: v })) // optimiste : retour tactile immédiat
    await setValue(cfg.id, v) // persiste sur la clé du jour
  }

  if (!configs || configs.length === 0) return null
  const done = configs.filter((c) => (states[c.id] || 0) >= c.target).length

  return (
    <div className="mt-4 rounded-2xl p-3.5 border" style={{ background: C.surface, borderColor: C.line }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
          Routine du jour
        </span>
        <span className="text-[12px] font-semibold" style={{ color: done === configs.length ? C.energy : C.muted, ...num }}>
          {done} / {configs.length}
        </span>
      </div>
      <div className="space-y-2.5">
        {configs.map((cfg) => {
          const Icon = TICKER_ICONS[cfg.icon] || CircleDot
          const v = states[cfg.id] || 0
          const reached = v >= cfg.target
          return (
            <div key={cfg.id} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-medium">
                <Icon size={15} style={{ color: reached ? C.energy : C.muted }} />
                {cfg.label}
              </span>
              {cfg.type === 'counter' ? (
                <div className="flex items-center gap-2.5">
                  <StepBtn label={`Décrémenter ${cfg.label}`} onClick={() => act(cfg, 'dec')} disabled={v === 0}>
                    <Minus size={15} />
                  </StepBtn>
                  <span
                    data-testid={`ticker-value-${cfg.label}`}
                    style={num}
                    className="text-[13px] font-semibold tabular-nums min-w-[44px] text-center"
                  >
                    <span style={{ color: reached ? C.energy : C.text }}>{v}</span>
                    <span style={{ color: C.faint }}> / {cfg.target}</span>
                  </span>
                  <StepBtn label={`Incrémenter ${cfg.label}`} onClick={() => act(cfg, 'inc')}>
                    <Plus size={15} />
                  </StepBtn>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => act(cfg, 'toggle')}
                  aria-label={`Cocher ${cfg.label}`}
                  aria-pressed={reached}
                  className="w-7 h-7 rounded-full flex items-center justify-center border active:scale-90 transition"
                  style={{
                    background: reached ? C.energy : 'transparent',
                    borderColor: reached ? C.energy : C.line,
                    color: reached ? '#0B0E13' : C.faint,
                  }}
                >
                  {reached && <Check size={16} strokeWidth={3} />}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StepBtn({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-7 h-7 rounded-full flex items-center justify-center border active:scale-90 transition disabled:opacity-30"
      style={{ background: C.surfaceHi, borderColor: C.line, color: C.text }}
    >
      {children}
    </button>
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
