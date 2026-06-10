import { useEffect, useState } from 'react'
import { Sun, TrendingDown, TrendingUp, Minus, Plus, Scale, Droplet, Pill, Check, CircleDot, Flame } from 'lucide-react'
import { db, SETTINGS_KEY } from '../db.js'
import { C, num, todayKey } from '../ui.js'
import { trend, shouldWeighNow } from '../lib/weight.js'
import { loadActiveConfigs, loadStates, setValue, nextValue } from '../lib/tickers.js'
import { loadExpenditure, setExpenditure, clearExpenditure, energyBalance } from '../lib/expenditure.js'
import { loadIntake, setIntake, clearIntake, effectiveConsumed } from '../lib/intake.js'

const fmtKg = (kg) => kg.toFixed(1).replace('.', ',')

// Phase 0 : tableau de bord en lecture seule, alimenté par Dexie.
// Les écrans de SAISIE (ajout rapide, tickers interactifs, pesée) arrivent en Phase 1.
export default function Jour() {
  const [settings, setSettings] = useState(null)
  const [consumed, setConsumed] = useState({ kcal: 0, p: 0, c: 0, f: 0, s: 0 })
  const [entryCount, setEntryCount] = useState(0)
  const [weight, setWeight] = useState({ today: null, t: { direction: 'flat', deltaKg: 0 } })
  // Consommé total saisi à la main : undefined = chargement · null = non saisi · nombre = kcal.
  const [manualIntake, setManualIntake] = useState(undefined)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await db.settings.get(SETTINGS_KEY)
      const entries = await db.journalEntries.where('date').equals(todayKey()).toArray()
      const logs = await db.weightLogs.orderBy('datetime').toArray()
      const intake = await loadIntake()
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
      setManualIntake(intake)
    })()
    return () => {
      alive = false
    }
  }, [])

  if (!settings || manualIntake === undefined) return null

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
  // Consommé effectif (D20, seam unique) : le journal prime dès ≥1 entrée, le total
  // manuel n'est qu'un fallback à 0 entrée. consumedFromManual est vrai SEULEMENT
  // dans ce cas fallback → c'est là que le détail macros est inconnu (« — »).
  const consumedKcal = effectiveConsumed(manualIntake, consumed.kcal, entryCount)
  const consumedFromManual = entryCount === 0 && manualIntake != null
  // Un total manuel résiduel existe mais le journal prime → on le signale + on offre
  // l'effacement (réutilise clearIntake, l'affordance existante). Pas de nouvel état.
  const manualOverridden = manualIntake != null && entryCount > 0
  const remaining = Math.round(targetKcal - consumedKcal)
  const pct = Math.min(100, (consumedKcal / targetKcal) * 100)

  async function clearManualIntake() {
    await clearIntake()
    setManualIntake(null)
  }

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
            <span style={num}>{Math.round(consumedKcal)} mangé</span>
            <span style={{ color: C.line }}>·</span>
            <span style={num} className="flex items-center gap-1">
              <TrendingDown size={12} style={{ color: C.energy }} /> objectif {targetKcal}
            </span>
          </div>
          {manualOverridden && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]" style={{ color: C.faint }}>
              <span style={num}>Total manuel ({manualIntake} kcal) saisi — le journal prime.</span>
              <button
                type="button"
                onClick={clearManualIntake}
                className="underline active:scale-95 transition"
                style={{ color: C.muted }}
              >
                Effacer le total manuel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Macros — « non renseigné » quand le consommé vient du total manuel (pas de détail) */}
      <div className="space-y-3">
        <MacroBar name="Protéines" v={Math.round(consumed.p)} t={settings.targetProtein} color={C.protein} unknown={consumedFromManual} />
        <MacroBar name="Glucides" v={Math.round(consumed.c)} t={settings.targetCarb} color={C.carb} unknown={consumedFromManual} />
        <MacroBar name="Lipides" v={Math.round(consumed.f)} t={settings.targetFat} color={C.fat} unknown={consumedFromManual} />
      </div>
      {consumedFromManual && (
        <div className="mt-2 text-[11.5px]" style={{ color: C.faint }}>
          Macros : total kcal saisi, détail non renseigné.
        </div>
      )}

      {/* Sucres simples */}
      <div className="mt-4 rounded-2xl p-3.5 border" style={{ background: C.surface, borderColor: C.line }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
            Sucres simples
          </span>
          <span style={num} className="text-[12px] font-semibold">
            {consumedFromManual ? (
              <span style={{ color: C.faint }}>—</span>
            ) : (
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
            )}
            <span style={{ color: C.faint }}> / {settings.targetSugarsSimple} g</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.surfaceHi }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: consumedFromManual ? '0%' : `${Math.min(100, (consumed.s / settings.targetSugarsSimple) * 100)}%`,
              background: consumed.s >= settings.targetSugarsSimple ? C.warn : C.carb,
            }}
          />
        </div>
        <div className="flex items-center gap-1.5 mt-2.5 text-[12px]" style={{ color: C.muted }}>
          <Sun size={13} style={{ color: C.carb }} />
          Recomp · sucres simples &lt; {settings.targetSugarsSimple} g/jour
        </div>
      </div>

      {/* Bilan énergétique : consommé − dépense totale du jour (saisie manuelle) */}
      <Bilan
        consumedKcal={consumedKcal}
        tracked={entryCount > 0 || consumedFromManual}
        manualIntake={manualIntake}
        entryCount={entryCount}
        onIntakeChange={setManualIntake}
      />

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

