// Test de migration schéma v1 → v2 (node + fake-indexeddb, sans navigateur).
// Prouve : idempotence (boot 2×), backup créé AVANT delete, wipe+reseed live,
// export v2 valide, round-trip import→ré-export, remap FK + drop orphelines.
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { db, TABLES, SETTINGS_KEY } from '../src/db.js'
import { seedIfEmpty } from '../src/seed.js'
import { migrateLegacyIfNeeded, transformV1toV2, getMigrationBackups } from '../src/lib/migrate.js'
import { importBundle, exportAll } from '../src/lib/backup.js'

let exitCode = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) exitCode = 1
}
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)

const V1_STORES = {
  ingredients: '++id, name, category',
  journalEntries: '++id, date, [date+sourceType], sourceId',
  weightLogs: '++id, date, datetime',
  workouts: '++id, date',
  sets: '++id, workoutId, exercise, [exercise+date]',
  tickerConfigs: '++id, order',
  tickerStates: '++id, [tickerId+date], date',
  drinks: '++id, name, category',
  settings: '++id',
}

// Schéma v2 EXACT (PK string UUID) — doit refléter db.js version(2).stores().
// Sert à fabriquer une base v2 réelle pour prouver l'upgrade additif v2→v3.
const V2_STORES = {
  ingredients: 'id, name, category',
  journalEntries: 'id, date, [date+sourceType], sourceId',
  weightLogs: 'id, date, datetime',
  workouts: 'id, date',
  sets: 'id, workoutId, exercise, [exercise+date]',
  tickerConfigs: 'id, order',
  tickerStates: 'id, [tickerId+date], date',
  drinks: 'id, name, category',
  settings: 'id',
}

// Schéma v3 EXACT = v2 + dailyExpenditure. Sert à fabriquer une base v3 réelle
// pour prouver l'upgrade additif v3→v4 (ajout de dailyIntake, données préservées).
const V3_STORES = {
  ...V2_STORES,
  dailyExpenditure: 'id, &date',
}

// Schéma v4 EXACT = v3 + dailyIntake. Sert à fabriquer une base v4 réelle pour
// prouver l'upgrade additif v4→v5 (ajout de recipes, données préservées).
const V4_STORES = {
  ...V3_STORES,
  dailyIntake: 'id, &date',
}

async function wipeAll() {
  if (db.isOpen()) db.close()
  await Dexie.delete('fitnessRecomp')
  await Dexie.delete('fitnessRecompBackups')
}

// ── S1 — Fresh install + idempotence du seed (boot 2×) ─────────────
async function s1_fresh() {
  console.log('\n— S1 : fresh install —')
  await wipeAll()
  const r = await migrateLegacyIfNeeded()
  ok(r.migrated === false && r.reason === 'fresh-install', 'migrate no-op sur base absente')
  await db.open()
  await seedIfEmpty()
  await seedIfEmpty() // boot 2× → idempotent
  const settings = await db.settings.get(SETTINGS_KEY)
  ok(!!settings, "settings lisible via clé sentinelle 'singleton'")
  ok(typeof settings.updatedAt === 'number', 'settings.updatedAt présent')
  ok((await db.settings.count()) === 1, 'seed idempotent : 1 settings après 2 boots')
  const tickers = await db.tickerConfigs.toArray()
  ok(tickers.length === 4, 'seed idempotent : 4 tickers')
  ok(tickers.every((t) => isUuid(t.id) && typeof t.updatedAt === 'number'), 'tickers : id UUID + updatedAt')
}

