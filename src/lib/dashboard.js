import { todayKey } from '../ui.js'
import { effectiveConsumed } from './intake.js'
import { effectiveTrained } from './training.js'

// ── Tableau de bord : anneaux de progression (D26) ─────────────────
// 100 % DÉRIVÉ, ZÉRO stockage, ZÉRO bump (calque glycemic/perf/suggest). L'I/O
// (charger la fenêtre de jours) vit dans l'écran ; ici tout est PUR et testé node.
//
// HONNÊTETÉ DES MOYENNES (non négociable) : un jour SANS donnée est EXCLU du
// dénominateur, JAMAIS compté 0. Chaque anneau a son PROPRE compteur de jours
// saisis (les N diffèrent — un jour en mode manuel D20 compte pour l'énergie mais
// PAS pour les protéines, dont le détail est inconnu). Affiché « moy. X /j sur N j ».
//
// PÉRIODES : fenêtre GLISSANTE (D26) — semaine = [today-6…today], mois =
// [today-29…today], dates locales todayKey (cohérent avec movingAverage du poids
// D14 ; alternative calendaire notée non retenue).

const WINDOW = { jour: 1, semaine: 7, mois: 30 }

/**
 * Dates locales 'YYYY-MM-DD' de la fenêtre glissante se terminant à `todayStr`.
 * Construit par composants (`new Date(y, m-1, d-i)`) → rollover mois/année correct
 * ET sûr tous moteurs (jamais `new Date(chaîne)`, cf. D22). Ordre croissant.
 */
export function windowDates(period, todayStr = todayKey()) {
  const n = WINDOW[period] ?? 1
  const [y, m, d] = todayStr.split('-').map(Number)
  const out = []
  for (let i = n - 1; i >= 0; i--) out.push(todayKey(new Date(y, m - 1, d - i)))
  return out
}

// ── Dérivés PAR JOUR (chacun dit s'il a une donnée exploitable) ────
// Un `day` = { date, entryCount, journalKcal, journalProtein, manualIntake|null,
//   expenditure|null, trainingManual:bool, workouts:[{name}] } assemblé par l'écran.

/** Consommé effectif du jour (seam D20). has = ≥1 entrée OU total manuel saisi. */
export function dayConsumed(day) {
  const has = day.entryCount > 0 || day.manualIntake != null
  return { has, value: has ? effectiveConsumed(day.manualIntake, day.journalKcal, day.entryCount) : null }
}

/** Protéines du jour : journal DÉTAILLÉ uniquement. Un jour manuel-only (D20,
 *  macros inconnues) n'a PAS de donnée protéine → exclu, jamais 0. */
export function dayProtein(day) {
  const has = day.entryCount > 0
  return { has, value: has ? day.journalProtein : null }
}

/** Dépense du jour : saisie sporadique → absence = pas de donnée (≠ 0). */
export function dayExpenditure(day) {
  const has = day.expenditure != null
  return { has, value: has ? day.expenditure : null }
}

/** Séance du jour via le seam effectiveTrained (D21/D22) : toggle manuel OU
 *  séance importée RÉELLE (échauffement seul exclu). JAMAIS trainingDays brut. */
export function daySession(day) {
  return effectiveTrained({ manualPresent: day.trainingManual, importedWorkouts: day.workouts || [] })
}

// ── Moyennes sur les SEULS jours saisis ────────────────────────────
function meanOver(days, pick) {
  const vals = days.map(pick).filter((r) => r.has).map((r) => r.value)
  const nDays = vals.length
  const sum = vals.reduce((a, v) => a + v, 0)
  return { mean: nDays ? Math.round(sum / nDays) : 0, nDays, hasData: nDays > 0 }
}

export const consumedMean = (days) => meanOver(days, dayConsumed)
export const proteinMean = (days) => meanOver(days, dayProtein)
export const expenditureMean = (days) => meanOver(days, dayExpenditure)

/** Nombre de jours AVEC séance (seam effectiveTrained) sur la fenêtre. Un compte,
 *  pas une moyenne — un jour workouts-only (Strong importé, pas de toggle) COMPTE. */
export function sessionCount(days) {
  return { count: days.filter(daySession).length }
}
