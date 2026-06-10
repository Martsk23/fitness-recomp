// Test suggestions de repas (node pur, sans navigateur ni IndexedDB). D24.
// Le moteur est dérivé : recettes (D19, formule vivante) + restants du jour
// (cibles D15 − consommé D20) + contexte séance (D21/D22) + heure. Prouve :
//  - faisabilité (kcal plafond + tolérance ; sucres simples borne dure) ;
//  - score : comblement protéique prioritaire, proximité kcal, coût sucres ;
//  - jour vide / budget large / budget serré ;
//  - GATE chiffré quand rien ne tient (jamais un « moins pire » muet) ;
//  - sucres = contrainte liante ;
//  - jour d'entraînement remonte le haut-IG, repos le descend ;
//  - carence veille sur-pondère le protéiné (garde null = pas de boost) ;
//  - complément mono-ingrédient : couvre / borne / null ;
//  - recette à ligne morte EXCLUE ;
//  - mode dégradé D20 kcal-only (aucune affirmation macro) ;
//  - sous-seuil + gap protéique → complément visible ;
//  - sous-seuil sans gap → carte masquée ;
//  - bornes de créneau (slotForHour) = seam.
import {
  slotForHour,
  recipeMacros,
  chipTags,
  isFeasible,
  scoreRecipe,
  proteinDeficitYesterday,
  proteinFiller,
  suggestMeals,
  SLOT_BOUNDS,
  FILL_FRACTION_BY_SLOT,
  MIN_SUGGEST_KCAL,
  FILLER_MIN_PROTEIN_GAP,
  FILLER_MAX_G,
  KCAL_OVER_TOL,
  PROTEIN_DEFICIT_RATIO,
} from '../src/lib/suggest.js'
import { todayKey } from '../src/ui.js'

let exitCode = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) exitCode = 1
}

// ── Bibliothèque + recettes synthétiques (déterministes) ───────────
// Ingrédients /100 g (champs comme en base D18).
const ING = {
  poulet: { id: 'poulet', name: 'Poulet', kcal100: 120, protein100: 23, carb100: 0, sugarsSimple100: 0, fat100: 3, gi: 'low' },
  riz: { id: 'riz', name: 'Riz', kcal100: 130, protein100: 2.5, carb100: 28, sugarsSimple100: 0, fat100: 0.3, gi: 'high' },
  brocoli: { id: 'brocoli', name: 'Brocoli', kcal100: 34, protein100: 2.8, carb100: 7, sugarsSimple100: 1.5, fat100: 0.4, gi: 'low' },
  miel: { id: 'miel', name: 'Miel', kcal100: 304, protein100: 0.3, carb100: 82, sugarsSimple100: 82, fat100: 0, gi: 'high' },
  skyr: { id: 'skyr', name: 'Skyr', kcal100: 63, protein100: 11, carb100: 4, sugarsSimple100: 4, fat100: 0.2, gi: 'low' },
}
const byId = new Map(Object.values(ING).map((i) => [i.id, i]))
const ingredients = Object.values(ING)

// Recettes = formule de références (D19) : { id, name, lines:[{sourceId, nameSnapshot, grams}] }.
const recipe = (id, name, lines) => ({ id, name, lines: lines.map(([sourceId, grams]) => ({ sourceId, nameSnapshot: byId.get(sourceId)?.name || sourceId, grams })) })
const R = {
  // Poulet 200 + riz 150 → 240 + 195 = 435 kcal ; P 46+3,8≈49,8 ; haut-IG (riz) dominant.
  pouletRiz: recipe('r-pr', 'Poulet riz', [['poulet', 200], ['riz', 150]]),
  // Salade légère, protéinée, bas-IG : poulet 150 + brocoli 200 → 180+68=248 kcal ; P 34,5+5,6.
  salade: recipe('r-sal', 'Salade poulet', [['poulet', 150], ['brocoli', 200]]),
  // Bombe sucrée : miel 100 → 304 kcal, 82 g sucres simples, haut-IG.
  miel: recipe('r-miel', 'Bol de miel', [['miel', 100]]),
  // Recette à ligne morte (ingrédient absent de la biblio) → EXCLUE.
  morte: { id: 'r-dead', name: 'Recette cassée', lines: [{ sourceId: 'disparu', nameSnapshot: 'Truc supprimé', grams: 100 }] },
}

