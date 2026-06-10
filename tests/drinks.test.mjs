// Test boissons (node + fake-indexeddb). D25. Prouve :
//  - MODÈLE portion : drinkEntryMacros × multiplicateur (kcal PORTÉ × count).
//  - INVARIANT DUR : le kcal d'une portion n'est JAMAIS 4P+4G+9L (alcool = 7 kcal/g)
//    → il survit au log ET au regram, jamais recalculé depuis les macros.
//  - alcoholKcal : résidu kcal−(4P+4G+9L) sur les seules entrées drink, ≥0, 0 sinon.
//  - DEUX AXES SÉPARÉS : spiritueux sec carb 0 → poids nul en compo IG ; bière gi
//    high MAIS sucres bas (frappe B pas A) ; cocktail sucres haut (frappe A).
//  - validateDrink (sucres ⊆ carb, ≥0, gi ∈ levels).
//  - SANITY SEED : 38 boissons, kcal ≈ 7·alcoholG + 4·(carb+protein) + 9·fat (attrape
//    une valeur aberrante fabriquée), sucres ⊆ carb, gi valide, ids uniques.
//  - I/O : logDrink écrit sourceType:'drink' ; seed gardé par flag (idempotent,
//    n'écrase pas une boisson éditée) ; round-trip export/import préserve la boisson.
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { db } from '../src/db.js'
import { drinkEntryMacros, alcoholKcal, validateDrink, logDrink, loadDrinks, updateDrink } from '../src/lib/drinks.js'
import { regramMacros } from '../src/lib/nutrition.js'
import { glycemicShares } from '../src/lib/glycemic.js'
import { DRINKS_SEED } from '../src/data/drinksSeed.js'
import { seedIfEmpty, seedDrinksIfNeeded } from '../src/seed.js'
import { exportAll, importBundle } from '../src/lib/backup.js'

let exitCode = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) exitCode = 1
}
const byId = (id) => DRINKS_SEED.find((d) => d.id === id)

async function wipeAll() {
  if (db.isOpen()) db.close()
  await Dexie.delete('fitnessRecomp')
}

// ── A — drinkEntryMacros (pur) : portion × multiplicateur ──────────
function a_macros() {
  console.log('\n— A : drinkEntryMacros (portion × count, kcal porté) —')
  const biere = byId('biere-blonde') // kcal 141, P 1.5, G 11, sucres 1, L 0
  const m1 = drinkEntryMacros(biere, 1)
  ok(m1.kcal === 141 && m1.carb === 11 && m1.protein === 1.5, '1 portion = valeurs de la boisson')
  const m2 = drinkEntryMacros(biere, 2)
  ok(m2.kcal === 282 && m2.carb === 22 && m2.protein === 3, '×2 = macros ET kcal doublés')
}

// ── B — INVARIANT DUR : kcal porté, JAMAIS 4P+4G+9L ────────────────
function b_invariant() {
  console.log('\n— B : INVARIANT kcal porté ≠ 4P+4G+9L (D25) —')
  const vodka = byId('vodka') // kcal 88, carb 0, P 0, L 0 → 100 % alcool
  const m = drinkEntryMacros(vodka, 1)
  const macroKcal = 4 * m.protein + 4 * m.carb + 9 * m.fat
  ok(macroKcal === 0, 'vodka : 4P+4G+9L = 0 (aucune macro)')
  ok(m.kcal === 88, '…mais kcal = 88 (porté tel quel, jamais 0)')
  ok(m.kcal !== macroKcal, 'kcal ≠ somme des macros (un recalcul perdrait les calories alcool)')
}

