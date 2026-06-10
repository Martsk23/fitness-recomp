// ── Suggestions de repas (Phase 3 point 8, D24) — moteur PUR ───────
// Aucune donnée stockée, aucun bump Dexie. Recalculé au montage du Jour, à
// partir de ce qui existe déjà : recettes (D19, formule vivante), restants du
// jour (cibles D15 − consommé effectif D20), contexte séance (D21/D22), heure.
// Calque glycemic.js / perf.js : fonctions pures, déterministes, testées node.
//
// La source de vérité des macros d'une recette = sa RÉSOLUTION contre la biblio
// COURANTE (resolveRecipe + composeTotals, D19) — exacte au gramme, jamais un
// snapshot. Une recette dont une ligne ne résout plus est EXCLUE (macros
// incomplètes = on ne la score pas honnêtement).
//
// SEAMS (toutes les constantes de réglage ICI, calque WARMUP_SCHEME) :
import { resolveRecipe, composeTotals, lineMacros } from './nutrition.js'
import { glycemicShares, HIGH_GI_REST_SHARE } from './glycemic.js'

// Pondérations du score (recalibrables à l'usage via ce seam, pas dans le code).
export const SUGGEST_WEIGHTS = {
  protein: 3, // priorité recomp : récompense le comblement du restant protéique
  kcal: 1, // proximité au comblement kcal (visé via la fraction de créneau)
  sugars: 2, // pénalité : part du budget sucres simples mangée
  giTrain: 1, // jour d'entraînement : remonte les recettes à dominante haut-IG
  giRest: 1, // jour de repos : les descend
  proteinCarry: 1.5, // orientation lendemain (carence veille) : sur-pondère le protéiné
}
export const PROTEIN_FIT_CAP = 1.5 // plafond du ratio de comblement protéique
export const KCAL_OVER_TOL = 0.1 // une recette peut dépasser le kcal restant de ≤10 % et rester « dans le budget »
export const MIN_SUGGEST_KCAL = 150 // sous ce restant kcal → pas de carte de recettes (état sous-seuil)
export const MAX_SUGGESTIONS = 3 // 2-3 cartes max

// Orientation lendemain : la veille est « en carence » si protéines < ratio·cible.
export const PROTEIN_DEFICIT_RATIO = 0.8

// Fallback complément mono-ingrédient (chemin gate UNIQUEMENT, point 3 D24).
export const FILLER_MIN_PROTEIN_GAP = 15 // g : sous le seuil kcal, on montre le complément si le gap protéique ≥ ça
export const FILLER_MAX_G = 300 // g : borne de portion d'un complément (au-delà → on n'invente pas)
export const FILLER_GRAM_STEP = 5 // g : arrondi de portion (lisible)

// Heure → fraction du budget restant visée. BORNES = seam exporté (aucun seuil
// horaire enfoui) : matin laisse de la marge, le soir clôt la journée.
export const SLOT_BOUNDS = { morningEndHour: 11, middayEndHour: 17 }
export const FILL_FRACTION_BY_SLOT = { morning: 0.35, midday: 0.6, evening: 1.0 }

// Chips dérivées (v1 ZÉRO bump : aucun champ `tags`, tout se dérive des macros).
export const PROTEIN_CHIP_SHARE = 0.3 // ≥30 % des kcal en protéines → chip « Protéiné »
export const LIGHT_CHIP_KCAL = 300 // ≤300 kcal → chip « Léger »
// « Post-séance / haut-IG » réutilise le seam glucidique (HIGH_GI_REST_SHARE).

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

/** Créneau du jour à partir de l'heure (0-23). Bornes = SLOT_BOUNDS (seam). */
export function slotForHour(hour) {
  if (hour < SLOT_BOUNDS.morningEndHour) return 'morning'
  if (hour < SLOT_BOUNDS.middayEndHour) return 'midday'
  return 'evening'
}

/**
 * Macros d'une recette résolue contre la biblio courante (pure).
 * @returns {{resolvable:boolean, totals, highShare:number}}
 *  - resolvable=false si ≥1 ligne morte (ingrédient supprimé) → la recette est
 *    EXCLUE du scoring (on ne score pas des macros incomplètes).
 *  - highShare = part de glucides haut-IG de la recette (réutilise glycemicShares).
 */
