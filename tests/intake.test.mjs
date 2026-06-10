// Test consommé rapide du jour (node + fake-indexeddb, sans navigateur).
// Prouve : effectiveConsumed (seam D20) — le JOURNAL prime dès ≥1 entrée, le total
// manuel n'est qu'un FALLBACK à 0 entrée ; VERROU NULLISH recadré (à 0 entrée, total
// 0 = réel, jamais traité comme absence) ; upsert sans doublon par date, ABSENCE =
// non saisi (null), "autre date vierge", clear → retour non saisi ; et le scénario
// bilan : repas logués → journal prime ; aucun repas + total manuel → fallback.
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

// ── P — effectiveConsumed (pur) : D20 + VERROU NULLISH recadré ──────
function p_pure() {
  console.log('\n— P : effectiveConsumed (seam D20, journal prioritaire) —')
  // ≥1 entrée → le journal prime.
  ok(effectiveConsumed(null, 600, 1) === 600, '≥1 entrée, pas de total → journal (600)')
  // LE FLIP D20 : avec des entrées, le journal prime SUR le total manuel.
  ok(effectiveConsumed(2100, 600, 1) === 600, 'D20 : journal prime sur le manuel dès ≥1 entrée (600, pas 2100)')
  ok(effectiveConsumed(undefined, 600, 1) === 600, '≥1 entrée, manuel undefined → journal (600)')
  // 0 entrée → le total manuel est le FALLBACK.
  ok(effectiveConsumed(2100, 0, 0) === 2100, '0 entrée → total manuel = fallback (2100)')
  // VERROU NULLISH recadré : à 0 entrée, 0 est un total RÉEL (≠ absence).
  ok(effectiveConsumed(0, 600, 0) === 0, 'VERROU NULLISH (fallback) : 0 entrée, total 0 = réel → 0')
  // …mais avec des entrées, même un manuel 0 est ignoré (journal prime).
  ok(effectiveConsumed(0, 600, 1) === 600, '≥1 entrée : journal prime même si manuel 0 (600)')
  ok(effectiveConsumed(null, 0, 0) === 0, '0 entrée, pas de total → 0')
  ok(effectiveConsumed(null, undefined, 0) === 0, '0 entrée, journal absent → 0 (jamais NaN)')
}

// ── B — scénario bilan (effectiveConsumed ∘ energyBalance) sous D20 ──
function b_balance() {
  console.log('\n— B : bilan = consommé effectif − dépense —')
  const sumJournal = 600
  const depense = 2500
  // Repas logués (≥1 entrée) → le journal prime, le manuel résiduel est ignoré.
  ok(energyBalance(effectiveConsumed(null, sumJournal, 1), depense) === -1900, '≥1 entrée, pas de total → journal − dépense (−1900)')
  ok(energyBalance(effectiveConsumed(2100, sumJournal, 2), depense) === -1900, 'D20 : repas logués → journal prime, 2100 ignoré (−1900)')
  // Aucun repas logué → le total manuel sert de fallback.
  ok(energyBalance(effectiveConsumed(2100, 0, 0), depense) === -400, '0 entrée → total manuel fallback (2100 → −400)')
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

  // VERROU NULLISH en base : un total 0 saisi se relit 0 (pas null). À 0 entrée,
  // ce 0 est le fallback effectif (≠ non saisi).
  await setIntake(0, today)
  ok((await loadIntake(today)) === 0, 'total 0 saisi → relu 0 (≠ non saisi)')
  ok(effectiveConsumed(await loadIntake(today), 600, 0) === 0, 'total 0 en base, 0 entrée → fallback = 0 (verrou nullish, pas 600)')

  // "autre date = vierge"
  ok((await loadIntake('2026-06-10')) === null, 'autre date : non saisi (null), aucune fuite')

  // double-write concurrent même date → 1 seule ligne (upsert atomique + &date)
  const day2 = '2026-06-11'
  await Promise.all([setIntake(1800, day2), setIntake(1900, day2)])
  ok((await db.dailyIntake.where('date').equals(day2).count()) === 1, 'double write concurrent même date → 1 seule ligne')

  // clear → retour à non saisi (null). Avec des entrées, le journal prime de toute façon.
  await clearIntake(today)
  ok(
    (await loadIntake(today)) === null && (await db.dailyIntake.where('date').equals(today).count()) === 0,
    'clear → non saisi + ligne du jour supprimée',
  )
  ok(effectiveConsumed(await loadIntake(today), 600, 1) === 600, '≥1 entrée → journal (600)')

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
