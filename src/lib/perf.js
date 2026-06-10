// ── Analyse de perf (Phase 2, point 7 ROADMAP / D23) — logique PURE ──
// Tout se DÉRIVE des `sets` importés (D22). AUCUN stockage, AUCUN bump Dexie :
// l'analyse est une projection des séries, recalculée au montage de Perf
// (≤ ~500 sets = trivial). Déterministe, testable en node sur la fixture réelle.
//
// DURCISSEMENT D23 — MÉTRIQUE PAR EXERCICE, JAMAIS PAR SÉANCE. Un exercice est
// suivi À L'E1RM si ≥ MIN_SESSIONS de ses séances ont un top-set VALIDE (série
// à reps ≤ EPLEY_REP_CAP). Sinon l'exercice ENTIER est suivi AU VOLUME
// (Σ poids×reps par séance), étiqueté. INTERDIT de comparer un e1RM à un volume
// dans la même tendance. Une séance sans valeur pour la métrique retenue est
// EXCLUE du calcul (et ne compte pas dans la fenêtre N).

import { classifyModality, normalizeName } from './strongImport.js'

// ── Constantes — SEAM UNIQUE des seuils (calque glycemic.js/D21) ────
export const EPLEY_REP_CAP = 12 // au-delà, Epley gonfle (séries 20-30 reps réelles) → série non valide pour l'e1RM
export const MIN_SESSIONS = 3 // < MIN_SESSIONS séances AVEC valeur → « données insuffisantes » (jamais extrapolé sur 2 points)
export const STAGNATION_WINDOW = 3 // fenêtre de tendance = N SÉANCES de l'exo (jamais calendaire)
export const TREND_BAND = 0.025 // bande de tolérance au bruit ±2,5 % (une séance molle isolée ≠ régression)

// Échauffement : montée en charge calculée sur le top-set de la DERNIÈRE séance.
// Constante UNIQUE exportée (seam) — l'utilisateur remplace ce schéma à l'arbitrage.
export const WARMUP_SCHEME = [
  { pct: 40, reps: 8 },
  { pct: 60, reps: 5 },
  { pct: 75, reps: 3 },
  { pct: 90, reps: 1 },
]
export const WARMUP_MIN_LOAD = 20 // sous cette charge de travail (kg) : pas d'échauffement calculé (isolation légère)
export const LOAD_INCREMENT = 2.5 // arrondi des charges aux incréments réels de la salle

// Exercices ASSISTÉS (Chest Dip (Assisted), Pull Up (Assisted)…) : dans Strong, le
// « poids » saisi = la charge d'ASSISTANCE → SÉMANTIQUE INVERSÉE (moins d'assistance
// = plus fort). Détection keyword, même mécanique que classifyModality (D22),
// normalisée trim + casse. La métrique reste l'e1RM (interdit de mélange D23 intact) ;
// seule la LECTURE du verdict s'inverse + le PR = MIN d'assistance + échauffement N/A.
export const ASSISTED_KEYWORDS = ['assisted', 'assisté', 'assistée']

/** Vrai si l'exercice est assisté (charge = assistance, lecture inversée). */
export function isAssisted(exercise) {
  const e = normalizeName(exercise)
  return ASSISTED_KEYWORDS.some((k) => e.includes(k))
}

// ── e1RM (Epley) ───────────────────────────────────────────────────
/** 1RM estimé (Epley) d'une série. Pur. Un single (reps=1) EST un 1RM réel
 *  → on rend la charge brute (la formule w×31/30 sur-estimerait un single). */
export function epley(weightKg, reps) {
  if (reps <= 1) return weightKg
  return weightKg * (1 + reps / 30)
}

/** Série VALIDE pour l'e1RM : chargée (poids > 0) et reps dans [1, EPLEY_REP_CAP]. */
export function isValidE1rmSet(s) {
  return (s?.weightKg || 0) > 0 && (s?.reps || 0) >= 1 && (s?.reps || 0) <= EPLEY_REP_CAP
}

/** Meilleur e1RM (top-set) d'une séance parmi les séries VALIDES, sinon null. */
export function sessionE1rm(sets = []) {
  let best = null
  for (const s of sets) {
    if (!isValidE1rmSet(s)) continue
    const v = epley(s.weightKg, s.reps)
    if (best == null || v > best) best = v
  }
  return best
}

/** Charge de travail (kg) = plus lourd poids travaillé de la séance (reps > 0), sinon 0.
 *  Sert l'échauffement (on rampe vers une CHARGE, pas vers un nombre d'e1RM). */
