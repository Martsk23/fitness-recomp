import { db, newRow, touch, nowMs } from '../db.js'
import { todayKey } from '../ui.js'

// ── Nutrition : bibliothèque d'ingrédients + composition d'un plat par pesée ──
// Schéma INCHANGÉ (zéro bump Dexie) : `ingredients`, `journalEntries` et `drinks`
// existent depuis v2 et leurs index suffisent (name/category pour la biblio,
// date pour le journal). Les valeurs /100 g et les snapshots sont des champs
// NON INDEXÉS → écriture libre.
//
// INVARIANTS respectés :
//  - D1 (macros figées) : à la composition, on COPIE les macros calculées dans
//    journalEntries. Éditer/supprimer un ingrédient ne réécrit JAMAIS l'historique.
//    Le « regrammage » d'une entrée rescale son PROPRE snapshot (densité figée à
//    la saisie), il ne relit pas l'ingrédient source.
//  - D2 (sourceType) : entrées d'ingrédient → sourceType:'ingredient' + sourceId.
//  - D5 (IG 3 niveaux) : gi ∈ {low, mid, high}, copié dans le snapshot.
//  - D10/D11 (UUID + updatedAt) : tout write passe par newRow()/touch().

const GI_LEVELS = ['low', 'mid', 'high']
// Catégories connues dans un ordre stable ; toute catégorie inconnue (ingrédient
// custom) est ajoutée à la fin par ordre alpha → filtres gérés DYNAMIQUEMENT.
const KNOWN_CATEGORIES = ['féculents', 'protéines', 'légumes', 'matières grasses', 'fruits', 'laitages', 'aromates']

const round1 = (x) => Math.round(x * 10) / 10

// ── Calcul pur (testable node) ─────────────────────────────────────
/**
 * Macros d'une portion : valeur = (champ /100 g) × grammes ÷ 100.
 * kcal arrondi à l'entier, macros à 0,1 g (pas de dérive flottante en base).
 */
export function lineMacros(ing, grams) {
  const f = grams / 100
  return {
    kcal: Math.round((ing.kcal100 || 0) * f),
    protein: round1((ing.protein100 || 0) * f),
    carb: round1((ing.carb100 || 0) * f),
    sugarsSimple: round1((ing.sugarsSimple100 || 0) * f),
    fat: round1((ing.fat100 || 0) * f),
  }
}

/** Somme des macros de plusieurs lignes {ing, grams} → totaux du plat (aperçu live). */
export function composeTotals(lines) {
  return lines.reduce(
    (a, l) => {
      const m = lineMacros(l.ing, l.grams)
      return {
        kcal: a.kcal + m.kcal,
        protein: round1(a.protein + m.protein),
        carb: round1(a.carb + m.carb),
        sugarsSimple: round1(a.sugarsSimple + m.sugarsSimple),
        fat: round1(a.fat + m.fat),
      }
    },
    { kcal: 0, protein: 0, carb: 0, sugarsSimple: 0, fat: 0 },
  )
}

/**
 * Regrammage d'une entrée du journal : rescale son PROPRE snapshot (D1 — on ne
 * relit pas l'ingrédient, dont les valeurs ont pu changer depuis). Garde la
 * densité nutritionnelle figée au moment de la saisie.
 */
export function regramMacros(entry, newGrams) {
  if (!(entry.grams > 0)) return { kcal: 0, protein: 0, carb: 0, sugarsSimple: 0, fat: 0 }
  const r = newGrams / entry.grams
  return {
    kcal: Math.round(entry.kcal * r),
    protein: round1(entry.protein * r),
    carb: round1(entry.carb * r),
    sugarsSimple: round1(entry.sugarsSimple * r),
    fat: round1(entry.fat * r),
  }
}

/** Validation d'un ingrédient (saisie biblio). sugarsSimple ⊂ carb → ≤ carb. */
export function validateIngredient(data) {
  const name = String(data.name || '').trim()
  if (!name) return { ok: false, error: 'Nom requis.' }
  const nums = ['kcal100', 'protein100', 'carb100', 'sugarsSimple100', 'fat100']
  for (const k of nums) {
    const v = Number(data[k])
    if (!Number.isFinite(v) || v < 0) return { ok: false, error: `Valeur invalide : ${k}.` }
  }
  if (Number(data.sugarsSimple100) > Number(data.carb100)) {
    return { ok: false, error: 'Sucres simples ≤ glucides (sous-ensemble).' }
  }
  if (!GI_LEVELS.includes(data.gi)) return { ok: false, error: 'IG : low / mid / high.' }
  if (!String(data.category || '').trim()) return { ok: false, error: 'Catégorie requise.' }
  return { ok: true }
}