// ── C — alcoholKcal : résidu sur entrées drink uniquement ──────────
function c_alcohol() {
  console.log('\n— C : alcoholKcal (résidu kcal−macros, entrées drink) —')
  const vodka = drinkEntryMacros(byId('vodka'), 1) // 88 kcal, 0 macro
  const biere = drinkEntryMacros(byId('biere-blonde'), 1) // 141 kcal, P1.5 G11
  const dVodka = { sourceType: 'drink', ...vodka }
  const dBiere = { sourceType: 'drink', ...biere }
  const food = { sourceType: 'ingredient', kcal: 240, protein: 46, carb: 0, fat: 6 } // poulet
  ok(alcoholKcal([dVodka]) === 88, 'vodka seule → 88 kcal alcool (≈ 7·12,6)')
  // bière : résidu = 141 − (4·1,5 + 4·11) = 141 − 50 = 91 ≈ 7·13.
  ok(alcoholKcal([dBiere]) === 91, 'bière → 91 kcal non répartis (≈ 7·13)')
  ok(alcoholKcal([dVodka, dBiere]) === 179, 'somme sur plusieurs boissons')
  ok(alcoholKcal([food]) === 0, 'entrée ingrédient ignorée (0)')
  ok(alcoholKcal([dVodka, food]) === 88, 'mélange : seules les boissons comptent')
  ok(alcoholKcal([]) === 0, 'aucune boisson → 0 (ligne masquée)')
}

// ── D — DEUX AXES SÉPARÉS (sucres budget A / gi compo B) ───────────
function d_axes() {
  console.log('\n— D : axes séparés (sucres ≠ gi) —')
  const spirit = byId('whisky')
  ok(spirit.carb === 0 && spirit.gi === 'low', 'spiritueux sec : carb 0')
  // carb 0 → poids nul dans la composition IG (auto-neutre).
  const sharesSpirit = glycemicShares([{ carb: spirit.carb, gi: spirit.gi }])
  ok(sharesSpirit.totalCarb === 0 && sharesSpirit.highShare === 0, '…→ poids nul en composition IG')

  const biere = byId('biere-blonde')
  ok(biere.gi === 'high' && biere.sugarsSimple <= 2, 'bière : gi HAUT (compo B) mais sucres BAS (pas A)')
  const sharesBiere = glycemicShares([{ carb: biere.carb, gi: biere.gi }])
  ok(sharesBiere.highShare === 1, '…→ 100 % haut-IG dans la composition (frappe B)')

  const cocktail = byId('mojito')
  ok(cocktail.sugarsSimple >= 12 && cocktail.gi === 'high', 'cocktail : sucres ÉLEVÉS (frappe A) + gi haut')
}

// ── E — validateDrink ──────────────────────────────────────────────
function e_validate() {
  console.log('\n— E : validateDrink —')
  const base = { name: 'Test', category: 'vins', portionLabel: '12 cl', portionMl: 120, kcal: 90, protein: 0, carb: 3, sugarsSimple: 1, fat: 0, alcoholG: 11, gi: 'low' }
  ok(validateDrink(base).ok, 'boisson valide acceptée')
  ok(!validateDrink({ ...base, sugarsSimple: 5, carb: 3 }).ok, 'sucres > glucides rejeté')
  ok(!validateDrink({ ...base, kcal: -1 }).ok, 'valeur négative rejetée')
  ok(!validateDrink({ ...base, gi: 'extreme' }).ok, 'gi hors {low,mid,high} rejeté')
  ok(!validateDrink({ ...base, name: '  ' }).ok, 'nom vide rejeté')
}

// ── F — SANITY du seed (attrape une valeur fabriquée aberrante) ────
function f_seedSanity() {
  console.log('\n— F : sanity seed (38 boissons) —')
  ok(DRINKS_SEED.length === 38, '38 boissons')
  const ids = new Set(DRINKS_SEED.map((d) => d.id))
  ok(ids.size === 38, 'ids slug uniques')
  let allCohere = true
  let allSugars = true
  let allGi = true
  const LEVELS = new Set(['low', 'mid', 'high'])
  for (const d of DRINKS_SEED) {
    const expected = 7 * d.alcoholG + 4 * (d.carb + d.protein) + 9 * d.fat
    if (Math.abs(d.kcal - expected) > 10) {
      allCohere = false
      console.log(`   ⚠ ${d.id} : kcal ${d.kcal} ≠ ~${Math.round(expected)} (composition)`)
    }
    if (d.sugarsSimple > d.carb) allSugars = false
    if (!LEVELS.has(d.gi)) allGi = false
  }
  ok(allCohere, 'kcal ≈ 7·alcoholG + 4·(carb+protein) + 9·fat (±10) sur les 38')
  ok(allSugars, 'sucres simples ⊆ glucides sur les 38')
  ok(allGi, 'gi ∈ {low,mid,high} sur les 38')
}