// ── S2 — Base legacy v1 → backup AVANT delete → wipe+reseed → idempotent ──
async function s2_legacy() {
  console.log('\n— S2 : migration legacy v1 (wipe + reseed) —')
  await wipeAll()
  // construire une base v1 avec des FK réelles
  const v1 = new Dexie('fitnessRecomp')
  v1.version(1).stores(V1_STORES)
  await v1.open()
  const tcId = await v1.tickerConfigs.add({ label: 'Eau', type: 'counter', target: 8, order: 1, active: true })
  await v1.tickerStates.add({ tickerId: tcId, date: '2026-06-09', value: 3 })
  const wId = await v1.workouts.add({ date: '2026-06-08', name: 'Push' })
  await v1.sets.add({ workoutId: wId, exercise: 'Bench', setIndex: 1, reps: 8, weightKg: 60, date: '2026-06-08' })
  await v1.settings.add({ targetKcal: 9999 }) // valeur perso bidon
  await v1.close()

  const r = await migrateLegacyIfNeeded()
  ok(r.migrated === true && r.reason === 'wiped-and-reseeded', 'legacy v1 détectée → wipe+reseed')

  const backups = await getMigrationBackups()
  ok(backups.length === 1, 'backup de migration créé')
  ok(backups[0].payload.schemaVersion === 1, 'backup marqué schemaVersion 1')
  ok((backups[0].payload.data.tickerStates || []).length === 1, 'backup contient les données legacy (tickerStates)')
  ok((await Dexie.exists('fitnessRecomp')) === false, 'base principale supprimée après backup')

  // suite du boot : recrée v2 + reseed
  await db.open()
  await seedIfEmpty()
  const settings = await db.settings.get(SETTINGS_KEY)
  // Reseed (Tâche 2) : plus de cibles seedées en dur → settings frais = profil null,
  // source 'fallback', sucres 20 ; surtout PAS la valeur perso legacy (9999).
  ok(
    settings &&
      settings.targetKcal !== 9999 &&
      settings.profile === null &&
      settings.targetsSource === 'fallback' &&
      settings.targetSugarsSimple === 20,
    'RESEED (pas transform) : settings = seed frais (profil null, fallback), pas la valeur legacy 9999',
  )
  ok((await db.tickerConfigs.count()) === 4, 'reseed : 4 tickers (pas le 1 legacy)')
  ok((await db.tickerStates.count()) === 0, 'reseed : tickerStates vide (données legacy non transférées en live)')

  // idempotence : 2e passage ne re-wipe pas, ne re-backup pas
  if (db.isOpen()) db.close()
  const r2 = await migrateLegacyIfNeeded()
  ok(r2.migrated === false && r2.reason === 'already-current', 'boot 2× : déjà v2 → no-op')
  ok((await getMigrationBackups()).length === 1, 'boot 2× : pas de backup en double')
}

// ── S3 — transformV1toV2 (import) : remap FK + drop orphelines ──────
function s3_transform() {
  console.log('\n— S3 : transformV1toV2 (chemin import) —')
  const NOW = 1_700_000_000_000
  const v1data = {
    ingredients: [{ id: 10, name: 'Riz', kcal100: 130, createdAt: 1 }],
    drinks: [{ id: 20, name: 'Bière', category: 'biere', kcal: 150 }],
    workouts: [{ id: 30, date: '2026-06-08', name: 'Push' }],
    tickerConfigs: [{ id: 40, label: 'Eau', type: 'counter', target: 8, order: 1 }],
    weightLogs: [{ id: 50, date: '2026-06-09', datetime: 1, weightKg: 78 }],
    settings: [{ id: 1, targetKcal: 2100 }],
    sets: [
      { id: 60, workoutId: 30, exercise: 'Bench', reps: 8 }, // OK
      { id: 61, workoutId: 999, exercise: 'Orphan', reps: 5 }, // ORPHELIN
    ],
    tickerStates: [
      { id: 70, tickerId: 40, date: '2026-06-09', value: 3 }, // OK
      { id: 71, tickerId: 999, date: '2026-06-09', value: 1 }, // ORPHELIN
    ],
    journalEntries: [
      { id: 80, date: '2026-06-09', sourceType: 'ingredient', sourceId: 10, grams: 150, createdAt: 5 }, // OK
      { id: 81, date: '2026-06-09', sourceType: 'drink', sourceId: 20, grams: null }, // OK (drink)
      { id: 82, date: '2026-06-09', sourceType: 'ingredient', sourceId: 999 }, // ORPHELIN
    ],
  }
  const { data, dropped } = transformV1toV2(v1data, NOW)

  ok(data.ingredients.every((r) => isUuid(r.id)), 'ingredients : PK en UUID')
  ok(data.settings[0].id === SETTINGS_KEY, "settings repointé sur 'singleton'")
  ok(data.ingredients.every((r) => typeof r.updatedAt === 'number'), 'updatedAt partout')
  ok(data.ingredients[0].updatedAt === 1, 'updatedAt = createdAt si présent (1)')
  ok(data.journalEntries.every((r) => typeof r.loggedAt === 'number'), 'loggedAt sur journalEntries')

  // remap FK : la série non-orpheline pointe vers le NOUVEL uuid du workout
  const newWorkoutId = data.workouts[0].id
  ok(data.sets.length === 1 && data.sets[0].workoutId === newWorkoutId, 'set.workoutId remappé vers UUID workout')
  const newTickerId = data.tickerConfigs[0].id
  ok(data.tickerStates.length === 1 && data.tickerStates[0].tickerId === newTickerId, 'tickerState.tickerId remappé')
  const newIngId = data.ingredients[0].id
  const newDrinkId = data.drinks[0].id
  const je = data.journalEntries
  ok(je.length === 2, '1 journalEntry orpheline droppée (reste 2)')
  ok(je.find((e) => e.sourceType === 'ingredient').sourceId === newIngId, 'journalEntry(ingredient).sourceId remappé')
  ok(je.find((e) => e.sourceType === 'drink').sourceId === newDrinkId, 'journalEntry(drink).sourceId remappé (bonne table)')

  ok(dropped.sets === 1 && dropped.tickerStates === 1 && dropped.journalEntries === 1, 'orphelines comptées (1/1/1)')
  return v1data
}