/** Catégories distinctes présentes, connues d'abord (ordre stable) puis le reste en alpha. */
export function distinctCategories(ingredients) {
  const present = new Set(ingredients.map((i) => i.category))
  const known = KNOWN_CATEGORIES.filter((c) => present.has(c))
  const extra = [...present].filter((c) => !KNOWN_CATEGORIES.includes(c)).sort((a, b) => a.localeCompare(b, 'fr'))
  return [...known, ...extra]
}

// ── I/O bibliothèque ───────────────────────────────────────────────
export async function loadIngredients() {
  const rows = await db.ingredients.toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/** Crée un ingrédient custom (isCustom:true). Lève si invalide. */
export async function addIngredient(data) {
  const v = validateIngredient(data)
  if (!v.ok) throw new Error(v.error)
  const row = newRow({
    name: data.name.trim(),
    category: data.category,
    kcal100: Number(data.kcal100),
    protein100: Number(data.protein100),
    carb100: Number(data.carb100),
    sugarsSimple100: Number(data.sugarsSimple100),
    fat100: Number(data.fat100),
    gi: data.gi,
    isCustom: true,
    createdAt: nowMs(),
  })
  await db.ingredients.add(row)
  return row
}

/** Met à jour un ingrédient (biblio). N'affecte PAS l'historique (D1). */
export async function updateIngredient(id, patch) {
  const existing = await db.ingredients.get(id)
  if (!existing) throw new Error('Ingrédient introuvable.')
  const merged = { ...existing, ...patch }
  const v = validateIngredient(merged)
  if (!v.ok) throw new Error(v.error)
  await db.ingredients.put(
    touch({
      ...merged,
      kcal100: Number(merged.kcal100),
      protein100: Number(merged.protein100),
      carb100: Number(merged.carb100),
      sugarsSimple100: Number(merged.sugarsSimple100),
      fat100: Number(merged.fat100),
    }),
  )
}

export async function deleteIngredient(id) {
  await db.ingredients.delete(id)
}

// ── Composition d'un plat → journalEntries (macros figées, D1) ─────
/**
 * Enregistre un plat : 1 journalEntry PAR ligne (snapshot figé). Atomique.
 * lines = [{ ing, grams }]. Retourne le nombre d'entrées écrites.
 */
export async function saveMeal(lines, date = todayKey()) {
  const valid = lines.filter((l) => l.ing && l.grams > 0)
  if (!valid.length) return 0
  const now = nowMs()
  const rows = valid.map((l) => {
    const m = lineMacros(l.ing, l.grams)
    return newRow({
      date,
      sourceType: 'ingredient', // D2
      sourceId: l.ing.id,
      nameSnapshot: l.ing.name, // D1 : nom figé
      grams: l.grams,
      kcal: m.kcal, // D1 : macros figées
      protein: m.protein,
      carb: m.carb,
      sugarsSimple: m.sugarsSimple,
      fat: m.fat,
      gi: l.ing.gi, // D5 : copié
      createdAt: now,
      loggedAt: now, // D12 : heure réelle du repas (= maintenant par défaut)
    })
  })
  await db.transaction('rw', db.journalEntries, async () => {
    await db.journalEntries.bulkAdd(rows)
  })
  return rows.length
}

/** Entrées du journal pour une date (triées par heure de saisie). */
export async function loadDayEntries(date = todayKey()) {
  const rows = await db.journalEntries.where('date').equals(date).toArray()
  return rows.sort((a, b) => (a.loggedAt || 0) - (b.loggedAt || 0))
}

/** Regramme une entrée existante : rescale son snapshot (D1), met à jour grams + macros. */
export async function updateEntryGrams(id, newGrams) {
  if (!(newGrams > 0)) throw new Error('Grammage invalide.')
  const entry = await db.journalEntries.get(id)
  if (!entry) throw new Error('Entrée introuvable.')
  const m = regramMacros(entry, newGrams)
  await db.journalEntries.put(touch({ ...entry, grams: newGrams, ...m }))
}

export async function deleteEntry(id) {
  await db.journalEntries.delete(id)
}
