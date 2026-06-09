// Test nutrition (node + fake-indexeddb, sans navigateur).
// Prouve : calcul de portion pur (valeur = /100g × g ÷ 100), totaux, validation
// (sucres ⊂ glucides), catégories dynamiques, composition → N journalEntries avec
// MACROS FIGÉES (D1) + sourceType (D2) + IG copié (D5) + UUID/updatedAt (D10/D11),
// regrammage qui rescale le SNAPSHOT (pas l'ingrédient — prouvé ingrédient supprimé),
// et le SEED bibliothèque gardé par le FLAG librarySeededV1 (part sur device déjà
// initialisé, idempotent, indépendant de « table vide »).
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { db, SETTINGS_KEY, nowMs } from '../src/db.js'
import {
  lineMacros,
  composeTotals,
  regramMacros,
  validateIngredient,
  distinctCategories,
  saveMeal,
  loadDayEntries,
  updateEntryGrams,
  deleteEntry,
  addIngredient,
  deleteIngredient,
} from '../src/lib/nutrition.js'
import { seedLibraryIfNeeded } from '../src/seed.js'
import { INGREDIENTS_SEED } from '../src/data/ingredientsSeed.js'

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

const RICE = { id: 'riz', name: 'Riz', category: 'féculents', kcal100: 130, protein100: 2.7, carb100: 28, sugarsSimple100: 0.1, fat100: 0.3, gi: 'high' }
const CHICKEN = { id: 'poulet', name: 'Poulet', category: 'protéines', kcal100: 120, protein100: 23, carb100: 0, sugarsSimple100: 0, fat100: 2.6, gi: 'low' }

// ── M — calcul de portion pur ──────────────────────────────────────
function m_pure() {
  console.log('\n— M : lineMacros / composeTotals / regram (purs) —')
  const r = lineMacros(RICE, 150)
  ok(r.kcal === 195, 'riz 150 g → 195 kcal (130×1,5)')
  ok(r.protein === 4.1, 'riz 150 g → 4,1 g prot (2,7×1,5, arrondi 0,1)')
  ok(r.carb === 42 && r.sugarsSimple === 0.2 && r.fat === 0.5, 'riz 150 g → G42 / sucres0,2 / L0,5')

  const c = lineMacros(CHICKEN, 200)
  ok(c.kcal === 240 && c.protein === 46 && c.fat === 5.2, 'poulet 200 g → 240 kcal / 46 P / 5,2 L')

  const t = composeTotals([{ ing: CHICKEN, grams: 200 }, { ing: RICE, grams: 150 }])
  ok(t.kcal === 435 && t.protein === 50.1 && t.carb === 42 && t.fat === 5.7, 'totaux plat = somme exacte (435 kcal, 50,1 P, 42 G, 5,7 L)')
  ok(composeTotals([]).kcal === 0, 'plat vide → 0 (jamais NaN)')

  const rg = regramMacros({ grams: 200, kcal: 240, protein: 46, carb: 0, sugarsSimple: 0, fat: 5.2 }, 100)
  ok(rg.kcal === 120 && rg.protein === 23 && rg.fat === 2.6, 'regram 200→100 g = ÷2 du snapshot')
  ok(regramMacros({ grams: 0, kcal: 5 }, 100).kcal === 0, 'regram garde-fou grams=0 → 0')
}

// ── V — validation ─────────────────────────────────────────────────
function v_validate() {
  console.log('\n— V : validateIngredient —')
  ok(validateIngredient({ name: 'X', category: 'féculents', kcal100: 100, protein100: 1, carb100: 20, sugarsSimple100: 5, fat100: 1, gi: 'low' }).ok, 'ingrédient valide → ok')
  ok(!validateIngredient({ name: '', category: 'x', kcal100: 1, protein100: 1, carb100: 1, sugarsSimple100: 0, fat100: 1, gi: 'low' }).ok, 'nom vide → refus')
  ok(!validateIngredient({ name: 'X', category: 'x', kcal100: 1, protein100: 1, carb100: 5, sugarsSimple100: 9, fat100: 1, gi: 'low' }).ok, 'sucres > glucides → refus (sous-ensemble)')
  ok(!validateIngredient({ name: 'X', category: 'x', kcal100: 1, protein100: -1, carb100: 5, sugarsSimple100: 0, fat100: 1, gi: 'low' }).ok, 'valeur négative → refus')
  ok(!validateIngredient({ name: 'X', category: 'x', kcal100: 1, protein100: 1, carb100: 5, sugarsSimple100: 0, fat100: 1, gi: 'bof' }).ok, 'IG hors low/mid/high → refus')
}