// Restant « large » par défaut (début de journée).
const wide = { kcal: 2000, protein: 150, carb: 200, fat: 60, sugars: 20 }

// ── A — bornes de créneau (seam) ───────────────────────────────────
function a_slots() {
  console.log('\n— A : slotForHour (bornes = SLOT_BOUNDS seam) —')
  ok(slotForHour(SLOT_BOUNDS.morningEndHour - 1) === 'morning', 'avant morningEndHour → morning')
  ok(slotForHour(SLOT_BOUNDS.morningEndHour) === 'midday', 'à morningEndHour → midday')
  ok(slotForHour(SLOT_BOUNDS.middayEndHour) === 'evening', 'à middayEndHour → evening')
  ok(slotForHour(23) === 'evening', '23h → evening')
  ok(FILL_FRACTION_BY_SLOT.morning < FILL_FRACTION_BY_SLOT.evening, 'le matin vise moins de budget que le soir')
}

// ── B — résolution des macros d'une recette + exclusion ligne morte ─
function b_macros() {
  console.log('\n— B : recipeMacros (dérivé biblio) + exclusion ligne morte —')
  const m = recipeMacros(R.pouletRiz, byId)
  ok(m.resolvable, 'Poulet riz résolvable')
  ok(m.totals.kcal === 435, 'kcal exact 435 (240+195)')
  // P = 200×23/100 + 150×2,5/100 = 46 + 3,75 → 49,8 (arrondi 0,1 par ligne).
  ok(Math.abs(m.totals.protein - 49.8) < 0.05, `protéines ≈ 49,8 (réel ${m.totals.protein})`)
  // highShare = riz (28×1,5=42 g carb haut-IG) / total carb (42 + poulet 0) = 1.
  ok(Math.abs(m.highShare - 1) < 1e-9, 'highShare = 1 (riz seul porte les glucides)')

  const dead = recipeMacros(R.morte, byId)
  ok(!dead.resolvable && dead.totals === null, 'recette à ligne morte → resolvable=false, exclue du scoring')
}

// ── C — faisabilité (kcal plafond + tolérance ; sucres borne dure) ──
function c_feasible() {
  console.log('\n— C : isFeasible (kcal + sucres) —')
  const pr = recipeMacros(R.pouletRiz, byId).totals
  ok(isFeasible(pr, wide), 'Poulet riz tient dans un budget large')
  // Budget serré : 400 kcal restant → 435 ≤ 400×1,10=440 → tient (tolérance).
  ok(isFeasible(pr, { kcal: 400, sugars: 20 }), `435 kcal tient sous 400 kcal (tolérance ${KCAL_OVER_TOL * 100}%)`)
  ok(!isFeasible(pr, { kcal: 350, sugars: 20 }), '435 kcal NE tient PAS sous 350 (au-delà de la tolérance)')
  // Sucres : miel 82 g de sucres > budget 20 → rejeté même si kcal OK.
  const mielT = recipeMacros(R.miel, byId).totals
  ok(!isFeasible(mielT, { kcal: 2000, sugars: 20 }), 'miel rejeté : 82 g sucres > budget 20 (borne dure)')
  ok(isFeasible(mielT, { kcal: 2000, sugars: 100 }), 'miel accepté si budget sucres 100')
  // Mode kcalOnly : sucres ignorés (inconnus, D20).
  ok(isFeasible(mielT, { kcal: 2000, sugars: null }, { kcalOnly: true }), 'kcalOnly : sucres ignorés, kcal seul décide')
}

// ── D — score : protéine prioritaire, proximité kcal, coût sucres ───
function d_score() {
  console.log('\n— D : scoreRecipe (comblement) —')
  const sal = recipeMacros(R.salade, byId)
  const pr = recipeMacros(R.pouletRiz, byId)
  const ctx = { fillFraction: 1 }
  // Petit budget protéines : la recette qui comble mieux les protéines score plus.
  const tight = { kcal: 500, protein: 50, fat: 60, sugars: 20, carb: 200 }
  const sPr = scoreRecipe(pr, tight, ctx)
  const sSal = scoreRecipe(sal, tight, ctx)
  ok(sPr > sSal, 'à budget protéique serré, Poulet riz (49,8 g P, kcal proche) > Salade (40 g P)')
  // proteinFit borné : plus de besoin protéique (Rp ≤ 0) → la protéine ne pilote plus.
  const noProtNeed = { kcal: 500, protein: 0, fat: 60, sugars: 20, carb: 200 }
  ok(Number.isFinite(scoreRecipe(pr, noProtNeed, ctx)), 'Rp=0 → score fini (pas de division par zéro)')
}

