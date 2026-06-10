import Papa from 'papaparse'
import { db, newRow } from '../db.js'

// ── Import CSV Strong (Phase 2, point 6 ROADMAP / D22) ─────────────
// Parsing en fonctions PURES + une couche I/O mince (importStrongText). Calé sur
// l'export RÉEL (tests/fixtures/strong-export-reel.csv) : en-têtes FRANÇAIS, 504
// lignes « Minuteur de repos » à filtrer, noms d'exercices à trimmer, réps en
// flottants, identité de séance = le timestamp Date répété sur chaque ligne.
//
// PÉRIMÈTRE v1 = import + dédup + log consultable. AUCUNE analyse de perf (point
// 7) ni estimation calorique : cardio (distance/secondes) capté BRUT pour servir
// plus tard un fallback énergétique (la D20 — total manuel — primera toujours).

// ── Mapping colonnes FR + EN ───────────────────────────────────────
// Détection à l'ouverture ; erreur claire si jeu d'en-têtes inconnu. Les libellés
// EN sont ceux de l'export Strong anglophone (au cas où la langue de l'app change).
const COLUMN_SYNONYMS = {
  date: ['Date'],
  workoutName: ["Nom de l'entraînement", 'Workout Name'],
  duration: ['Durée', 'Duration'],
  exercise: ["Nom de l'exercice", 'Exercise Name'],
  setOrder: ['Ordre de la série', 'Set Order'],
  weight: ['Poids', 'Weight', 'Weight (kg)'],
  reps: ['Réps', 'Reps'],
  distance: ['Distance', 'Distance (m)', 'Distance (km)'],
  seconds: ['Secondes', 'Seconds'],
  notes: ['Notes'],
  workoutNotes: ["Notes d'entraînement", 'Workout Notes'],
  rpe: ['RPE'],
}

// Colonnes SANS lesquelles on ne peut pas construire workouts/sets → format rejeté.
const REQUIRED_KEYS = ['date', 'workoutName', 'exercise', 'setOrder', 'weight', 'reps']

// Exercices cardio : capté, PAS jeté (arbitrage tranché). Détection par mot-clé
// (robuste aux variantes « Cycling (Indoor) », « Running (Treadmill) »…).
export const CARDIO_KEYWORDS = ['cycling', 'walking', 'running', 'rowing']

// Denylist échauffement/étirement (D21 option C / D22) — séance dont le NOM matche
// = PAS une « vraie séance » pour la règle d'alerte B (haut-IG jour de repos). Une
// séance mobilité pure ≈ jour métaboliquement de repos → l'alerte doit rester active.
// Normalisée trim + casse. Constante EXPORTÉE (seam unique de la règle trained).
export const WARMUP_WORKOUT_NAMES = ['échauffement / étirements']

/** Erreur d'import typée (format inconnu, fichier vide) → message UI clair. */
export class StrongImportError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'StrongImportError'
    this.code = code
  }
}

// ── Helpers purs ───────────────────────────────────────────────────

/** Normalise un nom (trim + minuscules) pour comparaison robuste. */
export function normalizeName(s) {
  return String(s ?? '').trim().toLowerCase()
}

/** Vrai si le nom de séance est une séance d'échauffement/étirement (denylist). */
export function isWarmupWorkout(name) {
  return WARMUP_WORKOUT_NAMES.includes(normalizeName(name))
}

/** Vrai si une ligne est une SÉRIE réelle : « Ordre de la série » est NUMÉRIQUE.
 *  Filtre STRUCTUREL (pas un match littéral sur « Minuteur de repos ») → tout
 *  libellé non numérique est écarté ET compté par libellé dans le rapport. */
export function isSetOrder(v) {
  return /^\d+$/.test(String(v ?? '').trim())
}

/** Cardio ssi le nom d'exercice contient un mot-clé cardio. */
export function classifyModality(exercise) {
  const e = normalizeName(exercise)
  return CARDIO_KEYWORDS.some((k) => e.includes(k)) ? 'cardio' : 'strength'
}

