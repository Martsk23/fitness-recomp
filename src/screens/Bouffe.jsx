import { useEffect, useMemo, useState } from 'react'
import { Plus, Minus, Search, Trash2, Check, X, Pencil, UtensilsCrossed, RotateCcw, AlertTriangle, BookMarked, Wine } from 'lucide-react'
import { C, num } from '../ui.js'
import {
  loadIngredients,
  addIngredient,
  updateIngredient,
  deleteIngredient,
  saveMeal,
  lineMacros,
  composeTotals,
  distinctCategories,
  filterIngredients,
  loadRecipes,
  saveRecipe,
  renameRecipe,
  deleteRecipe,
  applyRecipe,
} from '../lib/nutrition.js'
import { loadDrinks, logDrink, addDrink, updateDrink, deleteDrink } from '../lib/drinks.js'

const parseNum = (s) => Number(String(s).replace(',', '.').trim())
const GI_LABEL = { low: 'IG bas', mid: 'IG modéré', high: 'IG haut' }

export default function Bouffe({ onNavigate }) {
  // Journal promu en onglet nav principal (D26) → Bouffe ne possède plus le journal
  // du jour ni son chargement : composer/recettes/boissons écrivent dans
  // journalEntries, l'écran Journal (monté à l'ouverture de l'onglet) les relit.
  const [view, setView] = useState('composer') // composer | biblio | recettes | boissons
  const [ingredients, setIngredients] = useState(null)
  const [recipes, setRecipes] = useState([])
  const [drinks, setDrinks] = useState([])

  async function reloadIngredients() {
    setIngredients(await loadIngredients())
  }
  async function reloadRecipes() {
    setRecipes(await loadRecipes())
  }
  async function reloadDrinks() {
    setDrinks(await loadDrinks())
  }
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [ings, recs, drks] = await Promise.all([loadIngredients(), loadRecipes(), loadDrinks()])
      if (!alive) return
      setIngredients(ings)
      setRecipes(recs)
      setDrinks(drks)
    })()
    return () => {
      alive = false
    }
  }, [])

  if (ingredients === null) return null

  return (
    <div className="px-5 pb-4">
      {/* Sélecteur de sous-vue (4 onglets : Journal promu en nav principale, D26) */}
      <div className="flex gap-1 mt-2 mb-4 p-1 rounded-xl" style={{ background: C.surface }}>
        <SubTab id="composer" label="Composer" view={view} set={setView} />
        <SubTab id="biblio" label="Bibliothèque" view={view} set={setView} />
        <SubTab id="recettes" label="Recettes" view={view} set={setView} />
        <SubTab id="boissons" label="Boissons" view={view} set={setView} />
      </div>

      {view === 'composer' && (
        // Enregistrer un repas → on va le voir dans l'onglet Journal (promu nav, D26).
        <Composer ingredients={ingredients} onSaved={() => onNavigate?.('journal')} onRecipeSaved={reloadRecipes} />
      )}
      {view === 'biblio' && <Library ingredients={ingredients} onChange={reloadIngredients} />}
      {view === 'recettes' && (
        // Rappeler ne navigue PAS : on reste sur Recettes pour garder le bandeau de
        // retour (succès / avertissement lignes mortes) visible. Le journal du jour
        // (onglet séparé) relit journalEntries à sa prochaine ouverture.
        <Recipes recipes={recipes} onChange={reloadRecipes} />
      )}
      {view === 'boissons' && <Drinks drinks={drinks} onChange={reloadDrinks} />}
    </div>
  )
}

function SubTab({ id, label, view, set }) {
  const active = view === id
  return (
    <button
      type="button"
      onClick={() => set(id)}
      className="flex-1 px-0.5 py-1.5 rounded-lg text-[11px] font-semibold active:scale-95 transition whitespace-nowrap"
      style={{ background: active ? C.surfaceHi : 'transparent', color: active ? C.text : C.faint }}
    >
      {label}
    </button>
  )
}