// ── E — modulateur séance : haut-IG remonte (entraînement) / descend (repos) ──
function e_training() {
  console.log('\n— E : pondération séance (haut-IG) —')
  const pr = recipeMacros(R.pouletRiz, byId) // highShare 1
  const base = { kcal: 1000, protein: 100, fat: 60, sugars: 20, carb: 200 }
  const trained = scoreRecipe(pr, base, { fillFraction: 1, trained: true })
  const rest = scoreRecipe(pr, base, { fillFraction: 1, trained: false })
  ok(trained > rest, 'jour d’entraînement remonte une recette haut-IG vs jour de repos')
}

// ── F — orientation lendemain (carence veille) ─────────────────────
function f_carry() {
  console.log('\n— F : carence veille (orientation, jamais le budget) —')
  ok(proteinDeficitYesterday(100, 150) === true, `100 < 0,80×150=120 → carence (ratio ${PROTEIN_DEFICIT_RATIO})`)
  ok(proteinDeficitYesterday(130, 150) === false, '130 ≥ 120 → pas de carence')
  ok(proteinDeficitYesterday(null, 150) === false, 'veille SANS journal détaillé (null) → pas de boost, jamais NaN')
  ok(proteinDeficitYesterday(100, 0) === false, 'cible 0 → pas de boost (garde)')
  // Le boost sur-pondère le protéiné.
  const sal = recipeMacros(R.salade, byId)
  const tight = { kcal: 500, protein: 50, fat: 60, sugars: 20, carb: 200 }
  const withBoost = scoreRecipe(sal, tight, { fillFraction: 1, proteinDeficit: true })
  const without = scoreRecipe(sal, tight, { fillFraction: 1, proteinDeficit: false })
  ok(withBoost > without, 'carence veille → score protéiné sur-pondéré (même recette, même budget)')
}

// ── G — complément mono-ingrédient : couvre / borne / null ─────────
function g_filler() {
  console.log('\n— G : proteinFiller (couvre / borne / null) —')
  // 25 g de protéines à caser → Poulet (23/100) le plus dense ici → 25×100/23≈108,7 → arrondi 110 g.
  const f = proteinFiller(ingredients, { proteinGap: 25, kcalBudget: 2000 })
  ok(f && f.ing.id === 'poulet', 'choisit le plus dense en protéines (Poulet 23/100)')
  ok(f && f.grams === 110 && f.grams <= FILLER_MAX_G, `portion arrondie 110 g ≤ ${FILLER_MAX_G}`)
  ok(f && Math.abs(f.protein - 25.3) < 0.5, 'protéines couvertes ≈ le gap')
  // Gap sous le seuil → pas de complément.
  ok(proteinFiller(ingredients, { proteinGap: FILLER_MIN_PROTEIN_GAP - 1, kcalBudget: 2000 }) === null, `gap < ${FILLER_MIN_PROTEIN_GAP} → null`)
  // Budget kcal trop serré pour couvrir → null (honnête).
  ok(proteinFiller(ingredients, { proteinGap: 25, kcalBudget: 50 }) === null, 'budget kcal 50 insuffisant → null')
  // Gros gap impossible dans la borne de portion → null.
  ok(proteinFiller([ING.brocoli], { proteinGap: 30, kcalBudget: 2000 }) === null, 'gap 30 g via brocoli (2,8/100) → >300 g → null')
}

// ── H — suggestMeals : jour vide / budget large → tri ──────────────
function h_wide() {
  console.log('\n— H : suggestMeals budget large —')
  const v = suggestMeals({ recipes: [R.pouletRiz, R.salade], ingredientsById: byId, ingredients, remaining: wide, hour: 12 })
  ok(v.mode === 'suggestions', 'budget large → mode suggestions')
  ok(v.suggestions.length === 2, '2 recettes faisables suggérées')
  ok(v.suggestions.every((s) => Array.isArray(s.tags)), 'chaque suggestion porte ses tags (chips dérivées)')
  // Aucune recette → nudge.
  const none = suggestMeals({ recipes: [], ingredientsById: byId, ingredients, remaining: wide, hour: 12 })
  ok(none.mode === 'no-recipes', 'aucune recette → mode no-recipes (nudge)')
}

