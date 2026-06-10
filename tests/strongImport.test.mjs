// Test import CSV Strong (node + fake-indexeddb) — CALÉ SUR LA FIXTURE RÉELLE
// tests/fixtures/strong-export-reel.csv (1008 lignes, 28 séances). Prouve :
// parsing (FR), filtre structurel (Minuteur compté par libellé), trim exos,
// coercition réps/poids, date SAFARI-SAFE, cardio capté, mapping EN + format
// inconnu, IDEMPOTENCE (double import = comptes identiques), règle effectiveTrained.
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { readFileSync } from 'node:fs'
import { db } from '../src/db.js'
import {
  parseStrongCsvText,
  detectColumns,
  strongDate,
  strongStartedAt,
  isSetOrder,
  classifyModality,
  toInt,
  isWarmupWorkout,
  importStrongText,
  StrongImportError,
} from '../src/lib/strongImport.js'
import { effectiveTrained } from '../src/lib/training.js'

let exitCode = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) exitCode = 1
}

// Fixture ancrée sur le fichier de test (portable, pas de chemin machine).
const FIXTURE = readFileSync(new URL('./fixtures/strong-export-reel.csv', import.meta.url), 'utf-8')

async function wipeAll() {
  if (db.isOpen()) db.close()
  await Dexie.delete('fitnessRecomp')
}

// ── P — Parsing de la fixture réelle ───────────────────────────────
function p_parse() {
  console.log('\n— P : parsing de la fixture réelle —')
  const { sessions, report } = parseStrongCsvText(FIXTURE)

  ok(report.sessions === 28, `28 séances détectées (got ${report.sessions})`)
  ok(report.sets === 504, `504 séries réelles (got ${report.sets})`)
  ok(sessions.length === 28, 'sessions[] = 28 entrées')

  // Filtre STRUCTUREL compté PAR LIBELLÉ : 504 « Minuteur de repos », rien d'autre.
  const labels = Object.keys(report.ignored)
  ok(labels.length === 1 && labels[0] === 'Minuteur de repos', `seul libellé ignoré = Minuteur de repos (got ${JSON.stringify(labels)})`)
  ok(report.ignored['Minuteur de repos'] === 504, `504 lignes Minuteur ignorées (got ${report.ignored['Minuteur de repos']})`)

  // Trim des noms d'exercices (espaces traînants réels dans le fichier).
  const allSets = sessions.flatMap((s) => s.sets)
  ok(allSets.every((s) => s.exercise === s.exercise.trim()), 'tous les exercices sont trimmés')
  ok(allSets.some((s) => s.exercise === 'Étirement'), "exercice 'Étirement ' → trimmé en 'Étirement'")

  // Coercition : réps entières, poids numériques (dont .5 réel).
  ok(allSets.every((s) => Number.isInteger(s.reps)), 'réps coercées en entiers (« 15.0 » → 15)')
  ok(allSets.every((s) => typeof s.weightKg === 'number' && Number.isFinite(s.weightKg)), 'poids numériques finis')
  ok(allSets.some((s) => s.weightKg % 1 === 0.5), 'décimales .5 préservées (poids)')

  // Identité de séance = timestamp Date → workout.date = jour, name trimmé.
  const warm = sessions.find((s) => isWarmupWorkout(s.workout.name))
  ok(!!warm && warm.workout.date === '2026-01-04', 'séance étirements seule = 2026-01-04')
  ok(sessions.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.workout.date)), 'workout.date = jour YYYY-MM-DD')
  ok(sessions.every((s) => s.workout.name === s.workout.name.trim()), 'noms de séance trimmés')

  // Cardio capté (pas jeté) : 19 séries cardio (Running 1 + Walking 4 + Cycling 10 + Rowing 4).
  ok(report.cardioSets === 19, `19 séries cardio captées (got ${report.cardioSets})`)
  const cardio = allSets.filter((s) => classifyModality(s.exercise) === 'cardio')
  ok(cardio.some((s) => s.distance > 0 || s.seconds > 0), 'distance/secondes captées sur le cardio')
}

// ── M — Mapping FR/EN + format inconnu ─────────────────────────────
function m_mapping() {
  console.log('\n— M : mapping FR/EN + format inconnu —')
  // FR : déjà prouvé par la fixture. EN : un petit export anglophone synthétique.
  const en = [
    'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,RPE',
    '2025-01-01 10:00:00,Morning,1h,Bench Press,1,60,8,0,0,,',
    '2025-01-01 10:00:00,Morning,1h,Bench Press,Rest Timer,0,0,0,90,,',
    '2025-01-01 10:00:00,Morning,1h,Bench Press,2,62.5,6,0,0,,',
  ].join('\n')
  const { sessions, report } = parseStrongCsvText(en)
  ok(report.sessions === 1 && report.sets === 2, 'EN : 1 séance, 2 séries (Rest Timer filtré)')
  ok(report.ignored['Rest Timer'] === 1, 'EN : libellé « Rest Timer » compté (filtre structurel, pas littéral FR)')
  ok(sessions[0].sets[1].weightKg === 62.5, 'EN : poids 62.5 lu')

  // Format inconnu (ni FR ni EN) → StrongImportError 'unknown-format', AVANT tout write.
  let err = null
  try {
    parseStrongCsvText('colA,colB\n1,2')
  } catch (e) {
    err = e
  }
  ok(err instanceof StrongImportError && err.code === 'unknown-format', 'en-têtes inconnus → StrongImportError unknown-format')

  // detectColumns repère les requis FR.
  const map = detectColumns(['Date', "Nom de l'entraînement", 'Durée', "Nom de l'exercice", 'Ordre de la série', 'Poids', 'Réps'])
  ok(map.setOrder === 'Ordre de la série' && map.weight === 'Poids', 'detectColumns mappe les en-têtes FR')
}