/** Entier depuis un flottant-string Strong (« 15.0 » → 15). Non-fini → 0. */
export function toInt(v) {
  const n = Number(String(v ?? '').trim())
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** Nombre (poids/distance/secondes), décimale POINT. Non-fini → 0. */
export function toNum(v) {
  const n = Number(String(v ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

// ── Parsing de la date — SAFARI-SAFE (durcissement A, D22) ─────────
// « 2025-12-30 20:57:41 » n'est PAS ISO (espace, pas de « T », pas de « Z ») →
// `new Date(chaîne)` renvoie Invalid Date sur WebKit/iOS alors que ça passe en
// node/Chrome. INTERDIT de passer la chaîne brute au constructeur Date.
//   - date jour     = slice des 10 premiers caractères ('YYYY-MM-DD').
//   - startedAt     = parse MANUEL par composants → new Date(année, mois, …) avec
//                     des NOMBRES (constructeur composants, sûr sur tous moteurs).

/** Jour local 'YYYY-MM-DD' depuis le timestamp Strong brut. */
export function strongDate(raw) {
  return String(raw ?? '').slice(0, 10)
}

/** Epoch ms (heure locale) depuis le timestamp Strong brut, par COMPOSANTS.
 *  Ne JAMAIS appeler new Date(raw) : voir le bloc ci-dessus. Retourne null si
 *  le format n'est pas reconnu (séance quand même importable via `date`). */
export function strongStartedAt(raw) {
  const m = String(raw ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  // new Date(NOMBRES) = constructeur par composants → identique node/Chrome/WebKit.
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime()
}

// ── Détection des colonnes ─────────────────────────────────────────
/** Mappe les en-têtes réels → clés logiques. Throw StrongImportError si une
 *  colonne requise manque (ni FR ni EN trouvée). */
export function detectColumns(headers = []) {
  const present = new Set(headers.map((h) => String(h).trim()))
  const map = {}
  for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    const hit = synonyms.find((s) => present.has(s))
    if (hit) map[key] = hit
  }
  const missing = REQUIRED_KEYS.filter((k) => !map[k])
  if (missing.length) {
    throw new StrongImportError(
      'unknown-format',
      `Format non reconnu : colonnes manquantes (${missing.join(', ')}). Attendu un export Strong (FR ou EN).`,
    )
  }
  return map
}

// ── Parsing pur : lignes → séances ─────────────────────────────────
/**
 * Transforme les lignes PapaParse (objets keyés par en-tête) en séances + rapport.
 * PUR (aucune I/O). Throw StrongImportError si format inconnu ou aucune série.
 *
 * @returns {{ sessions: Array, report: { sessions:number, sets:number,
 *   cardioSets:number, ignored: Record<string,number> } }}
 *   - sessions[i] = { workout: {strongKey,date,name,durationRaw,startedAt}, sets: [...] }
 *   - ignored : lignes écartées COMPTÉES PAR LIBELLÉ (attendu fixture : Minuteur=504).
 */
export function parseStrongRows(rows = []) {
  if (!rows.length) throw new StrongImportError('empty', 'Fichier vide : aucune ligne de données.')
  const col = detectColumns(Object.keys(rows[0]))

  const ignored = {} // libellé d'« Ordre de la série » non numérique → comptage
  const byKey = new Map() // strongKey → { workout, sets }
  let setsCount = 0
  let cardioSets = 0

  for (const r of rows) {
    const orderRaw = r[col.setOrder]
    if (!isSetOrder(orderRaw)) {
      // Filtre STRUCTUREL : pas une série. On compte par libellé (visible dans le
      // rapport) → un libellé inconnu un jour n'est PAS avalé silencieusement.
      const label = String(orderRaw ?? '').trim() || '(vide)'
      ignored[label] = (ignored[label] || 0) + 1
      continue
    }

    const strongKey = String(r[col.date] ?? '').trim()
    if (!byKey.has(strongKey)) {
      byKey.set(strongKey, {
        workout: {
          strongKey,
          date: strongDate(strongKey),
          name: String(r[col.workoutName] ?? '').trim(),
          durationRaw: col.duration ? String(r[col.duration] ?? '').trim() : '',
          startedAt: strongStartedAt(strongKey),
        },
        sets: [],
      })
    }
    const session = byKey.get(strongKey)
    const exercise = String(r[col.exercise] ?? '').trim() // espaces traînants réels
    const modality = classifyModality(exercise)
    if (modality === 'cardio') cardioSets++
    session.sets.push({
      date: session.workout.date,
      exercise,
      setIndex: toInt(orderRaw),
      reps: toInt(r[col.reps]),
      weightKg: toNum(r[col.weight]), // kg, décimale point
      distance: col.distance ? toNum(r[col.distance]) : 0, // cardio brut
      seconds: col.seconds ? toNum(r[col.seconds]) : 0, // cardio brut
      // RPE/Notes vides partout dans l'export réel : capté si présent, rien construit.
      rpe: col.rpe && String(r[col.rpe] ?? '').trim() !== '' ? toNum(r[col.rpe]) : null,
    })
    setsCount++
  }

  if (!setsCount) throw new StrongImportError('no-sets', 'Aucune série trouvée (toutes les lignes filtrées).')

  return {
    sessions: [...byKey.values()],
    report: { sessions: byKey.size, sets: setsCount, cardioSets, ignored },
  }
}

/** Parse un TEXTE CSV brut (PapaParse) → séances + rapport. Même config UI + test. */
export function parseStrongCsvText(text) {
  const parsed = Papa.parse(String(text ?? ''), { header: true, skipEmptyLines: true })
  return parseStrongRows(parsed.data)
}

// ── I/O : import en base avec idempotence ──────────────────────────
/**
 * Importe un texte CSV Strong en base. IDEMPOTENT (D22) : la dédup se fait sur
 * `strongKey` (timestamp séance) → ré-importer le même fichier (ou un export plus
 * récent qui recouvre les mêmes séances) n'ajoute AUCUN doublon. Conflit (séance
 * éditée dans Strong après un 1er import) → SKIP (replace-on-conflict DÉFÉRÉ, D22).
 *
 * Validation des en-têtes AVANT tout write (parse throw → 0 écriture). Chaque
 * séance s'écrit dans UNE transaction rw (workout + ses sets) → jamais de write
 * partiel ; l'index unique &strongKey (db.js v7) est le backstop dur anti-doublon.
 *
 * @returns rapport enrichi : { sessions, sets, cardioSets, ignored, added, skipped, setsAdded }
 */
export async function importStrongText(text) {
  const { sessions, report } = parseStrongCsvText(text) // throw AVANT tout write
  let added = 0
  let skipped = 0
  let setsAdded = 0

  for (const s of sessions) {
    const exists = await db.workouts.where('strongKey').equals(s.workout.strongKey).first()
    if (exists) {
      skipped++ // déjà importée → dédup (jamais de doublon)
      continue
    }
    await db.transaction('rw', db.workouts, db.sets, async () => {
      const workoutRow = newRow({ ...s.workout, source: 'strong-import' })
      await db.workouts.add(workoutRow)
      const setRows = s.sets.map((set) => newRow({ ...set, workoutId: workoutRow.id }))
      if (setRows.length) await db.sets.bulkAdd(setRows)
    })
    added++
    setsAdded += s.sets.length
  }

  return { ...report, added, skipped, setsAdded }
}

// ── Lecture : log consultable (écran Perf) ─────────────────────────
/** Séances en base, les plus récentes d'abord (par startedAt, fallback date). */
export async function loadWorkouts() {
  const all = await db.workouts.toArray()
  return all.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0) || String(b.date).localeCompare(String(a.date)))
}

/** Séries d'une séance, dans l'ordre de saisie (setIndex), groupables par exercice. */
export async function loadSetsForWorkout(workoutId) {
  const sets = await db.sets.where('workoutId').equals(workoutId).toArray()
  return sets.sort((a, b) => (a.setIndex ?? 0) - (b.setIndex ?? 0))
}
