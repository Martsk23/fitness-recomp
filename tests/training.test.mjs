// Test séance du jour (node + fake-indexeddb, sans navigateur).
// Prouve : PRÉSENCE = séance / ABSENCE = repos (D21) ; upsert idempotent (pas de
// doublon par date) ; untoggle = suppression de la ligne ; autre date indépendante ;
// double-write concurrent même date → 1 seule ligne (atomique + index unique &date).
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { db } from '../src/db.js'
import { loadTraining, setTraining, clearTraining } from '../src/lib/training.js'

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

async function t_states() {
  console.log('\n— T : séance keyée par date (présence = séance) —')
  await wipeAll()
  await db.open()

  const today = '2026-06-10'
  ok((await loadTraining(today)) === false, 'avant toute saisie : absence = repos (false)')

  await setTraining(true, today)
  ok((await loadTraining(today)) === true, 'setTraining(true) → séance (true)')
  ok((await db.trainingDays.count()) === 1, '1 ligne en base')
  const row = (await db.trainingDays.toArray())[0]
  ok(isUuid(row.id) && typeof row.updatedAt === 'number', 'ligne : id UUID + updatedAt (D10/D11)')
  ok(!('trained' in row), 'aucun booléen stocké : la PRÉSENCE est le signal')

  // Idempotence : re-marquer le même jour ne crée pas de doublon.
  await setTraining(true, today)
  ok((await loadTraining(today)) === true && (await db.trainingDays.count()) === 1, 're-marquage même jour = 1 seule ligne')

  // Untoggle = suppression → retour à repos (absence = non saisi).
  await setTraining(false, today)
  ok(
    (await loadTraining(today)) === false && (await db.trainingDays.where('date').equals(today).count()) === 0,
    'setTraining(false) → repos + ligne du jour supprimée',
  )

  // clearTraining quand absent → no-op (pas de throw).
  let threw = false
  try {
    await clearTraining(today)
  } catch {
    threw = true
  }
  ok(!threw && (await loadTraining(today)) === false, 'clearTraining sur jour vierge → no-op')

  // Autre date indépendante (pas de fuite).
  await setTraining(true, today)
  ok((await loadTraining('2026-06-11')) === false, 'autre date : repos (aucune fuite)')

  // Double-write concurrent même date → 1 seule ligne (atomique + &date).
  const day2 = '2026-06-12'
  await Promise.all([setTraining(true, day2), setTraining(true, day2)])
  ok((await db.trainingDays.where('date').equals(day2).count()) === 1, 'double-write concurrent même date → 1 seule ligne')

  if (db.isOpen()) db.close()
}

async function main() {
  await t_states()
  console.log(`\n${exitCode === 0 ? 'TOUS LES TESTS PASSENT' : 'ÉCHECS DÉTECTÉS'}`)
  process.exit(exitCode)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
