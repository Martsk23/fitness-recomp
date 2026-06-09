// Test déterministe du moteur métabolique (node, sans navigateur).
// Vérifie BMR (Mifflin + Katch) sur valeurs connues, multiplicateurs TDEE,
// cibles recomp, et surtout que les GARDE-FOUS BLOQUENT (kcal/prot/lip/déficit).
import {
  bmrMifflin,
  bmrKatch,
  computeBmr,
  tdeeFrom,
  bmi,
  computeTargets,
  isProfileComplete,
  ACTIVITY,
  ACTIVITY_LEVELS,
  GOAL_KEYS,
  GUARDRAILS,
  SUGARS_SIMPLE_MAX,
} from '../src/lib/metabolic.js'

let exitCode = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) exitCode = 1
}
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps

console.log('— BMR (valeurs connues) —')
// M, 30 ans, 180 cm, 80 kg → 10·80 + 6.25·180 − 5·30 + 5 = 1780
ok(bmrMifflin({ sex: 'M', age: 30, heightCm: 180, weightKg: 80 }) === 1780, 'Mifflin M 30/180/80 = 1780')
// F, 30 ans, 165 cm, 60 kg → 600 + 1031.25 − 150 − 161 = 1320.25
ok(near(bmrMifflin({ sex: 'F', age: 30, heightCm: 165, weightKg: 60 }), 1320.25), 'Mifflin F 30/165/60 = 1320.25')
// Katch 80 kg, 15 % MG → LBM 68 → 370 + 21.6·68 = 1838.8
ok(near(bmrKatch({ weightKg: 80, bodyFatPct: 15 }), 1838.8), 'Katch 80 kg @15% = 1838.8')

console.log('\n— sélection de formule —')
ok(computeBmr({ sex: 'M', age: 30, heightCm: 180, bodyFatPct: null }, 80).formula === 'mifflin', 'sans %MG → Mifflin')
ok(computeBmr({ sex: 'M', age: 30, heightCm: 180, bodyFatPct: 15 }, 80).formula === 'katch', 'avec %MG → Katch')

console.log('\n— TDEE (multiplicateurs) —')
ok(near(tdeeFrom(1780, 'moderate'), 2759), '1780 × 1.55 (modéré) = 2759')
ok(ACTIVITY_LEVELS.length === 5 && ACTIVITY.extreme.factor === 1.9, '5 niveaux, extrême = 1.9')

console.log('\n— IMC —')
ok(near(bmi(80, 180), 24.69, 0.01), 'IMC 80/1.80² = 24.69')

console.log('\n— cibles recomp (M 30/180/80, modéré) —')
{
  const p = { sex: 'M', age: 30, heightCm: 180, activityLevel: 'moderate', goal: 'recomp', bodyFatPct: null }
  const t = computeTargets(p, 80)
  // tdee 2759 × 0.9 = 2483.1 ; prot 160 ; fat 64 ; carbs (2483.1−1216)/4 ≈ 316.8
  ok(t.targetKcal === 2483, `kcal recomp = 2483 (obtenu ${t.targetKcal})`)
  ok(t.targetProtein === 160, `protéines = 160 g (2,0 g/kg) (obtenu ${t.targetProtein})`)
  ok(t.targetFat === 64, `lipides = 64 g (0,8 g/kg) (obtenu ${t.targetFat})`)
  ok(t.targetCarb === 317, `glucides = 317 g (reste) (obtenu ${t.targetCarb})`)
  ok(t.targetSugarsSimple === SUGARS_SIMPLE_MAX, 'sucres simples = 20 g (acté)')
  ok(t.clamps.length === 0, 'aucun garde-fou déclenché sur profil normal')
}

console.log('\n— GARDE-FOUS qui BLOQUENT —')
{
  // F âgée, petite, légère, sédentaire, perte → kcal calculé < plancher 1200.
  const p = { sex: 'F', age: 70, heightCm: 150, activityLevel: 'sedentary', goal: 'loss', bodyFatPct: null }
  const t = computeTargets(p, 45)
  ok(t.clamps.includes('kcalFloor'), 'plancher calorique déclenché (clamps inclut kcalFloor)')
  ok(t.targetKcal === 1200, `kcal bloqué au plancher F = 1200 (obtenu ${t.targetKcal})`)
}
{
  // Profil pathologique : prot+lipides plancher > kcal → pas de glucides négatifs.
  const p = { sex: 'M', age: 80, heightCm: 150, activityLevel: 'sedentary', goal: 'loss', bodyFatPct: null }
  const t = computeTargets(p, 200)
  ok(t.clamps.includes('macrosExceedKcal'), 'macros > kcal → clamp macrosExceedKcal')
  ok(t.targetCarb === 0, `glucides jamais négatifs → 0 (obtenu ${t.targetCarb})`)
}

// Invariant : sur un balayage de profils, AUCUNE cible ne passe sous un plancher.
console.log('\n— invariant : planchers jamais franchis (balayage) —')
let violated = false
for (const sex of ['M', 'F']) {
  for (const goal of GOAL_KEYS) {
    for (const activityLevel of ACTIVITY_LEVELS) {
      for (const weightKg of [45, 60, 80, 120]) {
        for (const age of [20, 45, 80]) {
          const t = computeTargets({ sex, age, heightCm: 170, activityLevel, goal, bodyFatPct: null }, weightKg)
          if (t.targetKcal < GUARDRAILS.kcalFloor[sex]) violated = true
          if (t.targetProtein < GUARDRAILS.proteinFloorGkg * weightKg - 1) violated = true
          if (t.targetFat < GUARDRAILS.fatFloorGkg * weightKg - 1) violated = true
          if (t.targetCarb < 0) violated = true
        }
      }
    }
  }
}
ok(!violated, 'kcal ≥ plancher, prot ≥ 1,6 g/kg, lip ≥ 0,6 g/kg, glucides ≥ 0 sur tous les profils')

console.log('\n— complétude profil —')
ok(isProfileComplete({ sex: 'M', age: 30, heightCm: 180, activityLevel: 'moderate', goal: 'recomp' }), 'profil complet → true')
ok(!isProfileComplete(null), 'profil null → false')
ok(!isProfileComplete({ sex: 'X', age: 30, heightCm: 180, activityLevel: 'moderate', goal: 'recomp' }), 'sexe invalide → false')
ok(!isProfileComplete({ sex: 'M', age: 30, heightCm: 180, activityLevel: 'moderate' }), 'objectif manquant → false')

console.log(exitCode === 0 ? '\nTOUS LES TESTS PASSENT' : '\nÉCHECS — voir ci-dessus')
process.exit(exitCode)
