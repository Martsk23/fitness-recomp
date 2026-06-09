// Test tickers (node + fake-indexeddb, sans navigateur).
// Prouve la logique D3 : nextValue (inc/dec borné à 0 / toggle), upsert sans
// doublon par (ticker, jour), et surtout ABSENCE de ligne = 0 → "autre date
// repart à 0" (reset journalier sans cron).
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { db } from '../src/db.js'
import { seedIfEmpty } from '../src/seed.js'
import { clampCounter, nextValue, loadActiveConfigs, loadStates, setValue } from '../src/lib/tickers.js'

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

// ── P — logique pure (pas de DB) ───────────────────────────────────
function p_pure() {
  console.log('\n— P : nextValue / clamp (pur) —')
  const counter = { type: 'counter' }
  const checkbox = { type: 'checkbox' }
  ok(nextValue(counter, 0, 'inc') === 1 && nextValue(counter, 4, 'inc') === 5, 'counter inc = +1')
  ok(nextValue(counter, 3, 'dec') === 2, 'counter dec = −1')
  ok(nextValue(counter, 0, 'dec') === 0, 'counter dec à 0 reste 0 (borné)')
  ok(clampCounter(-5) === 0 && clampCounter(2) === 2, 'clampCounter borne à 0')
  ok(nextValue(checkbox, 0, 'toggle') === 1, 'checkbox 0 → 1')
  ok(nextValue(checkbox, 1, 'toggle') === 0, 'checkbox 1 → 0')
  ok(nextValue(checkbox, 3, 'toggle') === 0, 'checkbox vrai → 0 (toute valeur vraie)')
}

// ── D — état journalier en base (D3) ───────────────────────────────
async function d_states() {
  console.log('\n— D : état keyé par (ticker, jour) —')
  await wipeAll()
  await db.open()
  await seedIfEmpty()

  const configs = await loadActiveConfigs()
  ok(configs.length === 4, 'loadActiveConfigs : 4 tickers actifs')
  ok(configs[0].label === 'Eau' && configs[0].order === 1, 'triés par order (Eau en tête)')
  const eau = configs[0]

  const today = '2026-06-09'
  const empty = await loadStates(today)
  ok(Object.keys(empty).length === 0, 'avant toute écriture : aucune ligne (absence = 0)')

  await setValue(eau.id, 3, today)
  let st = await loadStates(today)
  ok(st[eau.id] === 3, 'setValue(3) → loadStates lit 3')
  ok((await db.tickerStates.count()) === 1, '1 ligne en base')
  const row = (await db.tickerStates.toArray())[0]
  ok(isUuid(row.id) && typeof row.updatedAt === 'number', 'ligne : id UUID + updatedAt')

  // mise à jour le même jour → touch (pas de doublon)
  await setValue(eau.id, 5, today)
  st = await loadStates(today)
  ok(st[eau.id] === 5 && (await db.tickerStates.count()) === 1, 'ré-écriture même jour = update (toujours 1 ligne)')

  // "AUTRE DATE → repart à 0" : la ligne du 09 n'apparaît pas le 10.
  const other = await loadStates('2026-06-10')
  ok((other[eau.id] || 0) === 0, "autre date : valeur 0 (reset journalier, ligne du 09 invisible le 10)")

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
