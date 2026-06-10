import { useEffect, useRef, useState } from 'react'
import {
  Dumbbell, Upload, AlertTriangle, ChevronDown, ChevronRight, Activity,
  TrendingUp, TrendingDown, Minus, Trophy, Flame, Shuffle,
} from 'lucide-react'
import { C, num } from '../ui.js'
import { db } from '../db.js'
import {
  importStrongText,
  loadWorkouts,
  loadSetsForWorkout,
  StrongImportError,
  classifyModality,
} from '../lib/strongImport.js'
import { analyzeAll, EPLEY_REP_CAP, MIN_SESSIONS } from '../lib/perf.js'
import { variantsFor } from '../data/exerciseVariants.js'

// ── Écran Perf (Phase 2 : D22 import + D23 analyse) ────────────────
// Deux vues via segmented control : « Synthèse » (analyse de perf dérivée des
// sets, D23) et « Import » (CSV Strong + log consultable, D22 — INTACT).
// Toute la logique d'analyse vit dans src/lib/perf.js (pur + testé sur fixture).
export default function Perf() {
  const [view, setView] = useState('synthese')

  return (
    <div className="px-5 pb-4">
      <div className="flex items-center gap-2 mt-2 mb-3" style={{ color: C.text }}>
        <Dumbbell size={18} style={{ color: C.energy }} />
        <span className="text-[15px] font-semibold">Performances</span>
      </div>

      {/* Segmented control Synthèse | Import */}
      <div className="flex p-0.5 rounded-xl mb-4" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
        {[['synthese', 'Synthèse'], ['import', 'Import']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className="flex-1 text-[13px] font-semibold py-1.5 rounded-[10px] transition"
            style={view === id ? { background: C.energy, color: C.bg } : { color: C.muted }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'synthese' ? <SyntheseView /> : <ImportView />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// VUE SYNTHÈSE — analyse de perf (D23)
// ════════════════════════════════════════════════════════════════════
function SyntheseView() {
  const [analysis, setAnalysis] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const sets = await db.sets.toArray()
      if (alive) setAnalysis(analyzeAll(sets))
    })()
    return () => {
      alive = false
    }
  }, [])

  if (analysis == null) return null
  const { tracked, insufficient, cardio } = analysis

  if (!tracked.length && !insufficient.length) {
    return (
      <div className="rounded-2xl p-3.5 border text-[12.5px]" style={{ background: C.surface, borderColor: C.line, color: C.muted }}>
        Aucune séance à analyser. Importe ton export Strong dans l'onglet « Import ».
      </div>
    )
  }

  return (
    <>
      <div className="text-[11px] uppercase tracking-[0.14em] mb-2 px-0.5" style={{ color: C.faint }}>
        Suivis ({tracked.length})
      </div>
      {tracked.length === 0 ? (
        <div className="rounded-2xl p-3.5 border text-[12.5px]" style={{ background: C.surface, borderColor: C.line, color: C.muted }}>
          Aucun exercice avec assez de séances ({MIN_SESSIONS}+) pour un verdict fiable.
        </div>
      ) : (
        <div className="space-y-2">
          {tracked.map((ex) => (
            <ExerciseCard key={ex.exercise} ex={ex} />
          ))}
        </div>
      )}

      {insufficient.length > 0 && <InsufficientSection items={insufficient} />}
      {cardio.length > 0 && (
        <p className="mt-3 px-0.5 text-[11.5px] leading-relaxed" style={{ color: C.faint }}>
          <Activity size={11} className="inline -mt-0.5 mr-1" style={{ color: C.carb }} />
          {cardio.length} exercice{cardio.length > 1 ? 's' : ''} cardio exclu{cardio.length > 1 ? 's' : ''} de l'analyse de force (suivi cardio hors v1).
        </p>
      )}
    </>
  )
}

// Mapping verdict → présentation (icône / couleur / libellé).
const VERDICTS = {
  up: { Icon: TrendingUp, color: C.energy, label: 'Progresse' },
  flat: { Icon: Minus, color: C.carb, label: 'Stagne' },
  down: { Icon: TrendingDown, color: C.warn, label: 'Régresse' },
}

function formatValue(metric, value) {
  if (metric === 'e1rm') return `${Math.round(value)} kg`
  return `${Math.round(value).toLocaleString('fr-FR')}` // volume
}
const metricLabel = (m) => (m === 'e1rm' ? 'e1RM' : 'volume')

// ── Carte exercice (verdict + valeur + PR + détail repliable) ──────
function ExerciseCard({ ex }) {
  const [open, setOpen] = useState(false)
  const v = ex.verdict ? VERDICTS[ex.verdict] : null
  const variants = variantsFor(ex.exercise)

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: C.surface, borderColor: C.line }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Détail analyse ${ex.exercise}`}
        className="w-full flex items-center justify-between px-3.5 py-3 active:opacity-80 transition"
      >
        <span className="flex items-center gap-2 text-left min-w-0">
          {open ? <ChevronDown size={15} style={{ color: C.faint }} className="shrink-0" /> : <ChevronRight size={15} style={{ color: C.faint }} className="shrink-0" />}
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold truncate" style={{ color: C.text }}>
              {ex.exercise}
            </span>
            <span className="block text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: C.faint }}>
              <span style={num}>{formatValue(ex.metric, ex.current)}</span>
              <span className="px-1.5 py-px rounded" style={{ background: C.surfaceHi }}>
                {ex.assisted ? 'e1RM assist.' : metricLabel(ex.metric)}
              </span>
              {ex.assisted && (
                <span className="px-1.5 py-px rounded" style={{ background: C.surfaceHi, color: C.carb }}>
                  assisté — charge = assistance
                </span>
              )}
              {ex.pr?.isRecentPR && (
                <span className="flex items-center gap-0.5" style={{ color: C.energy }}>
                  <Trophy size={10} /> PR
                </span>
              )}
            </span>
          </span>
        </span>
        {v && (
          <span className="flex items-center gap-1 text-[11.5px] font-semibold shrink-0 ml-2" style={{ color: v.color }}>
            <v.Icon size={14} /> {v.label}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 pt-0.5 border-t space-y-3" style={{ borderColor: C.line }}>
          {ex.assisted && (
            <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: C.carb }}>
              Exercice assisté : la valeur est la charge d'<b>assistance</b> — moins = plus fort. La lecture du verdict est inversée.
            </p>
          )}
          {/* Sparkline par séance */}
          <div className={ex.assisted ? '' : 'mt-2.5'}>
            <div className="text-[11px] mb-1.5" style={{ color: C.faint }}>
              {metricLabel(ex.metric)} par séance ({ex.series.length}){ex.assisted ? ' · assistance (↓ = mieux)' : ''}
            </div>
            <Sparkline series={ex.series} color={v?.color || C.muted} />
          </div>

          {/* Historique compact */}
          <div className="flex flex-wrap gap-1.5">
            {ex.series.map((p) => (
              <span key={p.date} className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: C.surfaceHi, color: C.faint, ...num }}>
                {p.date.slice(5)} · {formatValue(ex.metric, p.value)}
              </span>
            ))}
          </div>

          {/* Records */}
          {ex.pr && (
            <div className="text-[11.5px] flex items-center gap-1.5 flex-wrap" style={{ color: C.muted }}>
              <Trophy size={12} style={{ color: C.energy }} />
              {ex.assisted ? 'Assistance min : ' : 'Record : '}
              <span style={num}>{formatValue(ex.metric, ex.pr.best)}</span>
              {ex.pr.loadExtreme > 0 && (
                <span style={{ color: C.faint }}>
                  {' · '}{ex.assisted ? 'assistance min' : 'charge max'} <span style={num}>{ex.pr.loadExtreme} kg</span>
                </span>
              )}
            </div>
          )}

          {/* Échauffement calculé */}
          <div>
            <div className="text-[11px] mb-1 flex items-center gap-1" style={{ color: C.faint }}>
              <Flame size={11} style={{ color: C.carb }} /> Échauffement{ex.assisted ? '' : ` (sur ${ex.topWeight} kg)`}
            </div>
            {ex.assisted ? (
              <span className="text-[11.5px]" style={{ color: C.faint }}>Sans objet pour un exercice assisté.</span>
            ) : ex.warmup.length ? (
              <div className="flex flex-wrap gap-1.5">
                {ex.warmup.map((s, i) => (
                  <span key={i} className="text-[11.5px] px-2 py-0.5 rounded-md" style={{ background: C.surfaceHi, color: C.text, ...num }}>
                    {s.weight} kg × {s.reps}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[11.5px]" style={{ color: C.faint }}>Charge trop légère pour un échauffement calculé.</span>
            )}
          </div>

          {/* Variantes anti-plateau */}
          {variants.length > 0 && (
            <div>
              <div className="text-[11px] mb-1 flex items-center gap-1" style={{ color: C.faint }}>
                <Shuffle size={11} style={{ color: C.protein }} /> Variantes anti-plateau
              </div>
              <div className="flex flex-wrap gap-1.5">
                {variants.map((name) => (
                  <span key={name} className="text-[11.5px] px-2 py-0.5 rounded-md" style={{ background: C.surfaceHi, color: C.muted }}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sparkline SVG inline (zéro dépendance, ne grossit pas le bundle) ─
function Sparkline({ series, color }) {
  const W = 240
  const H = 44
  const pad = 4
  const vals = series.map((p) => p.value)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = hi - lo || 1
  const n = vals.length
  const x = (i) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1))
  const y = (v) => H - pad - ((v - lo) / span) * (H - 2 * pad)
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none" aria-hidden="true">
      {n > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
      {vals.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === n - 1 ? 2.6 : 1.6} fill={color} />
      ))}
    </svg>
  )
}

// ── Section « Données insuffisantes » (repliée, jamais masquée) ─────
function InsufficientSection({ items }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] px-0.5 py-1"
        style={{ color: C.faint }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Données insuffisantes ({items.length})
      </button>
      {open && (
        <div className="mt-1.5 rounded-2xl border p-3 text-[12px] leading-relaxed" style={{ background: C.surface, borderColor: C.line, color: C.muted }}>
          <p className="mb-2 text-[11.5px]" style={{ color: C.faint }}>
            Moins de {MIN_SESSIONS} séances exploitables (séries ≤ {EPLEY_REP_CAP} reps) — aucun verdict, jamais extrapolé sur 2 points.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((ex) => (
              <span key={ex.exercise} className="px-2 py-0.5 rounded-md text-[11.5px]" style={{ background: C.surfaceHi, color: C.faint }}>
                {ex.exercise} <span style={num}>({ex.sessionCount})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// VUE IMPORT — CSV Strong + log consultable (D22, INTACT)
// ════════════════════════════════════════════════════════════════════
function ImportView() {
  const fileRef = useRef(null)
  const [workouts, setWorkouts] = useState(null)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setWorkouts(await loadWorkouts())
  }
  useEffect(() => {
    let alive = true
    ;(async () => {
      const w = await loadWorkouts()
      if (alive) setWorkouts(w)
    })()
    return () => {
      alive = false
    }
  }, [])

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const text = await file.text()
      const res = await importStrongText(text) // valide les en-têtes AVANT tout write
      setReport(res)
      await refresh()
    } catch (err) {
      setError(err instanceof StrongImportError ? err.message : `Import impossible : ${err.message}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = '' // ré-import du même fichier possible
    }
  }

  return (
    <>
      {/* Import CSV Strong */}
      <div className="rounded-2xl p-3.5 border" style={{ background: C.surface, borderColor: C.line }}>
        <div className="text-[11px] uppercase tracking-[0.14em] mb-2" style={{ color: C.faint }}>
          Import Strong
        </div>
        <p className="text-[12.5px] leading-relaxed mb-3" style={{ color: C.muted }}>
          Importe l'export CSV de Strong (Réglages → Exporter les données). Ré-importer le même
          fichier ne crée jamais de doublon.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="Importer un fichier CSV Strong"
          onChange={onFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-2 text-[13px] font-semibold px-3.5 py-2 rounded-xl active:scale-95 transition disabled:opacity-50"
          style={{ background: C.energy, color: C.bg }}
        >
          <Upload size={15} /> {busy ? 'Import en cours…' : 'Importer un CSV Strong'}
        </button>

        {error && (
          <div
            data-testid="import-error"
            className="mt-3 flex items-start gap-1.5 text-[12px] leading-snug"
            style={{ color: C.warn }}
          >
            <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {report && <ImportReport report={report} />}
      </div>

      {/* Log consultable des séances */}
      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-[0.14em] mb-2 px-0.5" style={{ color: C.faint }}>
          Séances ({workouts?.length ?? 0})
        </div>
        {workouts == null ? null : workouts.length === 0 ? (
          <div className="rounded-2xl p-3.5 border text-[12.5px]" style={{ background: C.surface, borderColor: C.line, color: C.muted }}>
            Aucune séance. Importe ton export Strong ci-dessus.
          </div>
        ) : (
          <div className="space-y-2">
            {workouts.map((w) => (
              <WorkoutRow key={w.id} workout={w} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Rapport d'import (séances/sets ajoutés, ignorés par libellé) ────
function ImportReport({ report }) {
  const ignoredEntries = Object.entries(report.ignored || {})
  return (
    <div
      data-testid="import-report"
      className="mt-3 pt-3 border-t text-[12.5px] leading-relaxed"
      style={{ borderColor: C.line, color: C.muted }}
    >
      <div style={{ color: C.energy, fontWeight: 600 }}>Import terminé.</div>
      <ul className="mt-1.5 space-y-0.5">
        <li>
          <Stat n={report.added} /> séance{report.added > 1 ? 's' : ''} ajoutée{report.added > 1 ? 's' : ''}
          {report.skipped > 0 && (
            <>
              {' · '}
              <Stat n={report.skipped} /> déjà importée{report.skipped > 1 ? 's' : ''} (ignorée{report.skipped > 1 ? 's' : ''})
            </>
          )}
        </li>
        <li>
          <Stat n={report.setsAdded} /> série{report.setsAdded > 1 ? 's' : ''} enregistrée{report.setsAdded > 1 ? 's' : ''}
          {report.cardioSets > 0 && (
            <>
              {' · dont '}
              <Stat n={report.cardioSets} /> cardio
            </>
          )}
        </li>
        {ignoredEntries.map(([label, n]) => (
          <li key={label} style={{ color: C.faint }}>
            <Stat n={n} /> ligne{n > 1 ? 's' : ''} ignorée{n > 1 ? 's' : ''} : « {label} »
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ n }) {
  return (
    <span style={num} className="font-semibold" data-testid="report-stat">
      {n}
    </span>
  )
}

// ── Ligne séance (repliable → détail exos/séries) ──────────────────
function WorkoutRow({ workout }) {
  const [open, setOpen] = useState(false)
  const [sets, setSets] = useState(null)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && sets == null) setSets(await loadSetsForWorkout(workout.id))
  }

  // Groupe les séries par exercice (ordre d'apparition).
  const groups = []
  if (sets) {
    const byEx = new Map()
    for (const s of sets) {
      if (!byEx.has(s.exercise)) {
        byEx.set(s.exercise, [])
        groups.push({ exercise: s.exercise, sets: byEx.get(s.exercise) })
      }
      byEx.get(s.exercise).push(s)
    }
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: C.surface, borderColor: C.line }}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`Détail séance ${workout.name} ${workout.date}`}
        className="w-full flex items-center justify-between px-3.5 py-3 active:opacity-80 transition"
      >
        <span className="flex items-center gap-2 text-left">
          {open ? <ChevronDown size={15} style={{ color: C.faint }} /> : <ChevronRight size={15} style={{ color: C.faint }} />}
          <span>
            <span className="block text-[13px] font-semibold" style={{ color: C.text }}>
              {workout.name || 'Séance'}
            </span>
            <span className="block text-[11.5px]" style={{ color: C.faint }}>
              <span style={num}>{workout.date}</span>
              {workout.durationRaw ? ` · ${workout.durationRaw}` : ''}
            </span>
          </span>
        </span>
      </button>

      {open && sets && (
        <div className="px-3.5 pb-3 pt-0.5 border-t" style={{ borderColor: C.line }}>
          {groups.map((g) => (
            <div key={g.exercise} className="mt-2.5">
              <div className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: C.muted }}>
                {classifyModality(g.exercise) === 'cardio' && <Activity size={12} style={{ color: C.carb }} />}
                {g.exercise}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {g.sets.map((s, i) => (
                  <span
                    key={i}
                    className="text-[11.5px] px-2 py-0.5 rounded-md"
                    style={{ background: C.surfaceHi, color: C.faint, ...num }}
                  >
                    {formatSet(s)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Affichage d'une série : cardio = distance/durée brutes ; muscu = poids × reps.
function formatSet(s) {
  if (classifyModality(s.exercise) === 'cardio') {
    const parts = []
    if (s.distance) parts.push(`${s.distance} dist`)
    if (s.seconds) parts.push(`${s.seconds} s`)
    return parts.length ? parts.join(' · ') : '—'
  }
  const w = s.weightKg ? `${s.weightKg} kg` : 'PDC'
  return `${w} × ${s.reps}`
}