// ── S4 — Round-trip : import v1 → DB → export v2 → ré-import → identique ──
async function s4_roundtrip(v1data) {
  console.log('\n— S4 : round-trip import/export —')
  await wipeAll()
  await db.open()

  const bundleV1 = { app: 'fitness-recomp', schemaVersion: 1, data: v1data }
  const res = await importBundle(bundleV1, { replace: true })
  ok(res.droppedTotal === 3, 'import v1 : 3 orphelines ignorées remontées')

  // FK intactes en base après import
  const states = await db.tickerStates.toArray()
  const cfg = await db.tickerConfigs.where('order').equals(1).first()
  ok(states.length === 1 && states[0].tickerId === cfg.id, 'en base : tickerState pointe vers son ticker (FK intacte)')

  const exp1 = await exportAll()
  ok(exp1.schemaVersion === 2, 'export post-import = schemaVersion 2')

  // ré-import du bundle v2 (chemin sans transform, bulkPut préserve updatedAt)
  await importBundle(exp1, { replace: true })
  const exp2 = await exportAll()

  const norm = (e) =>
    JSON.stringify(
      Object.fromEntries(TABLES.map((t) => [t, [...e.data[t]].sort((a, b) => a.id.localeCompare(b.id))])),
    )
  ok(norm(exp1) === norm(exp2), 'round-trip stable : ré-export identique (updatedAt préservé)')
}

// ── S5 — Base v2 RÉELLE → bump v3 = upgrade ADDITIF (PAS de wipe) ───
// Garde-fou anti-perte de données : un device en v2 (vraies données) ne doit
// JAMAIS être wipé par le bump Tâche 4. Dexie ajoute le store dailyExpenditure
// et préserve tout le reste.
async function s5_v2_to_v3() {
  console.log('\n— S5 : upgrade additif v2 → v3 (préservation des données) —')
  await wipeAll()

  // Fabrique une base v2 réelle (PK UUID, version Dexie 2) avec des données.
  const v2 = new Dexie('fitnessRecomp')
  v2.version(2).stores(V2_STORES)
  await v2.open()
  ok(v2.verno === 2, 'base fabriquée en version Dexie 2')
  await v2.weightLogs.add({ id: crypto.randomUUID(), date: '2026-06-09', datetime: 1, weightKg: 77, updatedAt: Date.now() })
  await v2.settings.add({ id: SETTINGS_KEY, profile: null, targetsSource: 'fallback', targetSugarsSimple: 20, updatedAt: Date.now() })
  v2.close()

  // migrate ne doit PAS wiper : v2 ≥ FIRST_UUID → 'dexie-upgrade'.
  const r = await migrateLegacyIfNeeded()
  ok(r.migrated === false && r.reason === 'dexie-upgrade', 'base v2 → PAS de wipe (upgrade additif Dexie)')
  ok((await Dexie.exists('fitnessRecomp')) === true, 'base conservée (jamais supprimée)')
  ok((await getMigrationBackups()).length === 0, 'aucun backup de wipe créé (rien à sauver, rien wipé)')

  // db.open() applique version(3) → ajoute le store, préserve les données.
  await db.open()
  ok(db.verno >= 3, 'base montée en version Dexie ≥ 3')
  ok((await db.weightLogs.count()) === 1, 'DONNÉES PRÉSERVÉES : la pesée v2 survit à l\'upgrade')
  const s = await db.settings.get(SETTINGS_KEY)
  ok(!!s && s.targetSugarsSimple === 20, 'DONNÉES PRÉSERVÉES : settings v2 intacts')
  ok((await db.dailyExpenditure.count()) === 0, 'nouveau store dailyExpenditure créé et vide')
  if (db.isOpen()) db.close()
}

