import { useEffect, useState } from 'react'
import { Sun, TrendingDown, TrendingUp, Minus, Plus, Scale, Droplet, Pill, Check, CircleDot, Flame, Dumbbell, Activity, AlertTriangle, UtensilsCrossed, Sparkles } from 'lucide-react'
import { db, SETTINGS_KEY } from '../db.js'
import { C, num, todayKey } from '../ui.js'
import { trend, shouldWeighNow } from '../lib/weight.js'
import { loadActiveConfigs, loadStates, setValue, nextValue } from '../lib/tickers.js'
import { loadExpenditure, setExpenditure, clearExpenditure, energyBalance } from '../lib/expenditure.js'
import { loadIntake, setIntake, clearIntake, effectiveConsumed } from '../lib/intake.js'
import { loadTraining, setTraining, loadDayWorkouts, effectiveTrained } from '../lib/training.js'
import { glycemicShares, evaluateGlycemicAlerts } from '../lib/glycemic.js'
import { loadRecipes, loadIngredients, applyRecipe } from '../lib/nutrition.js'
import { suggestMeals, proteinDeficitYesterday } from '../lib/suggest.js'

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
  // Séance du jour (Phase 2, D21) : undefined = chargement · bool = séance MANUELLE
  // (ce que pilote le toggle). Le `trained` EFFECTIF (alerte B) combine manuel +
  // séances importées via le seam effectiveTrained (D22).
  const [trained, setTrained] = useState(undefined)
  // Séances importées (Strong) du jour → réconciliation D22 (jamais saisi ici).
  const [dayWorkouts, setDayWorkouts] = useState([])
  // Composition glucidique du journal du jour (dérivée, jamais stockée).
  const [glyc, setGlyc] = useState(null)
  // Re-chargement après une action qui modifie le journal (ex. rappel d'une
  // suggestion D24) → tout se recalcule (consommé, macros, restants, carte).
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await db.settings.get(SETTINGS_KEY)
      const entries = await db.journalEntries.where('date').equals(todayKey()).toArray()
      const logs = await db.weightLogs.orderBy('datetime').toArray()
      const intake = await loadIntake()
      const isTrained = await loadTraining()
      const workoutsToday = await loadDayWorkouts()
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
      setTrained(isTrained)
      setDayWorkouts(workoutsToday)
      setGlyc(glycemicShares(entries))
    })()
    return () => {
      alive = false
    }
  }, [refreshKey])

  if (!settings || manualIntake === undefined || trained === undefined) return null

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

  // Analyse glucidique (D21) : dérivée du JOURNAL → uniquement quand ≥1 entrée
  // (à 0 entrée le détail macros est inconnu, cf. consumedFromManual). Les seuils
  // ne vivent QUE dans evaluateGlycemicAlerts (seam unique).
  const glycActive = entryCount > 0 && glyc != null
  // `trained` EFFECTIF (D22, seam unique) : toggle manuel OU séance importée réelle
  // du jour. La règle B (haut-IG jour de repos) s'appuie là-dessus, pas sur le seul
  // toggle. Le toggle reste l'override manuel (pilote `trained`).
  const trainedEffective = effectiveTrained({ manualPresent: trained, importedWorkouts: dayWorkouts })
  const alerts = glycActive
    ? evaluateGlycemicAlerts({ sugars: consumed.s, sugarsTarget: settings.targetSugarsSimple, shares: glyc, trained: trainedEffective })
    : []

  // Restants du jour pour les suggestions (D24). En mode dégradé D20 (total manuel,
  // 0 entrée) le détail macros est inconnu → null (le moteur score alors kcal-only).
  const remainingBudget = {
    kcal: targetKcal - consumedKcal,
    protein: consumedFromManual ? null : settings.targetProtein - consumed.p,
    carb: consumedFromManual ? null : settings.targetCarb - consumed.c,
    fat: consumedFromManual ? null : settings.targetFat - consumed.f,
    sugars: consumedFromManual ? null : settings.targetSugarsSimple - consumed.s,
  }

  async function clearManualIntake() {
    await clearIntake()
    setManualIntake(null)
  }

  // Séance du jour : maj optimiste (retour tactile) puis persistance (D21).
  async function toggleTraining() {
    const next = !trained
    setTrained(next)
    await setTraining(next)
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

      {/* Suggestions de repas (D24) : dérivées des recettes (D19) + restants du jour.
          Sous le bloc restant (« voilà ton restant → voilà quoi manger »). 1 tap =
          applyRecipe (flux D19) → refreshKey recharge tout, la carte se re-trie. */}
      <SuggestionsCard
        remaining={remainingBudget}
        trained={trainedEffective}
        kcalOnly={consumedFromManual}
        targetProtein={settings.targetProtein}
        onLogged={() => setRefreshKey((k) => k + 1)}
      />

      {/* Séance du jour (D21) : saisie explicite 1-tap. Absence = repos. Sert la
          règle d'alerte B (haut-IG un jour de repos). Toujours visible (utile même
          sans repas logué : marquer la séance avant de composer). */}
      <SeanceToggle trained={trained} onToggle={toggleTraining} />

      {/* Composition glucidique + alertes (dérivées du journal du jour, D21) */}
      {glycActive && <GlycemicCard glyc={glyc} alerts={alerts} />}

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

// ── Séance du jour (toggle 1-tap) ──────────────────────────────────
// Présence = séance, absence = repos (D21). Saisie explicite, pas d'inférence.
function SeanceToggle({ trained, onToggle }) {
  return (
    <div className="mt-4 rounded-2xl p-3.5 border flex items-center justify-between" style={{ background: C.surface, borderColor: C.line }}>
      <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: trained ? C.text : C.muted }}>
        <Dumbbell size={16} style={{ color: trained ? C.energy : C.faint }} /> Séance aujourd'hui
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Séance aujourd'hui"
        aria-pressed={trained}
        data-testid="seance-toggle"
        className="px-3.5 py-1 rounded-full text-[12px] font-semibold border active:scale-95 transition"
        style={{
          background: trained ? C.energy : 'transparent',
          borderColor: trained ? C.energy : C.line,
          color: trained ? C.bg : C.faint,
        }}
      >
        {trained ? 'Oui' : 'Repos'}
      </button>
    </div>
  )
}

