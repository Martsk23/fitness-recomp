import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Trash2, Check, X, Pencil, UtensilsCrossed } from 'lucide-react'
import { C, num } from '../ui.js'
import {
  loadIngredients,
  addIngredient,
  updateIngredient,
  deleteIngredient,
  saveMeal,
  loadDayEntries,
  updateEntryGrams,
  deleteEntry,
  lineMacros,
  composeTotals,
  distinctCategories,
} from '../lib/nutrition.js'

const parseNum = (s) => Number(String(s).replace(',', '.').trim())
const GI_LABEL = { low: 'IG bas', mid: 'IG modéré', high: 'IG haut' }

export default function Bouffe() {
  const [view, setView] = useState('composer') // composer | biblio | journal
  const [ingredients, setIngredients] = useState(null)
  const [entries, setEntries] = useState([])

  async function reloadIngredients() {
    setIngredients(await loadIngredients())
  }
  async function reloadEntries() {
    setEntries(await loadDayEntries())
  }
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [ings, ents] = await Promise.all([loadIngredients(), loadDayEntries()])
      if (!alive) return
      setIngredients(ings)
      setEntries(ents)
    })()
    return () => {
      alive = false
    }
  }, [])

  if (ingredients === null) return null

  return (
    <div className="px-5 pb-4">
      {/* Sélecteur de sous-vue */}
      <div className="flex gap-1.5 mt-2 mb-4 p-1 rounded-xl" style={{ background: C.surface }}>
        <SubTab id="composer" label="Composer" view={view} set={setView} />
        <SubTab id="journal" label="Journal" view={view} set={setView} />
        <SubTab id="biblio" label="Bibliothèque" view={view} set={setView} />
      </div>

      {view === 'composer' && (
        <Composer
          ingredients={ingredients}
          onSaved={async () => {
            await reloadEntries()
            setView('journal')
          }}
        />
      )}
      {view === 'journal' && <Journal entries={entries} onChange={reloadEntries} />}
      {view === 'biblio' && <Library ingredients={ingredients} onChange={reloadIngredients} />}
    </div>
  )
}

function SubTab({ id, label, view, set }) {
  const active = view === id
  return (
    <button
      type="button"
      onClick={() => set(id)}
      className="flex-1 py-1.5 rounded-lg text-[12.5px] font-semibold active:scale-95 transition"
      style={{ background: active ? C.surfaceHi : 'transparent', color: active ? C.text : C.faint }}
    >
      {label}
    </button>
  )
}