// ── S6 — Tolérance de l'import (ce qui AUTORISE à figer SCHEMA_VERSION à 2) ──
// Le corollaire D16 « SCHEMA_VERSION reste 2 » n'est sûr que si l'importeur
// tolère un bundle v2 sans la nouvelle table ET ignore une table inconnue. On
// le PROUVE plutôt que de l'affirmer.
async function s6_import_tolerance() {
  console.log('\n— S6 : tolérance import (SCHEMA_VERSION figé à 2) —')
  await wipeAll()
  await db.open()

  // Pré-état : une dépense déjà en base → le replace doit la VIDER (bundle sans table).
  await db.dailyExpenditure.add({ id: crypto.randomUUID(), date: '2026-06-09', kcal: 2500, updatedAt: Date.now() })
  ok((await db.dailyExpenditure.count()) === 1, 'pré-état : 1 dépense en base')

  // Bundle v2 (schemaVersion 2) SANS dailyExpenditure + AVEC une table inconnue.
  const bundle = {
    app: 'fitness-recomp',
    schemaVersion: 2,
    data: {
      settings: [{ id: SETTINGS_KEY, profile: null, targetsSource: 'fallback', targetSugarsSimple: 20, updatedAt: 1 }],
      weightLogs: [{ id: crypto.randomUUID(), date: '2026-06-01', datetime: 1, weightKg: 79, updatedAt: 1 }],
      futureUnknownTable: [{ id: 'x', foo: 1 }], // hors TABLES → doit être ignorée
    },
  }

  let threw = false
  try {
    await importBundle(bundle, { replace: true })
  } catch {
    threw = true
  }
  ok(!threw, 'import bundle v2 sans dailyExpenditure + table inconnue → AUCUN throw')
  ok((await db.dailyExpenditure.count()) === 0, 'dailyExpenditure VIDÉE par le replace (table absente du bundle)')
  ok((await db.weightLogs.count()) === 1, 'tables présentes bien importées (weightLogs)')
  ok((await db.settings.get(SETTINGS_KEY))?.targetSugarsSimple === 20, 'settings importé')
  ok(!db.tables.some((t) => t.name === 'futureUnknownTable'), 'table inconnue ignorée (jamais créée)')
  if (db.isOpen()) db.close()
}

// ── S7 — Base v3 RÉELLE → bump v4 = upgrade ADDITIF (PAS de wipe) ───
// Même garde-fou que S5, un cran plus loin (D17) : un device déjà en v3 (Tâche
// 4, avec dépense saisie) ne doit PAS être wipé par le bump « consommé rapide ».
// Dexie ajoute le store dailyIntake et préserve tout le reste.
async function s7_v3_to_v4() {
  console.log('\n— S7 : upgrade additif v3 → v4 (préservation des données) —')
  await wipeAll()

  // Fabrique une base v3 réelle (PK UUID, version Dexie 3) avec des données.
  const v3 = new Dexie('fitnessRecomp')
  v3.version(3).stores(V3_STORES)
  await v3.open()
  ok(v3.verno === 3, 'base fabriquée en version Dexie 3')
  await v3.settings.add({ id: SETTINGS_KEY, profile: null, targetsSource: 'fallback', targetSugarsSimple: 20, updatedAt: Date.now() })
  await v3.dailyExpenditure.add({ id: crypto.randomUUID(), date: '2026-06-09', kcal: 2500, updatedAt: Date.now() })
  v3.close()

  // migrate ne doit PAS wiper : v3 ≥ FIRST_UUID → 'dexie-upgrade'.
  const r = await migrateLegacyIfNeeded()
  ok(r.migrated === false && r.reason === 'dexie-upgrade', 'base v3 → PAS de wipe (upgrade additif Dexie)')
  ok((await getMigrationBackups()).length === 0, 'aucun backup de wipe créé (rien wipé)')

  // db.open() applique version(4) → ajoute dailyIntake, préserve les données.
  await db.open()
  ok(db.verno >= 4, 'base montée en version Dexie ≥ 4')
  ok((await db.dailyExpenditure.count()) === 1, 'DONNÉES PRÉSERVÉES : la dépense v3 survit à l\'upgrade')
  const s = await db.settings.get(SETTINGS_KEY)
  ok(!!s && s.targetSugarsSimple === 20, 'DONNÉES PRÉSERVÉES : settings v3 intacts')
  ok((await db.dailyIntake.count()) === 0, 'nouveau store dailyIntake créé et vide')
  if (db.isOpen()) db.close()
}

