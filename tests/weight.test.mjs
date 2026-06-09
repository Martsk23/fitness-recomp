// Test déterministe de la logique pure du poids (node, sans navigateur).
// Vérifie la moyenne glissante sur des séries CONNUES (valeurs exactes), plus
// la tendance et l'heuristique "bon moment pour se peser".
import { movingAverage, trend, shouldWeighNow, MA_WINDOW } from '../src/lib/weight.js'

let exitCode = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) exitCode = 1
}
const eqArr = (a, b, eps = 1e-9) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps)

console.log('— moyenne glissante (séries connues) —')

// Fenêtre 2 sur [80, 82, 84, 86] :
//   i0: [80]      → 80
//   i1: [80,82]   → 81
//   i2: [82,84]   → 83
//   i3: [84,86]   → 85
ok(eqArr(movingAverage([80, 82, 84, 86], 2), [80, 81, 83, 85]), 'fenêtre=2 sur [80,82,84,86] → [80,81,83,85]')

// Fenêtre 3 sur [10, 20, 30, 40, 50] :
//   [10]=10 · [10,20]=15 · [10,20,30]=20 · [20,30,40]=30 · [30,40,50]=40
ok(eqArr(movingAverage([10, 20, 30, 40, 50], 3), [10, 15, 20, 30, 40]), 'fenêtre=3 sur [10..50] → [10,15,20,30,40]')

// Fenêtre >= longueur → chaque point = moyenne cumulée depuis le début.
ok(eqArr(movingAverage([2, 4], 7), [2, 3]), 'fenêtre 7 > n : [2,4] → [2,3]')

// Série constante → moyenne constante.
ok(eqArr(movingAverage([75, 75, 75], 7), [75, 75, 75]), 'série constante → MA constante')

// Cas limites.
ok(eqArr(movingAverage([], 7), []), 'série vide → []')
ok(eqArr(movingAverage([81.3], 7), [81.3]), 'un seul point → lui-même')
ok(MA_WINDOW === 7, 'MA_WINDOW = 7 (défaut documenté)')

console.log('\n— tendance —')
ok(trend([80]).direction === 'flat' && trend([80]).deltaKg === 0, 'série < 2 points → flat, delta 0')
{
  // Descente nette : MA finale < MA de référence.
  const t = trend([82, 81.5, 81, 80.5, 80], 3)
  ok(t.direction === 'down' && t.deltaKg < 0, 'série décroissante → direction down, delta < 0')
}
{
  const t = trend([78, 78.5, 79, 79.5, 80], 3)
  ok(t.direction === 'up' && t.deltaKg > 0, 'série croissante → direction up, delta > 0')
}
ok(trend([80, 80.02, 79.99, 80.01], 3).direction === 'flat', 'micro-variations (< 0.1) → flat')

console.log('\n— bon moment pour se peser —')
const at = (h) => new Date(2026, 5, 9, h, 0, 0) // 9 juin 2026, heure locale h
ok(shouldWeighNow({ hasLoggedToday: false, now: at(8) }) === true, 'matin (8h) + pas pesé → true')
ok(shouldWeighNow({ hasLoggedToday: true, now: at(8) }) === false, 'matin mais déjà pesé → false')
ok(shouldWeighNow({ hasLoggedToday: false, now: at(15) }) === false, 'après-midi (15h) + pas pesé → false')
ok(shouldWeighNow({ hasLoggedToday: false, now: at(11) }) === true, '11h (avant midi) → true')
ok(shouldWeighNow({ hasLoggedToday: false, now: at(12) }) === false, '12h (midi pile) → false')

console.log(exitCode === 0 ? '\nTOUS LES TESTS PASSENT' : '\nÉCHECS — voir ci-dessus')
process.exit(exitCode)
