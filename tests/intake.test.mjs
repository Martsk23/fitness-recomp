// Test consommé rapide du jour (node + fake-indexeddb, sans navigateur).
// Prouve : effectiveConsumed (seam D17) avec VERROU NULLISH (0 = total réel,
// jamais traité comme absence), upsert sans doublon par date, ABSENCE = non
// saisi (null), "autre date vierge", clear → retour non saisi, et le scénario
// bilan demandé : pas de total → bilan = sommeJournal ; total 2100 → 2100 −
// dépense ; clear → revient à sommeJournal.
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { db } from '../src/db.js'
import { loadIntake, setIntake, clearIntake, effectiveConsumed } from '../src/lib/intake.js'
import { energyBalance } from '../src/lib/expenditure.js'

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

// ── P — effectiveConsumed (pur) + VERROU NULLISH ───────────────────
function p_pure() {
  console.log('\n— P : effectiveConsumed (seam D17, verrou nullish) —')
  ok(effectiveConsumed(null, 600) === 600, 'pas de total manuel → somme du journal (600)')
  ok(effectiveConsumed(2100, 600) === 2100, 'total manuel saisi → prime (2100, pas 600)')
  ok(effectiveConsumed(undefined, 600) === 600, 'undefined → fallback journal (600)')
  // LE VERROU : 0 est un total RÉEL, il prime ; il ne doit PAS retomber sur 600.
  ok(effectiveConsumed(0, 600) === 0, 'VERROU NULLISH : total 0 = total réel → 0 (pas 600)')
  ok(effectiveConsumed(null, 0) === 0, 'pas de total + journal vide → 0')
  ok(effectiveConsumed(null, undefined) === 0, 'pas de total + journal absent → 0 (jamais NaN)')
}

// ── B — scénario bilan demandé (effectiveConsumed ∘ energyBalance) ──
function b_balance() {
  console.log('\n— B : bilan = consommé effectif − dépense —')
  const sumJournal = 600
  const depense = 2500
  ok(energyBalance(effectiveConsumed(null, sumJournal), depense) === -1900, 'pas de total → bilan = sommeJournal − dépense (−1900)')
  ok(energyBalance(effectiveConsumed(2100, sumJournal), depense) === -400, 'total 2100 → bilan = 2100 − dépense (−400)')
  // clear = retour à manualTotal null → on revient à la somme du journal.
  ok(energyBalance(effectiveConsumed(null, sumJournal), depense) === -1900, 'clear → revient à sommeJournal − dépense (−1900)')
}

// ── D — consommé du jour en base (upsert sur date) ─────────────────
async function d_states() {
  console.log('\n— D : consommé keyé par date —')
  await wipeAll()
  await db.open()

  const today = '2026-06-09'
  ok((await loadIntake(today)) === null, 'avant toute saisie : absence = non saisi (null)')

  await setIntake(2100, today)
  ok((await loadIntake(today)) === 2100, 'setIntake(2100) → relu 2100')
  ok((await db.dailyIntake.count()) === 1, '1 ligne en base')
  const row = (await db.dailyIntake.toArray())[0]
  ok(isUuid(row.id) && typeof row.updatedAt === 'number', 'ligne : id UUID + updatedAt (D10/D11)')

  // ré-écriture le même jour → touch (pas de doublon)
  await setIntake(2200, today)
  ok((await loadIntake(today)) === 2200 && (await db.dailyIntake.count()) === 1, 'ré-écriture même jour = update (toujours 1 ligne)')

  // VERROU NULLISH en base : un total 0 saisi se relit 0 (pas null), et prime.
  await setIntake(0, today)
  ok((await loadIntake(today)) === 0, 'total 0 saisi → relu 0 (≠ non saisi)')
  ok(effectiveConsumed(await loadIntake(today), 600) === 0, 'total 0 en base → prime sur la somme journal (0, pas 600)')

  // "autre date = vierge"
  ok((await loadIntake('2026-06-10')) === null, 'autre date : non saisi (null), aucune fuite')

  // double-write concurrent même date → 1 seule ligne (upsert atomique + &date)
  const day2 = '2026-06-11'
  await Promise.all([setIntake(1800, day2), setIntake(1900, day2)])
  ok((await db.dailyIntake.where('date').equals(day2).count()) === 1, 'double write concurrent même date → 1 seule ligne')

  // clear → retour à non saisi (null) → effectiveConsumed retombe sur le journal
  await clearIntake(today)
  ok(
    (await loadIntake(today)) === null && (await db.dailyIntake.where('date').equals(today).count()) === 0,
    'clear → non saisi + ligne du jour supprimée',
  )
  ok(effectiveConsumed(await loadIntake(today), 600) === 600, 'après clear → revient à la somme du journal (600)')

  if (db.isOpen()) db.close()
}

async function main() {
  p_pure()
  b_balance()
  await d_states()
  console.log(`\n${exitCode === 0 ? 'TOUS LES TESTS PASSENT' : 'ÉCHECS DÉTECTÉS'}`)
  process.exit(exitCode)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
