import { useEffect, useState } from 'react'
import { Trash2, Check, X, Pencil, UtensilsCrossed } from 'lucide-react'
import { C, num } from '../ui.js'
import { loadDayEntries, updateEntryGrams, deleteEntry } from '../lib/nutrition.js'

// ── Journal du jour (écran promu en nav principale, D26) ───────────
// Ex-sous-onglet de Bouffe. Liste les entrées du jour (ingrédients ET boissons,
// D2/D25) avec regrammage / suppression. Monté/démonté au changement d'onglet →
// se recharge à chaque ouverture (toute compo/boisson loguée ailleurs est à jour).
// La cible du lien « X mangé » du Jour (D26, point B).

const parseNum = (s) => Number(String(s).replace(',', '.').trim())

export default function Journal() {
  const [entries, setEntries] = useState(null)

  async function reload() {
    setEntries(await loadDayEntries())
  }
  useEffect(() => {
    let alive = true
    ;(async () => {
      const ents = await loadDayEntries()
      if (alive) setEntries(ents)
    })()
    return () => {
      alive = false
    }
  }, [])

  if (entries === null) return null

  return (
    <div className="px-5 pb-4 pt-2">
      {entries.length === 0 ? (
        <div className="py-16 text-center" style={{ color: C.faint }}>
          <UtensilsCrossed size={22} className="mx-auto mb-2" />
          <div className="text-[12.5px]" style={{ color: C.muted }}>
            Aucun repas enregistré aujourd'hui.
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
              Repas du jour
            </span>
            <span className="text-[13px] font-semibold" style={{ color: C.text, ...num }}>
              {Math.round(entries.reduce((a, e) => a + (e.kcal || 0), 0))} kcal
            </span>
          </div>
          <div className="space-y-2">
            {entries.map((e) => (
              <JournalRow key={e.id} entry={e} onChange={reload} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function JournalRow({ entry, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  async function save() {
    const g = parseNum(draft)
    if (!Number.isFinite(g) || g <= 0) return
    await updateEntryGrams(entry.id, g)
    setEditing(false)
    await onChange()
  }
  async function remove() {
    await deleteEntry(entry.id)
    await onChange()
  }

  return (
    <div className="rounded-xl px-3.5 py-2.5 border" style={{ background: C.surface, borderColor: C.line }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium truncate" style={{ color: C.text }}>
            {entry.nameSnapshot}
          </div>
          <div className="text-[11.5px]" style={{ color: C.faint, ...num }}>
            {entry.grams} g · {entry.kcal} kcal · P {entry.protein} / G {entry.carb} / L {entry.fat}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <input
                inputMode="decimal"
                aria-label={`Nouveau grammage ${entry.nameSnapshot}`}
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
                onKeyDown={(ev) => ev.key === 'Enter' && save()}
                placeholder="g"
                className="w-16 text-right rounded-lg px-2 py-1 text-[13px] border tabular-nums"
                style={{ background: C.surfaceHi, borderColor: C.line, color: C.text }}
              />
              <button type="button" onClick={save} aria-label="Valider le grammage" className="p-1.5 active:scale-90" style={{ color: C.energy }}>
                <Check size={16} />
              </button>
              <button type="button" onClick={() => setEditing(false)} aria-label="Annuler" className="p-1.5 active:scale-90" style={{ color: C.faint }}>
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(true)
                  setDraft(String(entry.grams))
                }}
                aria-label={`Modifier ${entry.nameSnapshot}`}
                className="p-1.5 active:scale-90"
                style={{ color: C.faint }}
              >
                <Pencil size={15} />
              </button>
              <button type="button" onClick={remove} aria-label={`Supprimer ${entry.nameSnapshot}`} className="p-1.5 active:scale-90" style={{ color: C.faint }}>
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
