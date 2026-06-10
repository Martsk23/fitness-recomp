import { useEffect, useRef, useState } from 'react'
import { Dumbbell, Upload, AlertTriangle, ChevronDown, ChevronRight, Activity } from 'lucide-react'
import { C, num } from '../ui.js'
import {
  importStrongText,
  loadWorkouts,
  loadSetsForWorkout,
  StrongImportError,
  classifyModality,
} from '../lib/strongImport.js'

// ── Écran Perf (Phase 2, D22) ──────────────────────────────────────
// Import CSV Strong (PapaParse) + log consultable des séances. PÉRIMÈTRE v1 :
// import idempotent + lecture. AUCUNE analyse de perf (point 7) ni estimation
// calorique. Le parsing/dédup vit dans src/lib/strongImport.js (pur + testé).
export default function Perf() {
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
      // Erreur typée (format/vide) → message clair ; sinon message générique.
      setError(err instanceof StrongImportError ? err.message : `Import impossible : ${err.message}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = '' // ré-import du même fichier possible
    }
  }

  return (
    <div className="px-5 pb-4">
      <div className="flex items-center gap-2 mt-2 mb-4" style={{ color: C.text }}>
        <Dumbbell size={18} style={{ color: C.energy }} />
        <span className="text-[15px] font-semibold">Performances</span>
      </div>

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
    </div>
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
