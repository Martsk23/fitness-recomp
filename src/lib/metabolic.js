// Moteur de calcul métabolique (logique pure, aucune dépendance Dexie/DOM → testable node).
// BMR → TDEE → cibles kcal/macros selon objectif, avec garde-fous codés en dur.
// Source de vérité des budgets de toute l'app. Voir DECISIONS.md (D15 : politique
// de cibles recomp + garde-fous) et docs/ROADMAP Tâche 2.

// ── Multiplicateurs d'activité (× BMR → TDEE) ──────────────────────
export const ACTIVITY = {
  sedentary: { factor: 1.2, label: 'Sédentaire (peu/pas de sport)' },
  light: { factor: 1.375, label: 'Léger (1-3 séances/sem)' },
  moderate: { factor: 1.55, label: 'Modéré (3-5/sem)' },
  veryActive: { factor: 1.725, label: 'Très actif (6-7/sem)' },
  extreme: { factor: 1.9, label: 'Extrême (2×/jour, métier physique)' },
}
export const ACTIVITY_LEVELS = Object.keys(ACTIVITY)

// ── Politique par objectif (recomp = celui qu'on soigne) ───────────
// kcalFactor : × TDEE. proteinGkg / fatGkg : g par kg de poids corporel.
export const GOALS = {
  recomp: { label: 'Recomposition', kcalFactor: 0.9, proteinGkg: 2.0, fatGkg: 0.8 },
  loss: { label: 'Perte de gras', kcalFactor: 0.8, proteinGkg: 2.2, fatGkg: 0.8 },
  gain: { label: 'Prise de muscle', kcalFactor: 1.1, proteinGkg: 1.8, fatGkg: 1.0 },
}
export const GOAL_KEYS = Object.keys(GOALS)

// ── Garde-fous (jamais franchis, quel que soit le profil) ──────────
export const GUARDRAILS = {
  kcalFloor: { M: 1500, F: 1200 }, // plancher calorique absolu par sexe
  maxDeficitFactor: 0.8, // jamais sous TDEE × 0,80 (déficit plafonné à −20 %)
  proteinFloorGkg: 1.6, // plancher protéines (g/kg)
  fatFloorGkg: 0.6, // plancher lipides (g/kg)
}

export const SUGARS_SIMPLE_MAX = 20 // sucres simples < 20 g/jour — DÉJÀ ACTÉ

// ── BMR ────────────────────────────────────────────────────────────
// Mifflin-St Jeor (défaut, n'exige pas le %MG) :
//   BMR = 10·W(kg) + 6.25·H(cm) − 5·A(ans) + s ;  s = +5 (M), −161 (F)
export function bmrMifflin({ sex, age, heightCm, weightKg }) {
  const s = sex === 'M' ? 5 : -161
  return 10 * weightKg + 6.25 * heightCm - 5 * age + s
}

export const lbmKg = ({ weightKg, bodyFatPct }) => weightKg * (1 - bodyFatPct / 100)

// Katch-McArdle (UNIQUEMENT si %MG saisi) :  BMR = 370 + 21.6·LBM(kg)
export function bmrKatch({ weightKg, bodyFatPct }) {
  return 370 + 21.6 * lbmKg({ weightKg, bodyFatPct })
}

// Katch si %MG fourni, sinon Mifflin.
export function computeBmr(profile, weightKg) {
  const hasBf = profile.bodyFatPct != null && Number.isFinite(profile.bodyFatPct)
  if (hasBf) return { bmr: bmrKatch({ weightKg, bodyFatPct: profile.bodyFatPct }), formula: 'katch' }
  return {
    bmr: bmrMifflin({ sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg }),
    formula: 'mifflin',
  }
}

export const tdeeFrom = (bmr, activityLevel) => bmr * ACTIVITY[activityLevel].factor

export function bmi(weightKg, heightCm) {
  const m = heightCm / 100
  return weightKg / (m * m)
}

// ── Cibles complètes + garde-fous ──────────────────────────────────
// Renvoie les cibles arrondies + métriques + la liste des clamps déclenchés
// (utile aux tests : prouve qu'un garde-fou a bloqué).
export function computeTargets(profile, weightKg) {
  const { bmr, formula } = computeBmr(profile, weightKg)
  const tdee = tdeeFrom(bmr, profile.activityLevel)
  const goal = GOALS[profile.goal]
  const clamps = []

  // 1. objectif → kcal brut
  let kcal = tdee * goal.kcalFactor
  // 2. déficit plafonné : jamais sous TDEE × maxDeficitFactor
  const deficitFloor = tdee * GUARDRAILS.maxDeficitFactor
  if (kcal < deficitFloor) {
    kcal = deficitFloor
    clamps.push('deficit')
  }
  // 3. plancher calorique absolu (par sexe)
  const absFloor = GUARDRAILS.kcalFloor[profile.sex]
  if (kcal < absFloor) {
    kcal = absFloor
    clamps.push('kcalFloor')
  }

  // 4. protéines (plancher 1,6 g/kg)
  const proteinGkg = Math.max(goal.proteinGkg, GUARDRAILS.proteinFloorGkg)
  if (goal.proteinGkg < GUARDRAILS.proteinFloorGkg) clamps.push('protein')
  const protein = proteinGkg * weightKg
  // 5. lipides (plancher 0,6 g/kg)
  const fatGkg = Math.max(goal.fatGkg, GUARDRAILS.fatFloorGkg)
  if (goal.fatGkg < GUARDRAILS.fatFloorGkg) clamps.push('fat')
  const fat = fatGkg * weightKg

  // 6. glucides = reste des calories ; jamais négatif
  const macroKcal = protein * 4 + fat * 9
  if (macroKcal > kcal) {
    // Profil pathologique : prot+lipides plancher dépassent déjà le budget.
    // On remonte kcal au niveau des macros plutôt que de sortir des glucides négatifs.
    kcal = macroKcal
    clamps.push('macrosExceedKcal')
  }
  const carbs = Math.max(0, (kcal - macroKcal) / 4)

  return {
    formula,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    bmi: bmi(weightKg, profile.heightCm),
    targetKcal: Math.round(kcal),
    targetProtein: Math.round(protein),
    targetFat: Math.round(fat),
    targetCarb: Math.round(carbs),
    targetSugarsSimple: SUGARS_SIMPLE_MAX,
    clamps,
  }
}

// ── Profil : complétude ────────────────────────────────────────────
// Le poids ne fait PAS partie du profil (il vient du dernier weightLogs).
export function isProfileComplete(profile) {
  if (!profile || typeof profile !== 'object') return false
  const { sex, age, heightCm, activityLevel, goal } = profile
  return (
    (sex === 'M' || sex === 'F') &&
    Number.isFinite(age) &&
    age > 0 &&
    Number.isFinite(heightCm) &&
    heightCm > 0 &&
    activityLevel in ACTIVITY &&
    goal in GOALS
  )
}