// ── G — I/O : log, regram, seed flag, round-trip ──────────────────
async function g_io() {
  console.log('\n— G : I/O (log, regram, seed flag, export/import) —')
  await wipeAll()
  await db.open()
  await seedIfEmpty() // crée settings (prérequis du flag)

  // Seed boissons via flag.
  await seedDrinksIfNeeded()
  let n = await db.drinks.count()
  ok(n === 38, 'seedDrinksIfNeeded → 38 boissons')
  let s = await db.settings.get('singleton')
  ok(s.drinksSeededV1 === true, 'flag drinksSeededV1 posé')

  // Idempotent + n'écrase pas une édition.
  await updateDrink('vodka', { kcal: 999 }) // l'utilisateur édite (valeur absurde mais valide)
  await db.settings.update('singleton', { drinksSeededV1: false }) // force un re-run (misfire)
  await seedDrinksIfNeeded()
  n = await db.drinks.count()
  ok(n === 38, 'misfire flag : 0 doublon (insert-only-missing)')
  const vodka = await db.drinks.get('vodka')
  ok(vodka.kcal === 999, 'boisson éditée NON écrasée par le re-seed')
  await updateDrink('vodka', { kcal: 88 }) // remet propre

  // logDrink → 1 journalEntry sourceType:'drink', kcal porté.
  const before = await db.journalEntries.count()
  await logDrink(await db.drinks.get('biere-blonde'), 2)
  const ents = await db.journalEntries.toArray()
  ok(ents.length === before + 1, 'logDrink → 1 entrée de journal')
  const e = ents[ents.length - 1]
  ok(e.sourceType === 'drink' && e.sourceId === 'biere-blonde', 'entrée sourceType:drink + sourceId (D2)')
  ok(e.kcal === 282 && e.carb === 22, '×2 figé (kcal porté = 282, pas recalculé)')
  ok(/\(33 cl\)/.test(e.nameSnapshot), 'nom d’entrée porte la portion (champ d’édition interprétable)')
  ok(e.grams === 660, 'grams = portionMl × count (ml ≈ g, regram-able)')

  // Regram : le kcal scale depuis le SNAPSHOT stocké, jamais recalculé des macros.
  const half = regramMacros(e, 330) // moitié
  ok(half.kcal === 141, 'regram ÷2 : kcal 141 (scale du stocké, pas 4P+4G+9L)')

  // Round-trip export/import (D7) : la boisson loguée + la base survivent.
  const bundle = await exportAll()
  ok(bundle.data.drinks.length === 38, 'export contient les 38 boissons (TABLES/D7)')
  ok(bundle.data.journalEntries.some((x) => x.sourceType === 'drink'), 'export contient l’entrée boisson')
  await importBundle(bundle, { replace: true })
  ok((await db.drinks.count()) === 38, 'import : 38 boissons restaurées')
  const drinkEntries = (await db.journalEntries.toArray()).filter((x) => x.sourceType === 'drink')
  ok(drinkEntries.length === 1 && drinkEntries[0].kcal === 282, 'import : entrée boisson préservée (kcal porté)')

  await loadDrinks() // smoke du tri (ne throw pas)
}

async function run() {
  a_macros()
  b_invariant()
  c_alcohol()
  d_axes()
  e_validate()
  f_seedSanity()
  await g_io()
  console.log(`\n${exitCode === 0 ? 'ALL PASS' : 'SOME FAIL'}`)
  process.exit(exitCode)
}
run()