export function sessionTopWeight(sets = []) {
  let max = 0
  for (const s of sets) {
    if ((s?.reps || 0) >= 1 && (s?.weightKg || 0) > max) max = s.weightKg
  }
  return max
}

/** Volume d'une séance = Σ poids×reps. Existe (valeur) seulement si > 0. */
export function sessionVolume(sets = []) {
  let v = 0
  for (const s of sets) v += (s?.weightKg || 0) * (s?.reps || 0)
  return v
}

// ── Regroupement par exercice → séances (exercice, jour) ───────────
/** Map exercice → séances triées par date ASC. Une « séance d'exo » = (exercice, jour). */
export function groupByExercise(sets = []) {
  const byEx = new Map()
  for (const s of sets) {
    const ex = s.exercise
    if (!byEx.has(ex)) byEx.set(ex, new Map())
    const byDate = byEx.get(ex)
    if (!byDate.has(s.date)) byDate.set(s.date, [])
    byDate.get(s.date).push(s)
  }
  const out = new Map()
  for (const [ex, byDate] of byEx) {
    const sessions = [...byDate.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([date, sessionSets]) => ({ date, sets: sessionSets }))
    out.set(ex, sessions)
  }
  return out
}

// ── Choix de la métrique (par EXERCICE, durcissement D23) ──────────
/** 'e1rm' si ≥ MIN_SESSIONS séances ont un top-set valide ; sinon 'volume' si
 *  ≥ MIN_SESSIONS séances ont un volume > 0 ; sinon null (insuffisant). */
export function chooseMetric(sessions = []) {
  const e1rmCount = sessions.filter((s) => sessionE1rm(s.sets) != null).length
  if (e1rmCount >= MIN_SESSIONS) return 'e1rm'
  const volCount = sessions.filter((s) => sessionVolume(s.sets) > 0).length
  if (volCount >= MIN_SESSIONS) return 'volume'
  return null
}

/** Valeur d'une séance pour la métrique retenue (null si la séance n'a pas de valeur). */
export function sessionValue(sets, metric) {
  if (metric === 'e1rm') return sessionE1rm(sets)
  if (metric === 'volume') {
    const v = sessionVolume(sets)
    return v > 0 ? v : null
  }
  return null
}

/** Série temporelle [{date, value}] pour la métrique, séances SANS valeur exclues. */
export function metricSeries(sessions = [], metric) {
  const pts = []
  for (const s of sessions) {
    const value = sessionValue(s.sets, metric)
    if (value != null) pts.push({ date: s.date, value })
  }
  return pts
}

// ── Verdict de tendance (fenêtre N séances, bande ±2,5 %) ──────────
/**
 * Verdict sur la fenêtre des STAGNATION_WINDOW dernières séances AYANT une valeur.
 * État courant = MAX des 2 dernières (absorbe une séance molle isolée) ; comparé
 * au MAX des séances antérieures DE LA FENÊTRE. Bande ±TREND_BAND.
 * @returns 'up' | 'flat' | 'down' | null (null = pas assez de points).
 */
export function trendVerdict(series = []) {
  if (series.length < MIN_SESSIONS) return null
  const window = series.slice(-STAGNATION_WINDOW)
  const recent = Math.max(...window.slice(-2).map((p) => p.value))
  const prior = Math.max(...window.slice(0, -2).map((p) => p.value))
  if (prior <= 0) return null
  const ratio = recent / prior
  if (ratio > 1 + TREND_BAND) return 'up'
  if (ratio < 1 - TREND_BAND) return 'down'
  return 'flat'
}

/** Inverse un verdict (exercice assisté : assistance ↓ = progrès ↑). flat/null inchangés. */
export function invertVerdict(v) {
  if (v === 'up') return 'down'
  if (v === 'down') return 'up'
  return v
}

// ── PR (records all-time, dérivés) ─────────────────────────────────
/** Records dérivés : meilleure valeur (métrique) all-time + charge extrême all-time.
 *  ASSISTÉ : le record = le MINIMUM d'assistance (best = min, charge = min) → la
 *  meilleure perf est la moins assistée. `isRecentPR` = la séance la plus récente
 *  atteint ce record. */
export function personalRecords(sessions = [], metric, { assisted = false } = {}) {
  const series = metricSeries(sessions, metric)
  if (!series.length) return null
  const vals = series.map((p) => p.value)
  const best = assisted ? Math.min(...vals) : Math.max(...vals)
  const last = vals[vals.length - 1]
  const weights = []
  for (const s of sessions) {
    const w = sessionTopWeight(s.sets)
    if (w > 0) weights.push(w)
  }
  const loadExtreme = weights.length ? (assisted ? Math.min(...weights) : Math.max(...weights)) : 0
  const isRecentPR = assisted ? last <= best + 1e-9 : last >= best - 1e-9
  return { metric, assisted, best, loadExtreme, isRecentPR }
}

