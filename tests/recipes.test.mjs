// Test recettes récurrentes (node + fake-indexeddb, sans navigateur).
// Prouve : une recette = formule de RÉFÉRENCES vivante (resolveRecipe relit la
// biblio COURANTE → nom à jour si renommé, sourceId manquant → missing) ;
// l'application au journal FIGE les macros (D1) via saveMeal ; le cas dégradé
// (une ligne morte → sautée + avertie) ET le cas TOUTES lignes mortes (0 entrée
// écrite, pas de repas vide) ; renommage / suppression.
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { db } from '../src/db.js'
import {
  resolveRecipe,
  validateRecipeName,
  saveRecipe,
  loadRecipes,
  renameRecipe,
  deleteRecipe,
  applyRecipe,
  addIngredient,
  deleteIngredient,
  updateIngredient,
  loadDayEntries,
} from '../src/lib/nutrition.js'

let exitCode = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) exitCode = 1
}
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)

async function wipeAll() {
  if (db.isOpen()) db.close()
  await Dexie.delete('fitnessRecomp')
}

const CHICKEN = { name: 'Poulet', category: 'protéines', kcal100: 120, protein100: 23, carb100: 0, sugarsSimple100: 0, fat100: 2.6, gi: 'low' }
const RICE = { name: 'Riz', category: 'féculents', kcal100: 130, protein100: 2.7, carb100: 28, sugarsSimple100: 0.1, fat100: 0.3, gi: 'high' }

// ── R0 — resolveRecipe / validateRecipeName (purs) ─────────────────
function r0_pure() {
  console.log('\n— R0 : resolveRecipe + validateRecipeName (purs) —')
  ok(validateRecipeName('  Mon plat ').ok, 'nom non vide → ok')
  ok(!validateRecipeName('   ').ok, 'nom blanc → refus')

  const byId = new Map([
    ['poulet', { id: 'poulet', name: 'Blanc de poulet', kcal100: 120 }], // renommé depuis le snapshot
    ['riz', { id: 'riz', name: 'Riz', kcal100: 130 }],
  ])
  const recipe = {
    lines: [
      { sourceId: 'poulet', nameSnapshot: 'Poulet', grams: 200 },
      { sourceId: 'riz', nameSnapshot: 'Riz', grams: 150 },
      { sourceId: 'disparu', nameSnapshot: 'Patate douce', grams: 100 },
    ],
  }
  const { resolved, missing } = resolveRecipe(recipe, byId)
  ok(resolved.length === 2 && missing.length === 1, '2 résolus, 1 manquant')
  ok(resolved[0].ing.name === 'Blanc de poulet', 'résolution VIVANTE : nom courant (renommé), pas le nameSnapshot')
  ok(resolved[0].grams === 200, 'grammage de la recette conservé')
  ok(missing[0] === 'Patate douce', 'manquant remonté par nameSnapshot (fallback affichage)')

  // Recette vide → rien.
  ok(resolveRecipe({ lines: [] }, byId).resolved.length === 0, 'recette sans lignes → 0 résolu (jamais NaN)')
}

// ── R1 — saveRecipe : stocke des RÉFÉRENCES, pas des macros ────────
async function r1_save() {
  console.log('\n— R1 : saveRecipe (références + validation) —')
  await wipeAll()
  await db.open()
  const chicken = await addIngredient(CHICKEN)
  const rice = await addIngredient(RICE)

  const rec = await saveRecipe('Poulet-riz', [{ ing: chicken, grams: 200 }, { ing: rice, grams: 150 }])
  ok(isUuid(rec.id) && typeof rec.updatedAt === 'number' && typeof rec.createdAt === 'number', 'recette : UUID + updatedAt + createdAt')
  ok(rec.lines.length === 2, '2 lignes stockées')
  ok(rec.lines[0].sourceId === chicken.id && rec.lines[0].nameSnapshot === 'Poulet' && rec.lines[0].grams === 200, 'ligne = { sourceId, nameSnapshot, grams } (référence, pas de macros)')
  ok(!('kcal' in rec.lines[0]), 'aucune macro figée dans la recette (formule vivante)')

  let threwName = false
  try { await saveRecipe('  ', [{ ing: chicken, grams: 100 }]) } catch { threwName = true }
  ok(threwName, 'nom vide → throw')
  let threwEmpty = false
  try { await saveRecipe('Vide', [{ ing: chicken, grams: 0 }]) } catch { threwEmpty = true }
  ok(threwEmpty, 'aucune ligne valide (grams 0) → throw (pas de recette vide)')

  ok((await loadRecipes()).length === 1, 'loadRecipes : 1 recette (les tentatives invalides n\'ont rien écrit)')
}