// ── I — GATE : rien ne tient → message chiffré + complément ────────
function i_gate() {
  console.log('\n— I : gate honnête (chiffré) —')
  // Budget exploitable (≥150 kcal) mais minuscule : 160 kcal, et 25 g de protéines.
  // Poulet riz (435) et Salade (248) dépassent → AUCUNE ne tient → gate.
  const remaining = { kcal: 160, protein: 25, carb: 100, fat: 40, sugars: 20 }
  const v = suggestMeals({ recipes: [R.pouletRiz, R.salade], ingredientsById: byId, ingredients, remaining, hour: 19 })
  ok(v.mode === 'gate', 'rien ne tient mais budget exploitable → mode gate')
  ok(/160 kcal/.test(v.reason) && /25 g de protéines/.test(v.reason), 'raison chiffrée (kcal + protéines)')
  ok(v.suggestions.length === 0, 'gate : aucune suggestion « moins pire »')
  ok(v.filler && v.filler.ing.id === 'poulet', 'gate : complément protéiné proposé')
}

// ── J — sucres = contrainte liante (gate par les sucres) ───────────
function j_sugars_binding() {
  console.log('\n— J : sucres contrainte liante —')
  // Large en kcal mais budget sucres À ZÉRO → le miel (82 g sucres) est rejeté.
  const remaining = { kcal: 2000, protein: 0, carb: 200, fat: 60, sugars: 0 }
  const v = suggestMeals({ recipes: [R.miel], ingredientsById: byId, ingredients, remaining, hour: 12 })
  ok(v.mode === 'gate', 'budget sucres nul → la seule recette (sucrée) ne tient pas → gate')
}

// ── K — mode dégradé D20 : kcal-only (aucune affirmation macro) ────
function k_kcal_only() {
  console.log('\n— K : mode dégradé D20 (kcalOnly) —')
  // Macros restantes inconnues (null) ; seul le kcal est connu.
  const remaining = { kcal: 600, protein: null, carb: null, fat: null, sugars: null }
  const v = suggestMeals({
    recipes: [R.pouletRiz, R.salade, R.miel],
    ingredientsById: byId,
    ingredients,
    remaining,
    hour: 18,
    kcalOnly: true,
  })
  ok(v.mode === 'suggestions', 'kcalOnly : suggestions sur le kcal seul')
  // miel (304) et salade (248) et poulet-riz (435 ≤ 600×1,1) tiennent tous sur kcal ;
  // le miel n'est PAS rejeté par les sucres (inconnus). Pas de complément (gap inconnu).
  ok(v.filler === null, 'kcalOnly : pas de complément (gap protéique inconnu)')
  ok(v.suggestions.some((s) => s.recipe.id === 'r-miel'), 'kcalOnly : sucres non opposables → miel reste éligible')
}

// ── L — sous-seuil : complément si gap (point 3) / masqué sinon ─────
function l_subthreshold() {
  console.log('\n— L : sous-seuil (point 3 D24) —')
  // 140 kcal < MIN_SUGGEST_KCAL, 25 g de protéines à caser → complément visible.
  const withGap = { kcal: 140, protein: 25, carb: 50, fat: 40, sugars: 20 }
  const vGap = suggestMeals({ recipes: [R.pouletRiz], ingredientsById: byId, ingredients, remaining: withGap, hour: 21 })
  ok(vGap.mode === 'filler-only', `sous ${MIN_SUGGEST_KCAL} kcal + gap ≥ ${FILLER_MIN_PROTEIN_GAP} → filler-only`)
  ok(vGap.filler && vGap.suggestions.length === 0, 'sous-seuil : complément seul, pas de recette')
  ok(vGap.filler.kcal <= withGap.kcal, 'le complément tient dans le kcal restant')

  // 140 kcal, plus de gap protéique → carte masquée.
  const noGap = { kcal: 140, protein: 5, carb: 50, fat: 40, sugars: 20 }
  const vNo = suggestMeals({ recipes: [R.pouletRiz], ingredientsById: byId, ingredients, remaining: noGap, hour: 21 })
  ok(vNo.mode === 'hidden', `sous-seuil sans gap (5 g < ${FILLER_MIN_PROTEIN_GAP}) → masquée`)

  // Sous-seuil en mode dégradé D20 (gap inconnu) → masquée (pas de complément inventé).
  const manual = { kcal: 140, protein: null, carb: null, fat: null, sugars: null }
  const vManual = suggestMeals({ recipes: [R.pouletRiz], ingredientsById: byId, ingredients, remaining: manual, hour: 21, kcalOnly: true })
  ok(vManual.mode === 'hidden', 'sous-seuil + kcalOnly → masquée (aucun complément sans gap connu)')
}