// ── Échauffement : montée en charge dérivée du top-set ─────────────
/** Arrondi à l'incrément réel de la salle (2,5 kg par défaut). */
export function roundToIncrement(w, inc = LOAD_INCREMENT) {
  return Math.round(w / inc) * inc
}

/**
 * Paliers de montée en charge vers `topWeight` (= top-set de la dernière séance).
 * Arrondi LOAD_INCREMENT ; on DROP un palier dont l'arrondi est ≤ au précédent
 * retenu (collision) ou ≥ topWeight (un échauffement reste sous la charge de
 * travail). Sous WARMUP_MIN_LOAD ou charge nulle → [] (N/A : isolation légère,
 * bodyweight, cardio). Le schéma vient de la constante UNIQUE WARMUP_SCHEME.
 * @returns {{weight:number, reps:number}[]}
 */
export function computeWarmup(topWeight, scheme = WARMUP_SCHEME, opts = {}) {
  const floor = opts.floor ?? WARMUP_MIN_LOAD
  const inc = opts.increment ?? LOAD_INCREMENT
  if (!(topWeight > 0) || topWeight < floor) return []
  const steps = []
  let prev = 0
  for (const { pct, reps } of scheme) {
    const weight = roundToIncrement((topWeight * pct) / 100, inc)
    if (weight <= prev || weight >= topWeight) continue // collision ou ≥ charge de travail → drop
    steps.push({ weight, reps })
    prev = weight
  }
  return steps
}

// ── Analyse d'un exercice + de tout le jeu de sets ─────────────────
/**
 * Analyse complète d'UN exercice. status ∈
 *   'cardio'       → exclu de l'analyse force (label explicite, suivi hors v1) ;
 *   'insufficient' → < MIN_SESSIONS séances avec valeur → pas de tendance ;
 *   'tracked'      → metric ('e1rm'|'volume'), verdict, série, current, PR.
 */
export function analyzeExercise(exercise, sessions) {
  if (classifyModality(exercise) === 'cardio') {
    return { exercise, status: 'cardio', sessionCount: sessions.length }
  }
  const metric = chooseMetric(sessions)
  if (!metric) return { exercise, status: 'insufficient', sessionCount: sessions.length }

  const assisted = isAssisted(exercise)
  const series = metricSeries(sessions, metric)
  const lastSession = sessions[sessions.length - 1]
  const topWeight = sessionTopWeight(lastSession.sets)
  const rawVerdict = trendVerdict(series)
  return {
    exercise,
    status: 'tracked',
    metric, // 'e1rm' | 'volume'
    assisted, // charge = assistance → lecture inversée, échauffement N/A
    // ASSISTÉ : assistance ↓ = progrès → on inverse la lecture (métrique inchangée, D23 intact).
    verdict: assisted ? invertVerdict(rawVerdict) : rawVerdict, // 'up' | 'flat' | 'down' | null
    series, // [{date, value}] (séances sans valeur exclues)
    current: series[series.length - 1].value,
    pr: personalRecords(sessions, metric, { assisted }),
    topWeight, // base échauffement (dernière séance)
    warmup: assisted ? [] : computeWarmup(topWeight), // monter en charge vers une assistance n'a pas de sens
    sessionCount: series.length,
  }
}

/** Analyse tout le jeu de sets → exercices suivis / insuffisants / cardio. */
export function analyzeAll(sets = []) {
  const groups = groupByExercise(sets)
  const tracked = []
  const insufficient = []
  const cardio = []
  for (const [exercise, sessions] of groups) {
    const a = analyzeExercise(exercise, sessions)
    if (a.status === 'tracked') tracked.push(a)
    else if (a.status === 'cardio') cardio.push(a)
    else insufficient.push(a)
  }
  // Suivis : les plus actifs d'abord (nb de séances avec valeur), puis alpha.
  tracked.sort((a, b) => b.sessionCount - a.sessionCount || a.exercise.localeCompare(b.exercise))
  insufficient.sort((a, b) => b.sessionCount - a.sessionCount || a.exercise.localeCompare(b.exercise))
  cardio.sort((a, b) => a.exercise.localeCompare(b.exercise))
  return { tracked, insufficient, cardio }
}