// ── Bilan énergétique (consommé − dépense totale du jour) ──────────
// Dépense = 1 nombre par date (saisie manuelle rapide, pas de HealthKit),
// stockée dans `dailyExpenditure` ; absence = non saisi. Le bilan est CALCULÉ.
// Tant que la nutrition n'est pas implémentée (journal vide), on affiche un
// état honnête côté consommé plutôt qu'un faux déficit.
function Bilan({ consumedKcal, tracked, manualIntake, entryCount, onIntakeChange }) {
  const [exp, setExp] = useState(undefined) // undefined = chargement · null = non saisi · nombre = kcal
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const v = await loadExpenditure()
      if (alive) {
        setExp(v)
        setEditing(v == null) // pas encore saisi → champ de saisie ouvert
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (exp === undefined) return null

  async function save() {
    const n = Number(draft.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return
    const k = Math.round(n)
    setExp(k)
    setEditing(false)
    setDraft('')
    await setExpenditure(k)
  }

  async function reset() {
    setExp(null)
    setEditing(true)
    setDraft('')
    await clearExpenditure()
  }

  // Consommé total du jour : persiste puis remonte la valeur à Jour (héro + macros).
  async function saveIntake(k) {
    await setIntake(k)
    onIntakeChange(k)
  }
  async function clearIntakeValue() {
    await clearIntake()
    onIntakeChange(null)
  }

  const balance = energyBalance(consumedKcal, exp)

  return (
    <div className="mt-4 rounded-2xl p-3.5 border" style={{ background: C.surface, borderColor: C.line }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
          Bilan énergétique
        </span>
        <Flame size={14} style={{ color: C.carb }} />
      </div>

      {/* Dépense totale du jour : saisie / affichage */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: C.muted }}>
          <Flame size={15} style={{ color: C.carb }} /> Dépense totale du jour
        </span>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              aria-label="Dépense totale du jour en kcal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="kcal"
              className="w-20 text-right rounded-lg px-2 py-1 text-[13px] border tabular-nums"
              style={{ background: C.surfaceHi, borderColor: C.line, color: C.text }}
            />
            <button
              type="button"
              aria-label="Enregistrer la dépense"
              onClick={save}
              className="text-[12px] font-semibold px-2.5 py-1 rounded-lg active:scale-95 transition"
              style={{ background: C.energy, color: C.bg }}
            >
              OK
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Modifier la dépense du jour"
            onClick={() => {
              setEditing(true)
              setDraft(String(exp))
            }}
            className="flex items-center gap-1.5 text-[13px] font-semibold active:scale-95 transition"
            style={{ color: C.text }}
          >
            <span data-testid="expenditure-value" style={num}>
              {exp}
            </span>
            <span style={{ color: C.faint }}>kcal</span>
          </button>
        )}
      </div>

      {/* Consommé (D20) : le journal prime dès ≥1 entrée (lecture seule « (repas) ») ;
          à 0 entrée, saisie rapide du TOTAL manuel (calque de la Dépense). La valeur
          effective vient de Jour() (effectiveConsumed) — ConsumedRow n'arbitre rien. */}
      <ConsumedRow
        consumedKcal={consumedKcal}
        manualValue={manualIntake}
        entryCount={entryCount}
        onSave={saveIntake}
        onClear={clearIntakeValue}
      />

      {/* Bilan = consommé − dépensé (calculé, jamais stocké) */}
      <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: C.line }}>
        <span className="text-[12px] font-medium" style={{ color: C.muted }}>
          Bilan (consommé − dépensé)
        </span>
        {exp == null ? (
          <span className="text-[12px]" style={{ color: C.faint }}>
            saisis ta dépense
          </span>
        ) : !tracked ? (
          <span className="text-[12px]" style={{ color: C.faint }}>
            en attente des repas
          </span>
        ) : (
          <span
            data-testid="energy-balance"
            className="text-[15px] font-bold"
            style={{ color: balance < 0 ? C.energy : balance > 0 ? C.warn : C.muted, ...num }}
          >
            {balance > 0 ? '+' : ''}
            {balance} kcal
          </span>
        )}
      </div>

      {/* Effacer la dépense (revient à "non saisi") — discret, seulement si saisie */}
      {exp != null && !editing && (
        <button
          type="button"
          onClick={reset}
          className="mt-2 text-[11px]"
          style={{ color: C.faint }}
        >
          Effacer la dépense du jour
        </button>
      )}
    </div>
  )
}

