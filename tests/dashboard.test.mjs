// Test tableau de bord (anneaux dérivés, D26). PUR, node, SANS DOM ni DB.
// Couvre le PIÈGE central : un jour sans donnée n'est JAMAIS compté 0 (il
// effondrerait la moyenne) → moyenne sur les SEULS jours saisis, avec le compte.
// + N propre par anneau (manuel-only D20 exclu de la protéine, compté à l'énergie
//   → N₂ < N₁) + seam effectiveTrained au compteur séances (jour workouts-only
//   COMPTE, échauffement seul non — arbitrage D21/D22).
// + fenêtre glissante 7/30, construction par composants (rollover, Safari-safe).
import {
  windowDates,
  dayConsumed,
  dayProtein,
  consumedMean,
  proteinMean,
  expenditureMean,
  sessionCount,
} from '../src/lib/dashboard.js'

let exitCode = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) exitCode = 1
}

// Jour minimal ; on surcharge ce qui compte pour chaque cas.
const mk = (over = {}) => ({
  date: '2026-06-10',
  entryCount: 0,
  journalKcal: 0,
  journalProtein: 0,
  manualIntake: null,
  expenditure: null,
  trainingManual: false,
  workouts: [],
  ...over,
})

console.log('— A : fenêtre glissante —')
ok(JSON.stringify(windowDates('jour', '2026-06-10')) === JSON.stringify(['2026-06-10']), 'jour → [today]')
const semaine = windowDates('semaine', '2026-06-10')
ok(semaine.length === 7 && semaine[0] === '2026-06-04' && semaine[6] === '2026-06-10', 'semaine → [today-6 … today]')
const mois = windowDates('mois', '2026-06-10')
ok(mois.length === 30 && mois[0] === '2026-05-12' && mois[29] === '2026-06-10', 'mois → [today-29 … today]')
ok(windowDates('semaine', '2026-03-02')[0] === '2026-02-24', 'rollover mois (2 mars → remonte en février)')
ok(windowDates('semaine', '2026-01-03')[0] === '2025-12-28', 'rollover année (3 janv → remonte en 2025)')

console.log('\n— B : moyenne énergie, jour vide EXCLU (jamais 0) —')
{
  const days = [mk({ entryCount: 2, journalKcal: 2000 }), mk({}), mk({ entryCount: 1, journalKcal: 2200 })]
  const r = consumedMean(days)
  ok(r.nDays === 2, '2 jours saisis seulement (le vide est exclu)')
  ok(r.mean === 2100, 'moyenne = (2000+2200)/2, PAS /3 avec un 0')
  ok(r.hasData === true, 'hasData vrai')
}

console.log('\n— C : manuel-only D20 → compté à l’énergie, EXCLU de la protéine (N₂ < N₁) —')
{
  const days = [mk({ entryCount: 3, journalKcal: 1800, journalProtein: 160 }), mk({ manualIntake: 2100 })]
  const c = consumedMean(days)
  const p = proteinMean(days)
  ok(c.nDays === 2 && c.mean === 1950, 'énergie : les 2 jours comptent ((1800+2100)/2)')
  ok(p.nDays === 1 && p.mean === 160, 'protéine : seul le jour détaillé compte')
  ok(p.nDays < c.nDays, 'N₂ < N₁ assumé et prouvé')
}

console.log('\n— D : drapeau has (verrou nullish D20) —')
ok(dayConsumed(mk({})).has === false, 'jour vide → has:false (pas 0)')
{
  const z = dayConsumed(mk({ manualIntake: 0 }))
  ok(z.has === true && z.value === 0, '0 manuel = total RÉEL (verrou nullish)')
}
ok(dayProtein(mk({ manualIntake: 2000 })).has === false, 'manuel-only → pas de donnée protéine')

console.log('\n— E : dépense, moyenne sur les SEULS jours saisis + compte —')
{
  const days = [mk({ expenditure: 400 }), mk({}), mk({}), mk({ expenditure: 424 })]
  const r = expenditureMean(days)
  ok(r.nDays === 2, '« sur 2 j saisis » (2 jours non saisis exclus)')
  ok(r.mean === 412, 'moyenne = (400+424)/2, PAS /4')
}

console.log('\n— F : période SANS aucune donnée → hasData:false (jamais 0 %) —')
{
  const days = [mk({}), mk({}), mk({})]
  ok(consumedMean(days).hasData === false, 'énergie hasData false')
  ok(proteinMean(days).hasData === false, 'protéine hasData false')
  ok(expenditureMean(days).hasData === false, 'dépense hasData false')
}

console.log('\n— G : compteur séances via le seam effectiveTrained (D21/D22) —')
{
  const days = [
    mk({ trainingManual: true }), // toggle manuel
    mk({ trainingManual: false, workouts: [{ name: 'Push Day' }] }), // Strong importé SANS toggle → COMPTE
    mk({ trainingManual: false, workouts: [{ name: 'Échauffement / Étirements' }] }), // mobilité seule → NE compte pas
    mk({}), // repos
  ]
  ok(sessionCount(days).count === 2, 'manuel + workouts-only comptés ; mobilité seule et repos exclus')
}

console.log(exitCode === 0 ? '\nALL PASS' : '\nSOME FAILED')
process.exit(exitCode)