// ── M — chipTags (taxonomie dérivée v1) ────────────────────────────
function m_chips() {
  console.log('\n— M : chipTags dérivés —')
  const sal = recipeMacros(R.salade, byId) // 248 kcal, P 40,1 → ~65% kcal protéines, bas-IG
  const tSal = chipTags(sal)
  ok(tSal.includes('proteine'), 'Salade poulet → chip Protéiné')
  ok(tSal.includes('leger'), 'Salade 248 kcal → chip Léger')
  ok(!tSal.includes('post-seance'), 'Salade bas-IG → pas Post-séance')
  const pr = recipeMacros(R.pouletRiz, byId) // highShare 1 → post-seance ; 435 kcal → pas léger
  const tPr = chipTags(pr)
  ok(tPr.includes('post-seance'), 'Poulet riz haut-IG → chip Post-séance')
  ok(!tPr.includes('leger'), 'Poulet riz 435 kcal → pas Léger')
}

// ── N — câblage VEILLE : todayKey(J-1) honore le paramètre date ────
// SuggestionsCard lit les protéines de la veille via todayKey(Date.now()−86,4M ms).
// Si todayKey ignorait son paramètre, yProtein serait calculé sur AUJOURD'HUI →
// bug silencieux du proteinCarry. On verrouille que le param est bien pris.
function n_yesterdayKey() {
  console.log('\n— N : câblage veille (todayKey honore le paramètre) —')
  const d = new Date(Date.now() - 86_400_000)
  const exp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  ok(todayKey(d) === exp, 'todayKey(J-1) = la veille au format YYYY-MM-DD')
  ok(todayKey(d) !== todayKey(new Date()), 'clé veille ≠ clé du jour → le paramètre date EST pris en compte (pas ignoré)')
}

// ── O — EXCLUSION boissons (D25) : jamais suggérée comme repas ──────
// Preuve STRUCTURELLE : la source D24 = recipes résolues contre la biblio
// INGRÉDIENTS. Une boisson vit dans le store `drinks` (jamais passé à suggestMeals)
// et ne peut entrer dans une recette (D19 ingrédients-only). Si on FORCE une recette
// à référencer un id de boisson, sa résolution échoue → recette EXCLUE (comme une
// ligne morte). Aucune boisson ne peut donc remonter en suggestion.
function o_drinkExcluded() {
  console.log('\n— O : boisson jamais suggérée comme repas (D25) —')
  // Recette « piégée » pointant un id de boisson (absent de la biblio ingrédients).
  const trap = { id: 'r-drink', name: 'Bière piège', lines: [{ sourceId: 'biere-blonde', nameSnapshot: 'Bière blonde', grams: 330 }] }
  const m = recipeMacros(trap, byId)
  ok(!m.resolvable && m.totals === null, 'recette référençant une boisson → non résolvable (exclue du scoring)')
  // Avec UNIQUEMENT la recette piégée + une vraie recette : seule la vraie remonte.
  const view = suggestMeals({ recipes: [trap, R.salade], ingredientsById: byId, ingredients, remaining: wide, hour: 12 })
  ok(view.mode === 'suggestions', 'mode suggestions (la vraie recette tient)')
  ok(view.suggestions.every((s) => s.recipe.id !== 'r-drink'), 'la recette-boisson n’apparaît JAMAIS dans les suggestions')
  ok(view.suggestions.some((s) => s.recipe.id === 'r-sal'), 'seule la recette d’ingrédients est suggérée')
}

a_slots()
n_yesterdayKey()
o_drinkExcluded()
b_macros()
c_feasible()
d_score()
e_training()
f_carry()
g_filler()
h_wide()
i_gate()
j_sugars_binding()
k_kcal_only()
l_subthreshold()
m_chips()

console.log(exitCode === 0 ? '\n✅ suggest: tous les tests passent' : '\n❌ suggest: échecs')
process.exit(exitCode)