// ── Consommé du jour : saisie rapide du total kcal (calque de la Dépense) ──
// AFFICHAGE PUR : la valeur effective (`consumedKcal`) et la précédence sont
// calculées UNE SEULE FOIS dans Jour() via effectiveConsumed (D20). Ici on se
// contente d'afficher et, à 0 entrée seulement, d'éditer le total manuel.
//   - entryCount > 0 → le journal prime : lecture seule, suffixe « (repas) », pas
//     d'édition (effacer un manuel résiduel se fait sur le héro, D20 point C).
//   - entryCount = 0 → saisie/édition du total manuel (cas saisie rapide post-séance).
function ConsumedRow({ consumedKcal, manualValue, entryCount, onSave, onClear }) {
  const journalPrimes = entryCount > 0
  const [editing, setEditing] = useState(!journalPrimes && manualValue == null)
  const [draft, setDraft] = useState('')

  async function save() {
    const n = Number(draft.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return
    setEditing(false)
    setDraft('')
    await onSave(Math.round(n))
  }

  async function clear() {
    setEditing(true)
    setDraft('')
    await onClear()
  }

  // Journal prioritaire : lecture seule, jamais le total manuel résiduel.
  if (journalPrimes) {
    return (
      <div className="mt-2.5 flex items-center justify-between text-[13px]">
        <span style={{ color: C.muted }}>Consommé</span>
        <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: C.text }}>
          <span data-testid="consumed-value" style={num}>
            {Math.round(consumedKcal)}
          </span>
          <span style={{ color: C.faint }}>kcal (repas)</span>
        </span>
      </div>
    )
  }

  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between text-[13px]">
        <span style={{ color: C.muted }}>Consommé</span>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              aria-label="Consommé total du jour en kcal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="kcal"
              className="w-20 text-right rounded-lg px-2 py-1 text-[13px] border tabular-nums"
              style={{ background: C.surfaceHi, borderColor: C.line, color: C.text }}
            />
            <button
              type="button"
              aria-label="Enregistrer le consommé"
              onClick={save}
              className="text-[12px] font-semibold px-2.5 py-1 rounded-lg active:scale-95 transition"
              style={{ background: C.energy, color: C.bg }}
            >
              OK
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Modifier le consommé du jour"
            onClick={() => {
              setEditing(true)
              setDraft(manualValue != null ? String(manualValue) : '')
            }}
            className="flex items-center gap-1.5 text-[13px] font-semibold active:scale-95 transition"
            style={{ color: C.text }}
          >
            <span data-testid="consumed-value" style={num}>
              {Math.round(consumedKcal)}
            </span>
            <span style={{ color: C.faint }}>kcal</span>
          </button>
        )}
      </div>
      {manualValue != null && !editing && (
        <button type="button" onClick={clear} className="mt-1 text-[11px]" style={{ color: C.faint }}>
          Effacer le consommé du jour
        </button>
      )}
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
function MacroBar({ name, v, t, color, unknown }) {
  const pct = unknown ? 0 : Math.min(100, (v / t) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] font-medium">{name}</span>
        <span style={num} className="text-[12.5px]">
          {unknown ? <span style={{ color: C.faint }}>—</span> : <span className="font-semibold">{v}</span>}
          <span style={{ color: C.faint }}> / {t} g</span>
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: C.surfaceHi }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