// ── R2 — applyRecipe NOMINAL : append journal + macros FIGÉES (D1) ──
async function r2_apply_nominal() {
  console.log('\n— R2 : applyRecipe nominal (macros figées D1) —')
  await wipeAll()
  await db.open()
  const chicken = await addIngredient(CHICKEN)
  const rice = await addIngredient(RICE)
  const rec = await saveRecipe('Poulet-riz', [{ ing: chicken, grams: 200 }, { ing: rice, grams: 150 }])

  const { added, missing } = await applyRecipe(rec.id, '2026-06-10')
  ok(added === 2 && missing.length === 0, '2 entrées ajoutées, 0 manquante')

  const entries = await loadDayEntries('2026-06-10')
  ok(entries.length === 2, 'journal du jour = 2 entrées (append)')
  const poulet = entries.find((e) => e.sourceId === chicken.id)
  ok(poulet.kcal === 240 && poulet.protein === 46 && poulet.fat === 5.2, 'macros FIGÉES à l\'application (D1) : poulet 200 g = 240 kcal')
  ok(poulet.sourceType === 'ingredient' && poulet.gi === 'low', 'sourceType (D2) + IG copié (D5)')
  ok(isUuid(poulet.id) && typeof poulet.loggedAt === 'number', 'entrée = UUID + loggedAt (D10/D12)')

  // Rappel ×2 = APPEND (jamais remplacement) → 4 entrées.
  await applyRecipe(rec.id, '2026-06-10')
  ok((await loadDayEntries('2026-06-10')).length === 4, 'rappel ×2 → append (4 entrées, jamais remplacement)')

  // Formule VIVANTE : on renomme l'ingrédient → un nouveau rappel fige le NOUVEAU nom.
  await updateIngredient(chicken.id, { name: 'Blanc de poulet' })
  await applyRecipe(rec.id, '2026-06-11')
  const e11 = (await loadDayEntries('2026-06-11')).find((e) => e.sourceId === chicken.id)
  ok(e11.nameSnapshot === 'Blanc de poulet', 'formule vivante : rappel après renommage → nom COURANT figé dans la nouvelle entrée')
}

// ── R3 — applyRecipe DÉGRADÉ : 1 ligne morte → sautée + avertie ────
async function r3_apply_one_dead() {
  console.log('\n— R3 : applyRecipe dégradé (1 ligne morte) —')
  await wipeAll()
  await db.open()
  const chicken = await addIngredient(CHICKEN)
  const rice = await addIngredient(RICE)
  const rec = await saveRecipe('Poulet-riz', [{ ing: chicken, grams: 200 }, { ing: rice, grams: 150 }])

  // Le riz disparaît de la biblio (la recette garde sa référence + nameSnapshot).
  await deleteIngredient(rice.id)
  const { added, missing } = await applyRecipe(rec.id, '2026-06-12')
  ok(added === 1 && missing.length === 1, '1 entrée ajoutée (poulet), 1 ligne sautée (riz)')
  ok(missing[0] === 'Riz', 'ligne morte remontée par nameSnapshot (fallback)')
  const entries = await loadDayEntries('2026-06-12')
  ok(entries.length === 1 && entries[0].sourceId === chicken.id, 'seule la ligne résolue est écrite (poulet), pas la morte')
}

// ── R4 — applyRecipe TOUTES lignes mortes → 0 entrée, pas de repas vide ──
async function r4_apply_all_dead() {
  console.log('\n— R4 : applyRecipe toutes lignes mortes (0 entrée) —')
  await wipeAll()
  await db.open()
  const chicken = await addIngredient(CHICKEN)
  const rice = await addIngredient(RICE)
  const rec = await saveRecipe('Poulet-riz', [{ ing: chicken, grams: 200 }, { ing: rice, grams: 150 }])

  // Les DEUX ingrédients disparaissent.
  await deleteIngredient(chicken.id)
  await deleteIngredient(rice.id)
  const { added, missing } = await applyRecipe(rec.id, '2026-06-13')
  ok(added === 0, 'AUCUNE entrée écrite (pas de repas vide)')
  ok(missing.length === 2, 'les 2 lignes mortes remontées')
  ok((await loadDayEntries('2026-06-13')).length === 0, 'journal du jour vide (rien n\'a fui)')
}

// ── R5 — renommage / suppression ───────────────────────────────────
async function r5_rename_delete() {
  console.log('\n— R5 : renameRecipe / deleteRecipe —')
  await wipeAll()
  await db.open()
  const chicken = await addIngredient(CHICKEN)
  const rec = await saveRecipe('Brouillon', [{ ing: chicken, grams: 100 }])

  await renameRecipe(rec.id, 'Plat du dimanche')
  ok((await db.recipes.get(rec.id)).name === 'Plat du dimanche', 'renommage appliqué')
  let threw = false
  try { await renameRecipe(rec.id, '  ') } catch { threw = true }
  ok(threw, 'renommage vide → throw')
  ok((await db.recipes.get(rec.id)).name === 'Plat du dimanche', 'renommage invalide rejeté → nom intact')

  await deleteRecipe(rec.id)
  ok((await loadRecipes()).length === 0, 'suppression → 0 recette')
}

async function run() {
  r0_pure()
  await r1_save()
  await r2_apply_nominal()
  await r3_apply_one_dead()
  await r4_apply_all_dead()
  await r5_rename_delete()
  await wipeAll()
  console.log(exitCode === 0 ? '\n✅ recipes: toutes les assertions passent' : '\n❌ recipes: échec')
  process.exit(exitCode)
}
run()