// ── (b) Composer un plat par pesée ─────────────────────────────────
function Composer({ ingredients, onSaved }) {
  const [pickId, setPickId] = useState('')
  const [gramsStr, setGramsStr] = useState('')
  const [lines, setLines] = useState([]) // [{ ing, grams }]
  const cats = useMemo(() => distinctCategories(ingredients), [ingredients])

  function addLine() {
    const ing = ingredients.find((i) => i.id === pickId)
    const grams = parseNum(gramsStr)
    if (!ing || !Number.isFinite(grams) || grams <= 0) return
    setLines((l) => [...l, { ing, grams }])
    setGramsStr('')
    setPickId('')
  }
  function removeLine(i) {
    setLines((l) => l.filter((_, idx) => idx !== i))
  }

  const totals = composeTotals(lines)

  async function save() {
    if (!lines.length) return
    await saveMeal(lines)
    setLines([])
    await onSaved()
  }

  return (
    <div>
      {/* Ajout d'une ligne : ingrédient + grammes */}
      <div className="rounded-2xl p-3.5 border mb-3" style={{ background: C.surface, borderColor: C.line }}>
        <span className="block text-[11px] uppercase tracking-[0.14em] mb-2" style={{ color: C.faint }}>
          Ajouter un ingrédient
        </span>
        <select
          aria-label="Choisir un ingrédient"
          value={pickId}
          onChange={(e) => setPickId(e.target.value)}
          className="w-full rounded-xl px-3 py-2 text-[14px] outline-none border mb-2"
          style={{ background: C.bg, borderColor: C.line, color: pickId ? C.text : C.faint }}
        >
          <option value="">— choisir —</option>
          {cats.map((cat) => (
            <optgroup key={cat} label={cat}>
              {ingredients
                .filter((i) => i.category === cat)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <div className="flex items-end gap-2.5">
          <label className="flex-1">
            <span className="block text-[11px] uppercase tracking-[0.14em] mb-1" style={{ color: C.faint }}>
              Grammes
            </span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Grammes"
              placeholder="150"
              value={gramsStr}
              onChange={(e) => setGramsStr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLine()}
              className="w-full rounded-xl px-3 py-2 text-[15px] outline-none border"
              style={{ background: C.bg, borderColor: C.line, color: C.text, ...num }}
            />
          </label>
          <button
            type="button"
            onClick={addLine}
            aria-label="Ajouter au plat"
            className="rounded-xl px-3.5 py-2 text-[14px] font-semibold active:scale-95 transition flex items-center gap-1"
            style={{ background: C.surfaceHi, color: C.text }}
          >
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </div>

      {/* Lignes du plat + totaux live */}
      {lines.length === 0 ? (
        <EmptyHint icon={UtensilsCrossed} text="Empile des ingrédients pesés — le total se calcule tout seul." />
      ) : (
        <>
          <div className="space-y-2 mb-3">
            {lines.map((l, i) => {
              const m = lineMacros(l.ing, l.grams)
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-3.5 py-2.5 border"
                  style={{ background: C.surface, borderColor: C.line }}
                >
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium truncate" style={{ color: C.text }}>
                      {l.ing.name}
                    </div>
                    <div className="text-[11.5px]" style={{ color: C.faint, ...num }}>
                      {l.grams} g · {m.kcal} kcal · P {m.protein} / G {m.carb} / L {m.fat}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    aria-label={`Retirer ${l.ing.name}`}
                    className="p-1.5 active:scale-90 transition shrink-0"
                    style={{ color: C.faint }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })}
          </div>

          <MacroTotals totals={totals} />

          <button
            type="button"
            onClick={save}
            className="mt-3 w-full rounded-xl py-2.5 text-[14px] font-semibold active:scale-95 transition"
            style={{ background: C.energy, color: C.bg }}
          >
            Enregistrer le repas
          </button>
        </>
      )}
    </div>
  )
}

function MacroTotals({ totals }) {
  return (
    <div className="rounded-2xl p-3.5 border" style={{ background: C.surface, borderColor: C.line }}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
          Total du plat
        </span>
        <span className="text-[20px] font-black" style={{ color: C.text, ...num }}>
          <span data-testid="meal-total-kcal">{totals.kcal}</span>
          <span className="text-[12px] font-semibold" style={{ color: C.muted }}>
            {' '}
            kcal
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3 text-[12px]" style={{ color: C.muted, ...num }}>
        <span>
          <span style={{ color: C.protein }}>P</span> {totals.protein}
        </span>
        <span>
          <span style={{ color: C.carb }}>G</span> {totals.carb}
        </span>
        <span>
          <span style={{ color: C.fat }}>L</span> {totals.fat}
        </span>
        <span style={{ color: C.faint }}>· sucres {totals.sugarsSimple}</span>
      </div>
    </div>
  )
}

// ── (c) Journal du jour : édition (regrammage) / suppression ───────
function Journal({ entries, onChange }) {
  if (!entries.length) {
    return <EmptyHint icon={UtensilsCrossed} text="Aucun repas enregistré aujourd'hui." />
  }
  const dayKcal = entries.reduce((a, e) => a + (e.kcal || 0), 0)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
          Repas du jour
        </span>
        <span className="text-[13px] font-semibold" style={{ color: C.text, ...num }}>
          {Math.round(dayKcal)} kcal
        </span>
      </div>
      <div className="space-y-2">
        {entries.map((e) => (
          <JournalRow key={e.id} entry={e} onChange={onChange} />
        ))}
      </div>
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

// ── (a) Bibliothèque d'ingrédients : recherche + filtre + CRUD ─────
function Library({ ingredients, onChange }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)

  const cats = useMemo(() => distinctCategories(ingredients), [ingredients])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return ingredients.filter(
      (i) => (cat === 'all' || i.category === cat) && (!needle || i.name.toLowerCase().includes(needle)),
    )
  }, [ingredients, q, cat])

  return (
    <div>
      {/* Recherche */}
      <div className="flex items-center gap-2 rounded-xl px-3 py-2 border mb-2.5" style={{ background: C.surface, borderColor: C.line }}>
        <Search size={15} style={{ color: C.faint }} />
        <input
          type="text"
          aria-label="Rechercher un ingrédient"
          placeholder="Rechercher…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 bg-transparent outline-none text-[14px]"
          style={{ color: C.text }}
        />
      </div>

      {/* Filtres catégorie (dynamiques) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
        <CatChip id="all" label="Tous" cat={cat} set={setCat} />
        {cats.map((c) => (
          <CatChip key={c} id={c} label={c} cat={cat} set={setCat} />
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setAdding((v) => !v)
          setEditId(null)
        }}
        className="w-full mb-3 rounded-xl py-2 text-[13px] font-semibold active:scale-95 transition flex items-center justify-center gap-1.5"
        style={{ background: adding ? C.surfaceHi : C.surface, color: adding ? C.text : C.energy, border: `1px solid ${C.line}` }}
      >
        <Plus size={15} /> {adding ? 'Fermer' : 'Ajouter un ingrédient'}
      </button>

      {adding && (
        <IngredientForm
          cats={cats}
          onCancel={() => setAdding(false)}
          onSubmit={async (data) => {
            await addIngredient(data)
            setAdding(false)
            await onChange()
          }}
        />
      )}

      {/* Liste */}
      <div className="space-y-2">
        {filtered.map((i) =>
          editId === i.id ? (
            <IngredientForm
              key={i.id}
              cats={cats}
              initial={i}
              onCancel={() => setEditId(null)}
              onSubmit={async (data) => {
                await updateIngredient(i.id, data)
                setEditId(null)
                await onChange()
              }}
            />
          ) : (
            <div
              key={i.id}
              className="flex items-center justify-between rounded-xl px-3.5 py-2.5 border"
              style={{ background: C.surface, borderColor: C.line }}
            >
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium truncate" style={{ color: C.text }}>
                  {i.name}
                </div>
                <div className="text-[11.5px]" style={{ color: C.faint, ...num }}>
                  {i.kcal100} kcal · P {i.protein100} / G {i.carb100} / L {i.fat100} · {GI_LABEL[i.gi]}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditId(i.id)
                    setAdding(false)
                  }}
                  aria-label={`Modifier ${i.name}`}
                  className="p-1.5 active:scale-90"
                  style={{ color: C.faint }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteIngredient(i.id)
                    await onChange()
                  }}
                  aria-label={`Supprimer ${i.name}`}
                  className="p-1.5 active:scale-90"
                  style={{ color: C.faint }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ),
        )}
        {filtered.length === 0 && <EmptyHint icon={Search} text="Aucun ingrédient ne correspond." />}
      </div>
    </div>
  )
}

function CatChip({ id, label, cat, set }) {
  const active = cat === id
  return (
    <button
      type="button"
      onClick={() => set(id)}
      className="shrink-0 px-3 py-1 rounded-full text-[12px] font-medium active:scale-95 transition"
      style={{
        background: active ? 'rgba(190,242,100,0.12)' : C.surface,
        color: active ? C.energy : C.muted,
        border: `1px solid ${active ? 'rgba(190,242,100,0.3)' : C.line}`,
      }}
    >
      {label}
    </button>
  )
}

const EMPTY_FORM = { name: '', category: '', kcal100: '', protein100: '', carb100: '', sugarsSimple100: '', fat100: '', gi: 'low' }

function IngredientForm({ cats, initial, onSubmit, onCancel }) {
  const [f, setF] = useState(() =>
    initial
      ? {
          name: initial.name,
          category: initial.category,
          kcal100: String(initial.kcal100),
          protein100: String(initial.protein100),
          carb100: String(initial.carb100),
          sugarsSimple100: String(initial.sugarsSimple100),
          fat100: String(initial.fat100),
          gi: initial.gi,
        }
      : EMPTY_FORM,
  )
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  // Liste de catégories proposées : connues + déjà présentes (l'utilisateur peut en saisir une libre).
  const catOptions = useMemo(() => {
    const known = ['féculents', 'protéines', 'légumes', 'matières grasses', 'fruits', 'laitages', 'aromates']
    return [...new Set([...known, ...cats])]
  }, [cats])

  async function submit() {
    setError('')
    try {
      await onSubmit({
        ...f,
        kcal100: parseNum(f.kcal100),
        protein100: parseNum(f.protein100),
        carb100: parseNum(f.carb100),
        sugarsSimple100: parseNum(f.sugarsSimple100),
        fat100: parseNum(f.fat100),
      })
    } catch (err) {
      setError(err.message || 'Saisie invalide.')
    }
  }

  return (
    <div className="rounded-2xl p-3.5 border mb-3" style={{ background: C.surfaceHi, borderColor: C.line }}>
      <input
        type="text"
        aria-label="Nom de l'ingrédient"
        placeholder="Nom"
        value={f.name}
        onChange={set('name')}
        className="w-full rounded-xl px-3 py-2 text-[14px] outline-none border mb-2"
        style={{ background: C.bg, borderColor: C.line, color: C.text }}
      />
      <div className="flex gap-2 mb-2">
        <select
          aria-label="Catégorie"
          value={f.category}
          onChange={set('category')}
          className="flex-1 rounded-xl px-3 py-2 text-[13px] outline-none border"
          style={{ background: C.bg, borderColor: C.line, color: f.category ? C.text : C.faint }}
        >
          <option value="">Catégorie…</option>
          {catOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Index glycémique"
          value={f.gi}
          onChange={set('gi')}
          className="rounded-xl px-3 py-2 text-[13px] outline-none border"
          style={{ background: C.bg, borderColor: C.line, color: C.text }}
        >
          <option value="low">IG bas</option>
          <option value="mid">IG modéré</option>
          <option value="high">IG haut</option>
        </select>
      </div>
      <div className="grid grid-cols-5 gap-1.5 mb-2">
        <NumField label="kcal" v={f.kcal100} on={set('kcal100')} />
        <NumField label="P" v={f.protein100} on={set('protein100')} />
        <NumField label="G" v={f.carb100} on={set('carb100')} />
        <NumField label="sucr." v={f.sugarsSimple100} on={set('sugarsSimple100')} />
        <NumField label="L" v={f.fat100} on={set('fat100')} />
      </div>
      <div className="text-[10.5px] mb-2" style={{ color: C.faint }}>
        Valeurs pour 100 g · sucres simples ⊂ glucides
      </div>
      {error && (
        <div className="text-[12px] mb-2" style={{ color: C.warn }}>
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          className="flex-1 rounded-xl py-2 text-[13px] font-semibold active:scale-95 transition"
          style={{ background: C.energy, color: C.bg }}
        >
          {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2 text-[13px] font-semibold active:scale-95 transition"
          style={{ background: C.surface, color: C.muted, border: `1px solid ${C.line}` }}
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

function NumField({ label, v, on }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide mb-0.5 text-center" style={{ color: C.faint }}>
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`Valeur ${label} pour 100 g`}
        value={v}
        onChange={on}
        className="w-full rounded-lg px-1.5 py-1.5 text-[13px] text-center outline-none border tabular-nums"
        style={{ background: C.bg, borderColor: C.line, color: C.text }}
      />
    </label>
  )
}

function EmptyHint({ icon: Icon, text }) {
  return (
    <div className="py-12 text-center" style={{ color: C.faint }}>
      <Icon size={22} className="mx-auto mb-2" />
      <div className="text-[12.5px]" style={{ color: C.muted }}>
        {text}
      </div>
    </div>
  )
}