// ── D — Date SAFARI-SAFE (durcissement A, D22) ─────────────────────
function d_date() {
  console.log('\n— D : parsing date Safari-safe (par composants, jamais Date(raw)) —')
  ok(strongDate('2025-12-30 20:57:41') === '2025-12-30', 'strongDate = slice 10 premiers caractères')
  // Référence par COMPOSANTS (constructeur sûr sur tous moteurs).
  const expected = new Date(2025, 11, 30, 20, 57, 41).getTime()
  ok(strongStartedAt('2025-12-30 20:57:41') === expected, 'strongStartedAt = parse par composants (heure locale)')
  ok(Number.isFinite(strongStartedAt('2025-12-30 20:57:41')), 'startedAt est un nombre fini')
  ok(strongStartedAt('pas une date') === null, 'format inattendu → null (séance restant importable via date)')
  // isSetOrder : structurel.
  ok(isSetOrder('3') && !isSetOrder('Minuteur de repos') && !isSetOrder(' ') , 'isSetOrder : numérique uniquement')
  ok(toInt('15.0') === 15 && toInt('') === 0, 'toInt : « 15.0 » → 15, vide → 0')
}

// ── T — Règle effectiveTrained (réconciliation D21→D22, option C) ──
function t_trained() {
  console.log('\n— T : effectiveTrained (manuel OU séance importée réelle, étirements exclus) —')
  ok(effectiveTrained({ manualPresent: true, importedWorkouts: [] }) === true, 'manuel présent → trained')
  ok(effectiveTrained({ manualPresent: false, importedWorkouts: [] }) === false, 'rien → repos')
  ok(
    effectiveTrained({ manualPresent: false, importedWorkouts: [{ name: 'Entraînement du soir' }] }) === true,
    'séance importée réelle → trained',
  )
  ok(
    effectiveTrained({ manualPresent: false, importedWorkouts: [{ name: 'Échauffement / Étirements' }] }) === false,
    'séance étirements SEULE → PAS trained (option C)',
  )
  ok(
    effectiveTrained({ manualPresent: false, importedWorkouts: [{ name: 'Échauffement / Étirements ' }] }) === false,
    'denylist normalisée trim+casse',
  )
  ok(
    effectiveTrained({ manualPresent: true, importedWorkouts: [{ name: 'Échauffement / Étirements' }] }) === true,
    'manuel prime toujours (override)',
  )
}

// ── I — IDEMPOTENCE : double import de la fixture = comptes identiques ──
async function i_idempotence() {
  console.log('\n— I : idempotence (double import = 0 doublon) —')
  await wipeAll()
  await db.open()
  ok(db.tables.some((t) => t.name === 'workouts'), 'store workouts présent (v7)')

  const r1 = await importStrongText(FIXTURE)
  ok(r1.added === 28 && r1.skipped === 0, `1er import : 28 ajoutées / 0 ignorée (got ${r1.added}/${r1.skipped})`)
  ok(r1.setsAdded === 504, `1er import : 504 séries écrites (got ${r1.setsAdded})`)
  ok((await db.workouts.count()) === 28, '28 workouts en base')
  ok((await db.sets.count()) === 504, '504 sets en base')
  const w = await db.workouts.toArray()
  ok(w.every((x) => x.source === 'strong-import' && typeof x.strongKey === 'string'), 'workouts : source + strongKey présents')

  // Ré-import du MÊME fichier → dédup sur strongKey : rien ajouté, tout sauté.
  const r2 = await importStrongText(FIXTURE)
  ok(r2.added === 0 && r2.skipped === 28, `2e import : 0 ajoutée / 28 ignorées (got ${r2.added}/${r2.skipped})`)
  ok((await db.workouts.count()) === 28, 'toujours 28 workouts (aucun doublon)')
  ok((await db.sets.count()) === 504, 'toujours 504 sets (aucun doublon)')

  if (db.isOpen()) db.close()
}

async function main() {
  p_parse()
  m_mapping()
  d_date()
  t_trained()
  await i_idempotence()
  if (db.isOpen()) db.close()
  console.log(`\n${exitCode === 0 ? 'TOUS LES TESTS PASSENT' : 'ÉCHECS DÉTECTÉS'}`)
  process.exit(exitCode)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