// ── C — catégories dynamiques ──────────────────────────────────────
function c_categories() {
  console.log('\n— C : distinctCategories —')
  const cats = distinctCategories([
    { category: 'aromates' },
    { category: 'féculents' },
    { category: 'zzz-custom' },
    { category: 'fruits' },
  ])
  ok(cats[0] === 'féculents' && cats.indexOf('fruits') < cats.indexOf('aromates'), 'connues dans l\'ordre stable (féculents avant fruits avant aromates)')
  ok(cats[cats.length - 1] === 'zzz-custom', 'catégorie inconnue (custom) rejetée en fin')
}

// ── S — composition → journalEntries (snapshot D1) ─────────────────
async function s_saveMeal() {
  console.log('\n— S : saveMeal → journalEntries figés —')
  await wipeAll()
  await db.open()

  const n = await saveMeal([{ ing: CHICKEN, grams: 200 }, { ing: RICE, grams: 150 }], '2026-06-09')
  ok(n === 2, '2 lignes → 2 entrées écrites')

  const entries = await loadDayEntries('2026-06-09')
  ok(entries.length === 2, 'journal du jour = 2 entrées')
  const poulet = entries.find((e) => e.sourceId === 'poulet')
  ok(poulet.sourceType === 'ingredient', 'sourceType = ingredient (D2)')
  ok(poulet.nameSnapshot === 'Poulet' && poulet.grams === 200, 'nameSnapshot + grams figés')
  ok(poulet.kcal === 240 && poulet.protein === 46 && poulet.fat === 5.2, 'macros figées (snapshot D1)')
  ok(poulet.gi === 'low', 'IG copié (D5)')
  ok(isUuid(poulet.id) && typeof poulet.updatedAt === 'number' && typeof poulet.loggedAt === 'number', 'UUID + updatedAt + loggedAt (D10/D11/D12)')

  // Regrammage : rescale le SNAPSHOT, PAS l'ingrédient. Preuve : on insère
  // l'ingrédient en base puis on le SUPPRIME → le regram doit quand même marcher.
  await addIngredient({ name: 'Poulet', category: 'protéines', kcal100: 120, protein100: 23, carb100: 0, sugarsSimple100: 0, fat100: 2.6, gi: 'low' })
  const fakeIng = (await db.ingredients.toArray()).find((i) => i.name === 'Poulet')
  await deleteIngredient(fakeIng.id)
  await updateEntryGrams(poulet.id, 100)
  const regrammed = await db.journalEntries.get(poulet.id)
  ok(regrammed.grams === 100 && regrammed.kcal === 120 && regrammed.protein === 23, 'regram 200→100 g = ÷2 du snapshot (ingrédient supprimé : aucune relecture)')

  await deleteEntry(poulet.id)
  ok((await loadDayEntries('2026-06-09')).length === 1, 'suppression d\'une entrée → 1 restante')

  // Point 4 — validation aussi à l'ÉDITION (pas seulement à la création).
  await addIngredient({ name: 'Edit me', category: 'légumes', kcal100: 20, protein100: 1, carb100: 5, sugarsSimple100: 1, fat100: 0, gi: 'low' })
  const em = (await db.ingredients.toArray()).find((i) => i.name === 'Edit me')
  let editThrew = false
  try {
    await updateIngredient(em.id, { sugarsSimple100: 9 }) // 9 > carb 5
  } catch {
    editThrew = true
  }
  ok(editThrew, 'updateIngredient VALIDE à l\'édition : sucres 9 > glucides 5 → refus')
  ok((await db.ingredients.get(em.id)).sugarsSimple100 === 1, 'édition invalide rejetée → valeur d\'origine intacte')
}

