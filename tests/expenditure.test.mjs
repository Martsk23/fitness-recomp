// Test dépense / bilan énergétique (node + fake-indexeddb, sans navigateur).
// Prouve : energyBalance pur (déficit/surplus/even, non saisi = null), upsert
// sans doublon par date, ABSENCE de ligne = non saisi (null), "autre date
// vierge", et effacement → retour à non saisi.
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { db } from '../src/db.js'
import { loadExpenditure, setExpenditure, clearExpenditure, energyBalance } from '../src/lib/expenditure.js'

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

// ── P — energyBalance (pur, pas de DB) ─────────────────────────────
function p_pure() {
  console.log('\n— P : energyBalance (pur) —')
  ok(energyBalance(600, 2500) === -1900, 'déficit : 600 − 2500 = −1900')
  ok(energyBalance(3000, 2500) === 500, 'surplus : 3000 − 2500 = +500')
  ok(energyBalance(2500, 2500) === 0, 'équilibre : 0')
  ok(energyBalance(600, null) === null, 'dépense non saisie → bilan null')
  ok(energyBalance(0, 2000) === -2000, 'consommé 0 → −dépense (calcul défini ; l\'UI gère l\'état honnête)')
  ok(energyBalance(601.6, 2500) === -1898, 'arrondi entier')
}

// ── D — dépense du jour en base (upsert sur date) ──────────────────
async function d_states() {
  console.log('\n— D : dépense keyée par date —')
  await wipeAll()
  await db.open()

  const today = '2026-06-09'
  ok((await loadExpenditure(today)) === null, 'avant toute saisie : absence = non saisi (null)')

  await setExpenditure(2500, today)
  ok((await loadExpenditure(today)) === 2500, 'setExpenditure(2500) → relu 2500')
  ok((await db.dailyExpenditure.count()) === 1, '1 ligne en base')
  const row = (await db.dailyExpenditure.toArray())[0]
  ok(isUuid(row.id) && typeof row.updatedAt === 'number', 'ligne : id UUID + updatedAt (D10/D11)')

  // ré-écriture le même jour → touch (pas de doublon)
  await setExpenditure(2650, today)
  ok((await loadExpenditure(today)) === 2650 && (await db.dailyExpenditure.count()) === 1, 'ré-écriture même jour = update (toujours 1 ligne)')

  // "autre date = vierge" : aucune ligne pour une autre date ⇒ non saisi
  ok((await loadExpenditure('2026-06-10')) === null, 'autre date : non saisi (null), aucune fuite')

  // VERROU STRUCTUREL : deux écritures concurrentes sur la même date ne créent
  // pas 2 lignes (upsert atomique + index unique &date). Sans verrou, le
  // happy-path read-then-write pourrait insérer 2 fois.
  const day2 = '2026-06-11'
  await Promise.all([setExpenditure(2000, day2), setExpenditure(2100, day2)])
  ok((await db.dailyExpenditure.where('date').equals(day2).count()) === 1, 'double write concurrent même date → 1 seule ligne')

  // effacement → retour à non saisi (ligne du jour supprimée ; scope à la date,
  // car le test de concurrence ci-dessus a laissé une ligne sur day2).
  await clearExpenditure(today)
  ok(
    (await loadExpenditure(today)) === null && (await db.dailyExpenditure.where('date').equals(today).count()) === 0,
    'clear → non saisi + ligne du jour supprimée',
  )

  if (db.isOpen()) db.close()
}

async function main() {
  p_pure()
  await d_states()
  console.log(`\n${exitCode === 0 ? 'TOUS LES TESTS PASSENT' : 'ÉCHECS DÉTECTÉS'}`)
  process.exit(exitCode)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
