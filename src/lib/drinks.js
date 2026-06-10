import { db, newRow, touch, nowMs } from '../db.js'
import { todayKey } from '../ui.js'

// ── Boissons (alcoolisées) : base + saisie au journal (D25) ─────────
// Une boisson = UNE portion standard (33 cl bière, 12 cl vin, 4 cl spiritueux…),
// avec des valeurs ABSOLUES par portion (PAS /100 g comme les ingrédients).
//
// INVARIANTS (D25 + réutilisés) :
//  - D2  : une boisson loguée → journalEntry `sourceType:'drink'` + sourceId.
//  - D1  : macros + kcal FIGÉS au log (snapshot). Le kcal de la portion est
//          PORTÉ tel quel (× multiplicateur), JAMAIS recalculé depuis les macros
//          (l'alcool fait 7 kcal/g ≠ 4P+4G+9L → un recalcul perdrait ces calories).
//  - D5/D21 : `gi` copié → la boisson alimente la composition glucidique du jour.
//  - D10/D11 : tout write passe par newRow()/touch() (UUID + updatedAt).
// Schéma INCHANGÉ — ZÉRO bump Dexie : le store `drinks` existe depuis v2, est dans
// TABLES (export/import couvert, D7), et les champs portion sont NON INDEXÉS
// (écriture libre, calque nutrition/D18). Un bump n'aurait servi qu'un nouvel index.

const GI_LEVELS = ['low', 'mid', 'high']
const round1 = (x) => Math.round(x * 10) / 10

// ── Calcul pur (testable node) ─────────────────────────────────────
/**
 * Macros d'une portion × count. Valeurs ABSOLUES (≠ /100 g).
 * kcal PORTÉ (× count), JAMAIS dérivé des macros (invariant D25).
 */
export function drinkEntryMacros(drink, count = 1) {
  const n = count
  return {
    kcal: Math.round((drink.kcal || 0) * n),
    protein: round1((drink.protein || 0) * n),
    carb: round1((drink.carb || 0) * n),
    sugarsSimple: round1((drink.sugarsSimple || 0) * n),
    fat: round1((drink.fat || 0) * n),
  }
}

/**
 * kcal d'alcool « non répartis » du jour = résidu kcal − (4P + 4G + 9L) sur les
 * SEULES entrées `sourceType:'drink'`, borné ≥ 0 (rounding), arrondi. DÉRIVÉ PUR :
 * jamais stocké ni indexé (D25). Capture honnêtement la part calorique qu'aucune
 * macro n'explique (≈ 7·alcoholG). 0 si aucune boisson ce jour (→ ligne masquée).
 */
export function alcoholKcal(entries = []) {
  let sum = 0
  for (const e of entries) {
    if (e?.sourceType !== 'drink') continue
    const macroKcal = 4 * (e.protein || 0) + 4 * (e.carb || 0) + 9 * (e.fat || 0)
    sum += Math.max(0, (e.kcal || 0) - macroKcal)
  }
  return Math.round(sum)
}

/** Validation d'une boisson (saisie biblio). sugarsSimple ⊂ carb → ≤ carb. */
export function validateDrink(data) {
  const name = String(data.name || '').trim()
  if (!name) return { ok: false, error: 'Nom requis.' }
  const nums = ['kcal', 'protein', 'carb', 'sugarsSimple', 'fat', 'portionMl', 'alcoholG']
  for (const k of nums) {
    const v = Number(data[k])
    if (!Number.isFinite(v) || v < 0) return { ok: false, error: `Valeur invalide : ${k}.` }
  }
  if (Number(data.sugarsSimple) > Number(data.carb)) {
    return { ok: false, error: 'Sucres simples ≤ glucides (sous-ensemble).' }
  }
  if (!GI_LEVELS.includes(data.gi)) return { ok: false, error: 'IG : low / mid / high.' }
  if (!String(data.category || '').trim()) return { ok: false, error: 'Catégorie requise.' }
  if (!String(data.portionLabel || '').trim()) return { ok: false, error: 'Portion requise.' }
  return { ok: true }
}

// ── I/O bibliothèque ───────────────────────────────────────────────
export async function loadDrinks() {
  const rows = await db.drinks.toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/** Crée une boisson custom (isCustom:true). Lève si invalide. */
export async function addDrink(data) {
  const v = validateDrink(data)
  if (!v.ok) throw new Error(v.error)
  const row = newRow({
    name: data.name.trim(),
    category: data.category,
    portionLabel: data.portionLabel.trim(),
    portionMl: Number(data.portionMl),
    kcal: Math.round(Number(data.kcal)),
    protein: Number(data.protein),
    carb: Number(data.carb),
    sugarsSimple: Number(data.sugarsSimple),
    fat: Number(data.fat),
    gi: data.gi,
    alcoholG: Number(data.alcoholG),
    isCustom: true,
    createdAt: nowMs(),
  })
  await db.drinks.add(row)
  return row
}

/** Met à jour une boisson (biblio). N'affecte PAS l'historique (D1). */
export async function updateDrink(id, patch) {
  const existing = await db.drinks.get(id)
  if (!existing) throw new Error('Boisson introuvable.')
  const merged = { ...existing, ...patch }
  const v = validateDrink(merged)
  if (!v.ok) throw new Error(v.error)
  await db.drinks.put(
    touch({
      ...merged,
      portionMl: Number(merged.portionMl),
      kcal: Math.round(Number(merged.kcal)),
      protein: Number(merged.protein),
      carb: Number(merged.carb),
      sugarsSimple: Number(merged.sugarsSimple),
      fat: Number(merged.fat),
      alcoholG: Number(merged.alcoholG),
    }),
  )
}

export async function deleteDrink(id) {
  await db.drinks.delete(id)
}

// ── Saisie au journal : 1 entrée drink (snapshot figé D1) ──────────
/**
 * Loggue une boisson au journal du jour : 1 journalEntry `sourceType:'drink'`,
 * macros × count FIGÉES (D1), kcal PORTÉ. Le nom d'entrée porte la portion
 * (« Bière blonde (33 cl) ») → le champ d'édition de quantité (grams = portionMl,
 * ml ≈ g) reste interprétable. Édition/suppression = chemin journal standard
 * (updateEntryGrams / deleteEntry rescalent / retirent le snapshot, jamais relu).
 */
export async function logDrink(drink, count = 1, date = todayKey()) {
  const n = Math.max(1, Math.round(count))
  const m = drinkEntryMacros(drink, n)
  const now = nowMs()
  const row = newRow({
    date,
    sourceType: 'drink', // D2
    sourceId: drink.id,
    nameSnapshot: `${drink.name} (${drink.portionLabel})`,
    grams: (drink.portionMl || 0) * n, // ml ≈ g → regram-able (updateEntryGrams)
    kcal: m.kcal, // D1 : kcal PORTÉ, jamais recalculé
    protein: m.protein,
    carb: m.carb,
    sugarsSimple: m.sugarsSimple,
    fat: m.fat,
    gi: drink.gi, // D5/D21
    createdAt: now,
    loggedAt: now, // D12
  })
  await db.transaction('rw', db.journalEntries, async () => {
    await db.journalEntries.add(row)
  })
  return row
}