// ── (b) Composer un plat par pesée ─────────────────────────────────
function Composer({ ingredients, onSaved, onRecipeSaved }) {
  const [pickId, setPickId] = useState('')
  const [pickQuery, setPickQuery] = useState('') // filtre texte au-dessus du picker
  const [gramsStr, setGramsStr] = useState('')
  const [lines, setLines] = useState([]) // [{ ing, grams }]
  const [recipeName, setRecipeName] = useState(null) // null = formulaire fermé
  const [recipeNote, setRecipeNote] = useState('')
  // Filtre vide ⇒ liste complète (les 58) → le <select> reste identique à avant.
  const shown = useMemo(() => filterIngredients(ingredients, { q: pickQuery }), [ingredients, pickQuery])
  const cats = useMemo(() => distinctCategories(shown), [shown])
  // Sélection EFFECTIVE : si l'ingrédient choisi sort du set filtré, on retombe sur
  // « rien » (évite une <option> orpheline pointée par la valeur du select). Dérivé,
  // pas de state miroir : le filtre ne peut pas laisser une sélection fantôme.
  const effectivePick = shown.some((i) => i.id === pickId) ? pickId : ''

  function addLine() {
    const ing = ingredients.find((i) => i.id === effectivePick)
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

  // Enregistre la compo COURANTE comme recette réutilisable. Les lignes RESTENT
  // en place (action annexe — on peut vouloir aussi loguer ces lignes aujourd'hui).
  async function saveAsRecipe() {
    const name = String(recipeName || '').trim()
    if (!name || !lines.length) return
    await saveRecipe(name, lines)
    setRecipeName(null)
    setRecipeNote(`Recette « ${name} » enregistrée.`)
    await onRecipeSaved()
  }

  return (
    <div>
      {/* Ajout d'une ligne : ingrédient + grammes */}
      <div className="rounded-2xl p-3.5 border mb-3" style={{ background: C.surface, borderColor: C.line }}>
        <span className="block text-[11px] uppercase tracking-[0.14em] mb-2" style={{ color: C.faint }}>
          Ajouter un ingrédient
        </span>
        {/* Filtre texte : restreint les options du <select> natif sans le remplacer
            (on garde le picker déroulant). Vide ⇒ les 58 ingrédients. */}
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 border mb-2" style={{ background: C.bg, borderColor: C.line }}>
          <Search size={15} style={{ color: C.faint }} />
          <input
            type="text"
            aria-label="Filtrer les ingrédients"
            placeholder="Filtrer…"
            value={pickQuery}
            onChange={(e) => setPickQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: C.text }}
          />
        </div>
        <select
          aria-label="Choisir un ingrédient"
          value={effectivePick}
          onChange={(e) => setPickId(e.target.value)}
          className="w-full rounded-xl px-3 py-2 text-[14px] outline-none border mb-2"
          style={{ background: C.bg, borderColor: C.line, color: effectivePick ? C.text : C.faint }}
        >
          <option value="">— choisir —</option>
          {cats.map((cat) => (
            <optgroup key={cat} label={cat}>
              {shown
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

          {/* Action annexe : figer cette compo comme recette réutilisable. */}
          {recipeName === null ? (
            <button
              type="button"
              onClick={() => {
                setRecipeName('')
                setRecipeNote('')
              }}
              className="mt-2 w-full rounded-xl py-2 text-[13px] font-semibold active:scale-95 transition flex items-center justify-center gap-1.5"
              style={{ background: C.surface, color: C.text, border: `1px solid ${C.line}` }}
            >
              <BookMarked size={15} /> Enregistrer comme recette
            </button>
          ) : (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="text"
                aria-label="Nom de la recette"
                placeholder="Nom de la recette"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveAsRecipe()}
                className="flex-1 rounded-xl px-3 py-2 text-[14px] outline-none border"
                style={{ background: C.bg, borderColor: C.line, color: C.text }}
              />
              <button
                type="button"
                onClick={saveAsRecipe}
                aria-label="Valider la recette"
                className="rounded-xl px-3 py-2 text-[13px] font-semibold active:scale-95 transition"
                style={{ background: C.energy, color: C.bg }}
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                onClick={() => setRecipeName(null)}
                aria-label="Annuler la recette"
                className="rounded-xl px-3 py-2 active:scale-95 transition"
                style={{ background: C.surface, color: C.faint, border: `1px solid ${C.line}` }}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {recipeNote && (
            <div className="mt-2 text-[12px]" style={{ color: C.energy }}>
              {recipeNote}
            </div>
          )}
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

// Le journal du jour (édition/suppression) vit désormais dans src/screens/Journal.jsx
// (onglet nav principal, D26). Composer/Recettes/Boissons écrivent dans
// journalEntries ; l'écran Journal les relit à son ouverture.

// ── (a) Bibliothèque d'ingrédients : recherche + filtre + CRUD ─────
function Library({ ingredients, onChange }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)

  const cats = useMemo(() => distinctCategories(ingredients), [ingredients])
  const filtered = useMemo(() => {
    const byCat = cat === 'all' ? ingredients : ingredients.filter((i) => i.category === cat)
    return filterIngredients(byCat, { q }) // même prédicat de nom que le Composer
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

// ── (d) Recettes récurrentes : rappeler / renommer / supprimer ─────
// Sous-vue MINIMALE. « Rappeler » = append au journal du jour (macros figées D1
// via applyRecipe→saveMeal), jamais remplacement. Pas d'édition des lignes :
// pour changer une recette → la supprimer et re-save depuis le Composer.
function Recipes({ recipes, onChange, onApplied }) {
  const [feedback, setFeedback] = useState(null) // { kind: 'ok' | 'warn', text }

  if (!recipes.length) {
    return <EmptyHint icon={BookMarked} text="Aucune recette. Compose un plat puis « Enregistrer comme recette »." />
  }
  const warn = feedback?.kind === 'warn'
  return (
    <div>
      {feedback && (
        <div
          className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 border mb-3"
          style={
            warn
              ? { background: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.3)', color: C.warn }
              : { background: 'rgba(190,242,100,0.08)', borderColor: 'rgba(190,242,100,0.3)', color: C.energy }
          }
        >
          {warn ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <Check size={15} className="mt-0.5 shrink-0" />}
          <span className="text-[12.5px]">{feedback.text}</span>
        </div>
      )}
      <div className="space-y-2">
        {recipes.map((r) => (
          <RecipeRow key={r.id} recipe={r} onChange={onChange} onApplied={onApplied} setFeedback={setFeedback} />
        ))}
      </div>
    </div>
  )
}

function RecipeRow({ recipe, onChange, onApplied, setFeedback }) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const count = (recipe.lines || []).length

  async function recall() {
    const { added, missing } = await applyRecipe(recipe.id)
    const addedTxt = added > 0 ? `${added} ligne${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} au journal.` : 'aucune ligne ajoutée.'
    if (missing.length) {
      // nameSnapshot affiché UNIQUEMENT ici (résolution échouée), pas pour un
      // ingrédient qui résout. Cas « toutes les lignes mortes » → added=0.
      setFeedback({ kind: 'warn', text: `« ${recipe.name} » — supprimé, ignoré : ${missing.join(', ')}. ${addedTxt}` })
    } else {
      setFeedback({ kind: 'ok', text: `« ${recipe.name} » → ${addedTxt}` })
    }
    if (added > 0) await onApplied?.()
  }
  async function saveRename() {
    const n = draft.trim()
    if (!n) return
    await renameRecipe(recipe.id, n)
    setRenaming(false)
    await onChange()
  }
  async function remove() {
    await deleteRecipe(recipe.id)
    await onChange()
  }

  return (
    <div className="rounded-xl px-3.5 py-2.5 border" style={{ background: C.surface, borderColor: C.line }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              type="text"
              aria-label={`Nouveau nom ${recipe.name}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveRename()}
              className="w-full rounded-lg px-2 py-1 text-[13.5px] border"
              style={{ background: C.surfaceHi, borderColor: C.line, color: C.text }}
            />
          ) : (
            <>
              <div className="text-[13.5px] font-medium truncate" style={{ color: C.text }}>
                {recipe.name}
              </div>
              <div className="text-[11.5px]" style={{ color: C.faint, ...num }}>
                {count} ingrédient{count > 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {renaming ? (
            <>
              <button type="button" onClick={saveRename} aria-label="Valider le nom" className="p-1.5 active:scale-90" style={{ color: C.energy }}>
                <Check size={16} />
              </button>
              <button type="button" onClick={() => setRenaming(false)} aria-label="Annuler le renommage" className="p-1.5 active:scale-90" style={{ color: C.faint }}>
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={recall}
                aria-label={`Rappeler ${recipe.name}`}
                className="rounded-lg px-2.5 py-1 text-[12.5px] font-semibold active:scale-95 transition flex items-center gap-1"
                style={{ background: C.surfaceHi, color: C.energy }}
              >
                <RotateCcw size={13} /> Rappeler
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenaming(true)
                  setDraft(recipe.name)
                }}
                aria-label={`Renommer ${recipe.name}`}
                className="p-1.5 active:scale-90"
                style={{ color: C.faint }}
              >
                <Pencil size={15} />
              </button>
              <button type="button" onClick={remove} aria-label={`Supprimer la recette ${recipe.name}`} className="p-1.5 active:scale-90" style={{ color: C.faint }}>
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── (e) Boissons : base + saisie au journal (1 tap × multiplicateur, D25) ──
// Une boisson = portion standard. « Boire » loggue 1 journalEntry sourceType:'drink'
// (macros + kcal figés D1, kcal PORTÉ). Édition/suppression = onglet Journal (regram
// sur grams=portionMl). CRUD custom calque la Bibliothèque ingrédients.
function Drinks({ drinks, onChange, onLogged }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [note, setNote] = useState('')

  const cats = useMemo(() => distinctCategories(drinks), [drinks])
  const filtered = useMemo(() => {
    const byCat = cat === 'all' ? drinks : drinks.filter((d) => d.category === cat)
    return filterIngredients(byCat, { q }) // même prédicat de nom (sous-chaîne)
  }, [drinks, q, cat])

  async function logOne(drink, count) {
    await logDrink(drink, count)
    setNote(`${drink.name} ×${count} ajouté au journal.`)
    await onLogged?.()
  }

  return (
    <div>
      {note && (
        <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 border mb-3" style={{ background: 'rgba(190,242,100,0.08)', borderColor: 'rgba(190,242,100,0.3)', color: C.energy }}>
          <Check size={15} className="shrink-0" />
          <span className="text-[12.5px]">{note}</span>
        </div>
      )}

      {/* Recherche */}
      <div className="flex items-center gap-2 rounded-xl px-3 py-2 border mb-2.5" style={{ background: C.surface, borderColor: C.line }}>
        <Search size={15} style={{ color: C.faint }} />
        <input
          type="text"
          aria-label="Rechercher une boisson"
          placeholder="Rechercher…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 bg-transparent outline-none text-[14px]"
          style={{ color: C.text }}
        />
      </div>

      {/* Filtres catégorie (dynamiques) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
        <CatChip id="all" label="Toutes" cat={cat} set={setCat} />
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
        <Plus size={15} /> {adding ? 'Fermer' : 'Ajouter une boisson'}
      </button>

      {adding && (
        <DrinkForm
          cats={cats}
          onCancel={() => setAdding(false)}
          onSubmit={async (data) => {
            await addDrink(data)
            setAdding(false)
            await onChange()
          }}
        />
      )}

      <div className="space-y-2">
        {filtered.map((d) =>
          editId === d.id ? (
            <DrinkForm
              key={d.id}
              cats={cats}
              initial={d}
              onCancel={() => setEditId(null)}
              onSubmit={async (data) => {
                await updateDrink(d.id, data)
                setEditId(null)
                await onChange()
              }}
            />
          ) : (
            <DrinkRow
              key={d.id}
              drink={d}
              onLog={logOne}
              onEdit={() => {
                setEditId(d.id)
                setAdding(false)
              }}
              onDelete={async () => {
                await deleteDrink(d.id)
                await onChange()
              }}
            />
          ),
        )}
        {filtered.length === 0 && <EmptyHint icon={Search} text="Aucune boisson ne correspond." />}
      </div>
    </div>
  )
}

function DrinkRow({ drink, onLog, onEdit, onDelete }) {
  const [count, setCount] = useState(1)
  return (
    <div className="rounded-xl px-3.5 py-2.5 border" style={{ background: C.surface, borderColor: C.line }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium truncate" style={{ color: C.text }}>
            {drink.name} <span style={{ color: C.faint }}>· {drink.portionLabel}</span>
          </div>
          <div className="text-[11.5px]" style={{ color: C.faint, ...num }}>
            {drink.kcal} kcal · G {drink.carb} · sucres {drink.sugarsSimple} · {GI_LABEL[drink.gi]}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit} aria-label={`Modifier ${drink.name}`} className="p-1.5 active:scale-90" style={{ color: C.faint }}>
            <Pencil size={15} />
          </button>
          <button type="button" onClick={onDelete} aria-label={`Supprimer ${drink.name}`} className="p-1.5 active:scale-90" style={{ color: C.faint }}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <div className="flex items-center gap-1 rounded-lg border" style={{ borderColor: C.line, background: C.bg }}>
          <button
            type="button"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            disabled={count <= 1}
            aria-label={`Moins ${drink.name}`}
            className="px-2 py-1.5 active:scale-90 disabled:opacity-30"
            style={{ color: C.text }}
          >
            <Minus size={14} />
          </button>
          <span className="w-6 text-center text-[13.5px] font-semibold tabular-nums" style={{ color: C.text }} data-testid={`drink-count-${drink.id}`}>
            {count}
          </span>
          <button
            type="button"
            onClick={() => setCount((c) => c + 1)}
            aria-label={`Plus ${drink.name}`}
            className="px-2 py-1.5 active:scale-90"
            style={{ color: C.text }}
          >
            <Plus size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onLog(drink, count)}
          aria-label={`Boire ${drink.name}`}
          className="flex-1 rounded-lg py-1.5 text-[13px] font-semibold active:scale-95 transition flex items-center justify-center gap-1.5"
          style={{ background: C.energy, color: C.bg }}
        >
          <Wine size={15} /> Boire
        </button>
      </div>
    </div>
  )
}

const EMPTY_DRINK = { name: '', category: '', portionLabel: '', portionMl: '', kcal: '', protein: '', carb: '', sugarsSimple: '', fat: '', alcoholG: '', gi: 'low' }

function DrinkForm({ cats, initial, onSubmit, onCancel }) {
  const [f, setF] = useState(() =>
    initial
      ? {
          name: initial.name,
          category: initial.category,
          portionLabel: initial.portionLabel,
          portionMl: String(initial.portionMl),
          kcal: String(initial.kcal),
          protein: String(initial.protein),
          carb: String(initial.carb),
          sugarsSimple: String(initial.sugarsSimple),
          fat: String(initial.fat),
          alcoholG: String(initial.alcoholG),
          gi: initial.gi,
        }
      : EMPTY_DRINK,
  )
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const catOptions = useMemo(() => {
    const known = ['bières', 'vins', 'apéritifs', 'spiritueux', 'liqueurs', 'cocktails']
    return [...new Set([...known, ...cats])]
  }, [cats])

  async function submit() {
    setError('')
    try {
      await onSubmit({
        ...f,
        portionMl: parseNum(f.portionMl),
        kcal: parseNum(f.kcal),
        protein: parseNum(f.protein),
        carb: parseNum(f.carb),
        sugarsSimple: parseNum(f.sugarsSimple),
        fat: parseNum(f.fat),
        alcoholG: parseNum(f.alcoholG),
      })
    } catch (err) {
      setError(err.message || 'Saisie invalide.')
    }
  }

  return (
    <div className="rounded-2xl p-3.5 border mb-3" style={{ background: C.surfaceHi, borderColor: C.line }}>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          aria-label="Nom de la boisson"
          placeholder="Nom"
          value={f.name}
          onChange={set('name')}
          className="flex-1 rounded-xl px-3 py-2 text-[14px] outline-none border"
          style={{ background: C.bg, borderColor: C.line, color: C.text }}
        />
        <input
          type="text"
          aria-label="Portion"
          placeholder="33 cl"
          value={f.portionLabel}
          onChange={set('portionLabel')}
          className="w-24 rounded-xl px-3 py-2 text-[14px] outline-none border"
          style={{ background: C.bg, borderColor: C.line, color: C.text }}
        />
      </div>
      <div className="flex gap-2 mb-2">
        <select
          aria-label="Catégorie de boisson"
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
          aria-label="Index glycémique de la boisson"
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
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        <NumField label="ml" v={f.portionMl} on={set('portionMl')} />
        <NumField label="kcal" v={f.kcal} on={set('kcal')} />
        <NumField label="alcool g" v={f.alcoholG} on={set('alcoholG')} />
        <NumField label="P" v={f.protein} on={set('protein')} />
        <NumField label="G" v={f.carb} on={set('carb')} />
        <NumField label="sucr." v={f.sugarsSimple} on={set('sugarsSimple')} />
        <NumField label="L" v={f.fat} on={set('fat')} />
      </div>
      <div className="text-[10.5px] mb-2" style={{ color: C.faint }}>
        Valeurs PAR portion · sucres simples ⊂ glucides · kcal porté (alcool 7 kcal/g)
      </div>
      {error && (
        <div className="text-[12px] mb-2" style={{ color: C.warn }}>
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={submit} className="flex-1 rounded-xl py-2 text-[13px] font-semibold active:scale-95 transition" style={{ background: C.energy, color: C.bg }}>
          {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-[13px] font-semibold active:scale-95 transition" style={{ background: C.surface, color: C.muted, border: `1px solid ${C.line}` }}>
          Annuler
        </button>
      </div>
    </div>
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