export function recipeMacros(recipe, ingredientsById) {
  const { resolved, missing } = resolveRecipe(recipe, ingredientsById)
  if (missing.length > 0 || resolved.length === 0) {
    return { resolvable: false, totals: null, highShare: 0 }
  }
  const totals = composeTotals(resolved)
  // Glucides par IG : carb figé de chaque ligne (lineMacros) + gi de l'ingrédient.
  const giEntries = resolved.map((l) => ({ carb: lineMacros(l.ing, l.grams).carb, gi: l.ing.gi }))
  const highShare = glycemicShares(giEntries).highShare
  return { resolvable: true, totals, highShare }
}

/** Tags de chips dérivés des macros (v1, zéro schéma). Filtre client. */
export function chipTags({ totals, highShare }) {
  const tags = []
  if (totals.kcal > 0 && (totals.protein * 4) / totals.kcal >= PROTEIN_CHIP_SHARE) tags.push('proteine')
  if (totals.kcal <= LIGHT_CHIP_KCAL) tags.push('leger')
  if (highShare >= HIGH_GI_REST_SHARE) tags.push('post-seance')
  return tags
}

/**
 * Une recette « tient » dans le budget (filtre binaire, alimente le gate).
 * Seuls kcal (plafond + tolérance) et sucres simples (ligne dure recomp, borne
 * stricte) disqualifient — un dépassement protéines/glucides n'est PAS un veto.
 * En mode kcalOnly (D20, macros consommées inconnues) : kcal seul, sucres ignorés.
 */
export function isFeasible(totals, remaining, { kcalOnly = false } = {}) {
  if (totals.kcal > remaining.kcal * (1 + KCAL_OVER_TOL)) return false
  if (!kcalOnly && remaining.sugars != null && totals.sugarsSimple > remaining.sugars) return false
  return true
}

/**
 * Score d'une recette (higher = better). Termes pondérés par SUGGEST_WEIGHTS :
 *  - proteinFit : comblement du restant protéique (0 si plus de besoin protéique).
 *  - kcalFit : proximité au kcal VISÉ (= restant × fraction de créneau), pénalise
 *    sous ET sur-comblement.
 *  - sugarsCost : part du budget sucres mangée (pénalité).
 * Modulateurs (pondération du tri, jamais filtre, ne touchent jamais le budget) :
 *  - séance : ±giShare selon entraînement/repos (haut-IG justifié autour de la séance).
 *  - carence veille : sur-pondère proteinFit (orientation lendemain, D24 point 5).
 * Mode kcalOnly (D20) : kcalFit + séance uniquement (aucune affirmation macro).
 */
export function scoreRecipe({ totals, highShare }, remaining, ctx = {}) {
  const { trained = false, fillFraction = 1, proteinDeficit = false, kcalOnly = false } = ctx
  const W = SUGGEST_WEIGHTS

  const kcalTarget = Math.max(remaining.kcal * fillFraction, 1)
  const kcalFit = clamp(1 - Math.abs(kcalTarget - totals.kcal) / kcalTarget, -1, 1)
  const giMod = trained ? W.giTrain * highShare : -W.giRest * highShare

  if (kcalOnly) return W.kcal * kcalFit + giMod

  const proteinFit = remaining.protein > 0 ? clamp(totals.protein / remaining.protein, 0, PROTEIN_FIT_CAP) : 0
  const sugarsCost =
    remaining.sugars > 0 ? clamp(totals.sugarsSimple / remaining.sugars, 0, 2) : totals.sugarsSimple > 0 ? 2 : 0
  const carryMod = proteinDeficit ? W.proteinCarry * proteinFit : 0

  return W.protein * proteinFit + W.kcal * kcalFit - W.sugars * sugarsCost + giMod + carryMod
}

/** Veille en carence protéique ? null (pas de journal détaillé la veille) → pas de boost, jamais NaN. */
export function proteinDeficitYesterday(yesterdayProtein, targetProtein) {
  if (yesterdayProtein == null || !(targetProtein > 0)) return false
  return yesterdayProtein < PROTEIN_DEFICIT_RATIO * targetProtein
}

/**
 * Complément mono-ingrédient couvrant le restant protéique (pure). Chemin gate
 * uniquement. Choisit l'ingrédient le plus DENSE en protéines (portion la plus
 * petite) qui tient dans la borne de portion ET le budget kcal restant. Étiqueté
 * « complément » côté UI, jamais « repas ». null si rien ne tient honnêtement.
 */