// ── L — seed bibliothèque gardé par flag librarySeededV1 ───────────
async function l_seedLibrary() {
  console.log('\n— L : seedLibraryIfNeeded (flag librarySeededV1) —')
  await wipeAll()
  await db.open()

  // Simule un DEVICE DÉJÀ INITIALISÉ : settings existe (donc seedIfEmpty
  // s'abstiendrait), SANS le flag, et 0 ingrédient.
  await db.settings.put({ id: SETTINGS_KEY, profile: null, librarySeededV1: undefined, updatedAt: nowMs() })
  ok((await db.ingredients.count()) === 0, 'pré-état : 0 ingrédient (device déjà initialisé, biblio absente)')

  await seedLibraryIfNeeded()
  ok((await db.ingredients.count()) === INGREDIENTS_SEED.length, `seed parti via le flag → ${INGREDIENTS_SEED.length} ingrédients (≠ garde settings.count)`)
  const s = await db.settings.get(SETTINGS_KEY)
  ok(s.librarySeededV1 === true, 'flag librarySeededV1 posé')
  // Le seed garde ses ids SLUG stables (déterministes, identiques sur tout device →
  // mieux que des UUID aléatoires pour de la donnée de référence). createdAt estampillé
  // à l'insertion (null dans le fichier), updatedAt posé par newRow().
  const riz = await db.ingredients.get('riz-blanc-cuit')
  ok(riz && typeof riz.createdAt === 'number' && typeof riz.updatedAt === 'number', 'ingrédient seed : id slug stable + createdAt estampillé + updatedAt')
  ok(riz.isCustom === false && riz.kcal100 === 130, 'valeurs seed intactes (isCustom false, kcal 130)')

  // Idempotence : 2ᵉ appel ne refait rien.
  await seedLibraryIfNeeded()
  ok((await db.ingredients.count()) === INGREDIENTS_SEED.length, 'idempotent : 2ᵉ appel ne re-seede pas')

  // Indépendance de « table vide » : on vide la biblio, le flag reste → pas de re-seed.
  await db.ingredients.clear()
  await seedLibraryIfNeeded()
  ok((await db.ingredients.count()) === 0, 'biblio vidée + flag posé → PAS de re-seed (≠ garde « table vide »)')

  // CEINTURE+BRETELLES (point 3) — MISFIRE du flag : biblio seedée + 1 édition,
  // puis le flag SAUTE → re-run. Doit NI throw (ConstraintError sur PK slug), NI
  // dupliquer, NI écraser l'ingrédient édité.
  await db.settings.put({ id: SETTINGS_KEY, profile: null, updatedAt: nowMs() }) // flag absent → re-seed propre
  await seedLibraryIfNeeded()
  ok((await db.ingredients.count()) === INGREDIENTS_SEED.length, 'pré-misfire : biblio re-seedée (58)')
  await db.ingredients.put({ ...(await db.ingredients.get('riz-blanc-cuit')), kcal100: 999 }) // user édite
  const sNow = await db.settings.get(SETTINGS_KEY)
  await db.settings.put({ ...sNow, librarySeededV1: undefined }) // le flag saute
  let bootThrew = false
  try {
    await seedLibraryIfNeeded()
  } catch {
    bootThrew = true
  }
  ok(!bootThrew, 'misfire flag : re-run ne THROW PAS (pas de ConstraintError → boot survit)')
  ok((await db.ingredients.count()) === INGREDIENTS_SEED.length, 'misfire flag : AUCUN doublon (toujours 58, ids manquants seuls)')
  ok((await db.ingredients.get('riz-blanc-cuit')).kcal100 === 999, 'misfire flag : ingrédient ÉDITÉ préservé (jamais réécrit au seed)')
}

async function run() {
  m_pure()
  v_validate()
  c_categories()
  await s_saveMeal()
  await l_seedLibrary()
  await wipeAll()
  console.log(exitCode === 0 ? '\n✅ nutrition: toutes les assertions passent' : '\n❌ nutrition: échec')
  process.exit(exitCode)
}
run()