// ── Composition glucidique + alertes (D21) ─────────────────────────
// Barre 3 segments (bas / modéré / haut IG) en % des GRAMMES de glucides du
// journal + alertes contextuelles (sucres élevés, haut-IG jour de repos). Les
// seuils sont calculés dans evaluateGlycemicAlerts (seam unique) — ici rien.
function GlycemicCard({ glyc, alerts }) {
  const hasCarb = glyc.totalCarb > 0
  return (
    <div className="mt-4 rounded-2xl p-3.5 border" style={{ background: C.surface, borderColor: C.line }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
          Composition glucidique
        </span>
        <Activity size={14} style={{ color: C.carb }} />
      </div>

      {hasCarb ? (
        <>
          {/* Segments à l'échelle du total ; un résidu « non classé » laisse un creux. */}
          <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: C.surfaceHi }}>
            <div className="h-full transition-all" style={{ width: `${glyc.lowPct}%`, background: C.energy }} />
            <div className="h-full transition-all" style={{ width: `${glyc.midPct}%`, background: C.carb }} />
            <div className="h-full transition-all" style={{ width: `${glyc.highPct}%`, background: C.warn }} />
          </div>
          <div className="flex items-center gap-3 mt-2.5 text-[11.5px]" style={{ color: C.muted }}>
            <GlyLegend color={C.energy} label="bas" pct={glyc.lowPct} testid="glyc-low" />
            <GlyLegend color={C.carb} label="modéré" pct={glyc.midPct} testid="glyc-mid" />
            <GlyLegend color={C.warn} label="haut" pct={glyc.highPct} testid="glyc-high" />
          </div>
        </>
      ) : (
        <div className="text-[12px]" style={{ color: C.faint }}>
          Pas de glucides enregistrés aujourd'hui.
        </div>
      )}

      {alerts.length > 0 && (
        <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: C.line }}>
          {alerts.map((a) => (
            <div
              key={a.id}
              data-testid={`alert-${a.id}`}
              className="flex items-start gap-1.5 text-[12px] leading-snug"
              style={{ color: C.warn }}
            >
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {a.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GlyLegend({ color, label, pct, testid }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span>{label}</span>
      <span data-testid={testid} style={num} className="font-semibold" >
        {Math.round(pct)}%
      </span>
    </span>
  )
}

// ── Suggestions de repas (D24) ─────────────────────────────────────
// Carte dérivée des recettes (D19) selon les restants du jour. Le moteur PUR
// `suggestMeals` décide l'état (mode) ET le contenu ; ici on charge la base
// (recettes, biblio, protéines de la VEILLE) et on rend. 1 tap = applyRecipe
// (flux D19 réutilisé) → onLogged() recharge le Jour → la carte se re-trie.
const CHIP_LABELS = { proteine: 'Protéiné', leger: 'Léger', 'post-seance': 'Post-séance' }

function SuggestionsCard({ remaining, trained, kcalOnly, targetProtein, onLogged }) {
  const [data, setData] = useState(null)
  const [activeChip, setActiveChip] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [warning, setWarning] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [recipes, ingredients] = await Promise.all([loadRecipes(), loadIngredients()])
      // Protéines de la veille : null si AUCUN journal détaillé hier (mode manuel /
      // 0 entrée) → proteinDeficitYesterday renvoie false (pas de boost, jamais NaN).
      const yKey = todayKey(new Date(Date.now() - 86_400_000))
      const yEntries = await db.journalEntries.where('date').equals(yKey).toArray()
      const yProtein = yEntries.length ? yEntries.reduce((a, e) => a + (e.protein || 0), 0) : null
      if (!alive) return
      setData({
        recipes,
        ingredients,
        ingredientsById: new Map(ingredients.map((i) => [i.id, i])),
        proteinDeficit: proteinDeficitYesterday(yProtein, targetProtein),
      })
    })()
    return () => {
      alive = false
    }
  }, [targetProtein])

  if (!data) return null

  const view = suggestMeals({
    recipes: data.recipes,
    ingredientsById: data.ingredientsById,
    ingredients: data.ingredients,
    remaining,
    trained,
    kcalOnly,
    hour: new Date().getHours(),
    proteinDeficit: data.proteinDeficit,
  })

  if (view.mode === 'hidden') return null

  async function pick(recipe) {
    setBusyId(recipe.id)
    setWarning(null)
    const { added, missing } = await applyRecipe(recipe.id)
    setBusyId(null)
    if (missing.length) setWarning(`Ignoré (supprimé) : ${missing.join(', ')}`)
    if (added > 0) onLogged() // le Jour recharge → budget réduit → re-tri
  }

  // Chips disponibles = union des tags des suggestions ; filtre client.
  const allTags = [...new Set(view.suggestions.flatMap((s) => s.tags))]
  const shown = activeChip ? view.suggestions.filter((s) => s.tags.includes(activeChip)) : view.suggestions

  return (
    <div data-testid="suggestions-card" className="mt-4 rounded-2xl p-3.5 border" style={{ background: C.surface, borderColor: C.line }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
          Suggestions
        </span>
        <Sparkles size={14} style={{ color: C.energy }} />
      </div>

      {view.mode === 'no-recipes' && (
        <div className="text-[12.5px] leading-relaxed" style={{ color: C.muted }}>
          Enregistre tes plats récurrents comme recettes (onglet Bouffe) pour recevoir des suggestions dans ton budget.
        </div>
      )}

      {view.mode === 'gate' && (
        <div data-testid="suggestions-gate" className="flex items-start gap-1.5 text-[12.5px] leading-snug" style={{ color: C.warn }}>
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {view.reason}
        </div>
      )}

      {view.suggestions.length > 0 && (
        <>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {allTags.map((t) => {
                const on = activeChip === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveChip(on ? null : t)}
                    aria-pressed={on}
                    className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold border active:scale-95 transition"
                    style={{
                      background: on ? C.energy : 'transparent',
                      borderColor: on ? C.energy : C.line,
                      color: on ? C.bg : C.muted,
                    }}
                  >
                    {CHIP_LABELS[t] || t}
                  </button>
                )
              })}
            </div>
          )}

          <div className="space-y-2">
            {shown.map((s) => (
              <div key={s.recipe.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: C.surfaceHi }}>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: C.text }}>
                    {s.recipe.name}
                  </div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: C.muted, ...num }}>
                    {s.totals.kcal} kcal · P {Math.round(s.totals.protein)} / G {Math.round(s.totals.carb)} / L {Math.round(s.totals.fat)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => pick(s.recipe)}
                  disabled={busyId === s.recipe.id}
                  aria-label={`Suggérer ${s.recipe.name}`}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold active:scale-95 transition disabled:opacity-40"
                  style={{ background: C.energy, color: C.bg }}
                >
                  Manger
                </button>
              </div>
            ))}
            {shown.length === 0 && (
              <div className="text-[12px]" style={{ color: C.faint }}>
                Aucune suggestion pour ce filtre.
              </div>
            )}
          </div>
        </>
      )}

      {/* Complément mono-ingrédient (chemin gate / sous-seuil) — étiqueté COMPLÉMENT,
          jamais « repas ». Couvre le restant protéique calculé depuis la biblio. */}
      {view.filler && (
        <div
          data-testid="suggestions-filler"
          className="mt-2.5 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] leading-snug"
          style={{ background: 'rgba(56,189,248,0.06)', border: `1px solid rgba(56,189,248,0.25)`, color: C.protein }}
        >
          <UtensilsCrossed size={14} className="shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Complément</span> — {view.filler.grams} g de {view.filler.ing.name} ≈{' '}
            {Math.round(view.filler.protein)} g de protéines restantes ({view.filler.kcal} kcal).
          </span>
        </div>
      )}

      {warning && (
        <div className="mt-2 text-[11.5px]" style={{ color: C.warn }}>
          {warning}
        </div>
      )}
    </div>
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