export function proteinFiller(ingredients, { proteinGap, kcalBudget }) {
  if (!(proteinGap >= FILLER_MIN_PROTEIN_GAP)) return null
  let best = null
  // Densité décroissante puis nom (déterministe) : la 1ʳᵉ qui tient gagne.
  const sorted = [...ingredients]
    .filter((i) => i.protein100 > 0)
    .sort((a, b) => b.protein100 - a.protein100 || String(a.id).localeCompare(String(b.id)))
  for (const ing of sorted) {
    const raw = (proteinGap * 100) / ing.protein100
    const grams = Math.round(raw / FILLER_GRAM_STEP) * FILLER_GRAM_STEP
    if (grams <= 0 || grams > FILLER_MAX_G) continue
    const m = lineMacros(ing, grams)
    if (kcalBudget != null && m.kcal > kcalBudget) continue
    best = { ing, grams, protein: m.protein, kcal: m.kcal }
    break
  }
  return best
}

/**
 * Vue-modèle complète des suggestions (PURE — la lecture base vit dans l'écran).
 * Décide l'état (mode) ET le contenu. Le gate est HONNÊTE : jamais un « moins
 * pire » silencieux ; si rien ne tient on le dit, chiffré, avec un fallback
 * complément si un gap protéique le justifie.
 *
 * @param recipes          recettes brutes (rows D19)
 * @param ingredientsById  Map id→ingrédient (biblio courante)
 * @param ingredients      liste plate (pour le complément)
 * @param remaining        { kcal, protein|null, carb|null, fat|null, sugars|null } (null = inconnu, D20)
 * @param trained, hour, proteinDeficit, kcalOnly
 * @returns {{mode, suggestions, filler, remaining, reason}}
 *   mode ∈ 'no-recipes' | 'suggestions' | 'gate' | 'filler-only' | 'hidden'
 */
export function suggestMeals({
  recipes = [],
  ingredientsById = new Map(),
  ingredients = [],
  remaining,
  trained = false,
  hour = 12,
  proteinDeficit = false,
  kcalOnly = false,
}) {
  const slot = slotForHour(hour)
  const fillFraction = FILL_FRACTION_BY_SLOT[slot]

  // Restants > 0 utiles pour le complément (jamais NaN, jamais négatif au gate).
  const proteinGap = !kcalOnly && remaining.protein != null ? remaining.protein : null
  const filler =
    proteinGap != null
      ? proteinFiller(ingredients, { proteinGap, kcalBudget: Math.max(remaining.kcal, 0) })
      : null

  // Sous le seuil kcal : pas de recettes, mais on ne disparaît pas muet si un gap
  // protéique reste à caser (LE cas du soir, point 3 D24).
  if (remaining.kcal < MIN_SUGGEST_KCAL) {
    if (filler && proteinGap >= FILLER_MIN_PROTEIN_GAP) {
      return { mode: 'filler-only', suggestions: [], filler, remaining, reason: null }
    }
    return { mode: 'hidden', suggestions: [], filler: null, remaining, reason: null }
  }

  // Au-dessus du seuil : score des recettes résolvables et faisables.
  const scored = recipes
    .map((r) => ({ recipe: r, ...recipeMacros(r, ingredientsById) }))
    .filter((s) => s.resolvable)

  if (scored.length === 0 && recipes.length === 0) {
    return { mode: 'no-recipes', suggestions: [], filler: null, remaining, reason: null }
  }

  const feasible = scored
    .filter((s) => isFeasible(s.totals, remaining, { kcalOnly }))
    .map((s) => ({
      recipe: s.recipe,
      totals: s.totals,
      highShare: s.highShare,
      tags: chipTags(s),
      score: scoreRecipe(s, remaining, { trained, fillFraction, proteinDeficit, kcalOnly }),
    }))
    .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name, 'fr'))

  if (feasible.length > 0) {
    return { mode: 'suggestions', suggestions: feasible.slice(0, MAX_SUGGESTIONS), filler: null, remaining, reason: null }
  }

  // Budget exploitable mais AUCUNE recette ne tient → gate honnête, chiffré.
  const parts = [`${Math.round(remaining.kcal)} kcal`]
  if (proteinGap != null) parts.push(`${Math.round(proteinGap)} g de protéines`)
  if (!kcalOnly && remaining.sugars != null) parts.push(`${Math.round(remaining.sugars)} g de sucres`)
  const reason = `Il reste ${parts.join(', ')} — aucune recette enregistrée ne tient dans ce budget.`
  return { mode: 'gate', suggestions: [], filler, remaining, reason }
}