// ── S8 — Base v4 RÉELLE → bump v5 = upgrade ADDITIF (PAS de wipe) ───
// Même garde-fou que S5/S7, un cran plus loin (D19) : un device déjà en v4
// (Tâche 4.5, avec consommé saisi) ne doit PAS être wipé par le bump « recettes ».
// Dexie ajoute le store recipes et préserve tout le reste. PORTE DURE : ce test
// doit être VERT avant tout déploiement device.
async function s8_v4_to_v5() {
  console.log('\n— S8 : upgrade additif v4 → v5 (préservation des données) —')
  await wipeAll()

  // Fabrique une base v4 réelle (PK UUID, version Dexie 4) avec des données.
  const v4 = new Dexie('fitnessRecomp')
  v4.version(4).stores(V4_STORES)
  await v4.open()
  ok(v4.verno === 4, 'base fabriquée en version Dexie 4')
  await v4.settings.add({ id: SETTINGS_KEY, profile: null, targetsSource: 'fallback', targetSugarsSimple: 20, librarySeededV1: true, updatedAt: Date.now() })
  await v4.dailyIntake.add({ id: crypto.randomUUID(), date: '2026-06-10', kcal: 2100, updatedAt: Date.now() })
  await v4.journalEntries.add({ id: crypto.randomUUID(), date: '2026-06-10', sourceType: 'ingredient', sourceId: 'riz-blanc-cuit', nameSnapshot: 'Riz', grams: 150, kcal: 195, protein: 4.1, carb: 42, sugarsSimple: 0.2, fat: 0.5, gi: 'high', createdAt: Date.now(), loggedAt: Date.now(), updatedAt: Date.now() })
  v4.close()

  // migrate ne doit PAS wiper : v4 ≥ FIRST_UUID → 'dexie-upgrade'.
  const r = await migrateLegacyIfNeeded()
  ok(r.migrated === false && r.reason === 'dexie-upgrade', 'base v4 → PAS de wipe (upgrade additif Dexie)')
  ok((await getMigrationBackups()).length === 0, 'aucun backup de wipe créé (rien wipé)')

  // db.open() applique version(5) → ajoute recipes, préserve les données.
  await db.open()
  ok(db.verno >= 5, 'base montée en version Dexie ≥ 5')
  ok((await db.dailyIntake.count()) === 1, 'DONNÉES PRÉSERVÉES : le consommé v4 survit à l\'upgrade')
  ok((await db.journalEntries.count()) === 1, 'DONNÉES PRÉSERVÉES : le journal v4 survit à l\'upgrade')
  const s = await db.settings.get(SETTINGS_KEY)
  ok(!!s && s.targetSugarsSimple === 20 && s.librarySeededV1 === true, 'DONNÉES PRÉSERVÉES : settings v4 intacts (flag biblio inclus)')
  ok((await db.recipes.count()) === 0, 'nouveau store recipes créé et vide')
  if (db.isOpen()) db.close()
}

async function main() {
  await s1_fresh()
  await s2_legacy()
  const v1data = s3_transform()
  await s4_roundtrip(v1data)
  await s5_v2_to_v3()
  await s6_import_tolerance()
  await s7_v3_to_v4()
  await s8_v4_to_v5()
  if (db.isOpen()) db.close()
  console.log(`\n${exitCode === 0 ? 'TOUS LES TESTS PASSENT' : 'ÉCHECS DÉTECTÉS'}`)
  process.exit(exitCode)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
