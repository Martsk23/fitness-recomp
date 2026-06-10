// Test analyse de perf (node pur, sans navigateur). CALÉ SUR LA FIXTURE RÉELLE
// tests/fixtures/strong-export-reel.csv. Prouve :
//  - e1RM Epley (valeur exacte) + plafond de reps (série > 12 reps non valide) ;
//  - DURCISSEMENT D23 anti-mélange : un exo HAUT-REPS → suivi VOLUME étiqueté,
//    JAMAIS une flèche issue d'une comparaison e1RM↔volume ;
//  - choix de métrique PAR EXERCICE (≥3 séances à top-set valide → e1RM) ;
//  - gate « données insuffisantes » < 3 séances (jamais extrapolé sur 2 points) ;
//  - verdict ↑/→/↓ bande ±2,5 %, une séance molle isolée ≠ régression ;
//  - cardio exclu de l'analyse force ;
//  - échauffement (arrondi 2,5, drop palier, plancher, N/A bodyweight) ;
//  - variantes (exo connu → liste, inconnu → []).
import { readFileSync } from 'node:fs'
import { parseStrongCsvText } from '../src/lib/strongImport.js'
import {
  epley,
  isValidE1rmSet,
  sessionE1rm,
  sessionTopWeight,
  sessionVolume,
  groupByExercise,
  chooseMetric,
  metricSeries,
  trendVerdict,
  invertVerdict,
  isAssisted,
  personalRecords,
  computeWarmup,
  roundToIncrement,
  analyzeExercise,
  analyzeAll,
  EPLEY_REP_CAP,
  MIN_SESSIONS,
} from '../src/lib/perf.js'
import { variantsFor } from '../src/data/exerciseVariants.js'

let exitCode = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) exitCode = 1
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// Fixture ancrée sur le fichier de test (portable, pas de chemin machine).
const FIXTURE = readFileSync(new URL('./fixtures/strong-export-reel.csv', import.meta.url), 'utf-8')
// Tous les sets de la fixture (séances aplaties), comme en base après import.
const ALL_SETS = parseStrongCsvText(FIXTURE).sessions.flatMap((s) => s.sets)

// ── E — e1RM Epley + plafond de reps ───────────────────────────────
function e_epley() {
  console.log('\n— E : e1RM Epley + plafond de reps —')
  ok(approx(epley(100, 5), 100 * (1 + 5 / 30)), 'Epley 100×5 = 116,67')
  ok(approx(epley(60, 1), 60), 'Epley d’un single = la charge brute')
  ok(isValidE1rmSet({ weightKg: 50, reps: 8 }), 'série 50×8 valide')
  ok(!isValidE1rmSet({ weightKg: 50, reps: 20 }), `série 50×20 NON valide (reps > ${EPLEY_REP_CAP})`)
  ok(!isValidE1rmSet({ weightKg: 0, reps: 10 }), 'série bodyweight (poids 0) NON valide pour l’e1RM')
  // top-set = max e1RM parmi les VALIDES, pas la charge max brute :
  // 40×12 → e1RM 56 ; 50×3 → e1RM 55 ; 60×20 (invalide) ignorée.
  const sets = [
    { weightKg: 40, reps: 12 },
    { weightKg: 50, reps: 3 },
    { weightKg: 60, reps: 20 },
  ]
  ok(approx(sessionE1rm(sets), 56), 'top-set e1RM = max des valides (40×12), pas la charge max brute (60)')
  ok(sessionE1rm([{ weightKg: 50, reps: 20 }]) === null, 'aucune série valide → sessionE1rm null')
  ok(sessionTopWeight(sets) === 60, 'charge de travail = poids max travaillé (reps>0), e1RM-agnostique')
  ok(sessionVolume([{ weightKg: 50, reps: 10 }, { weightKg: 40, reps: 8 }]) === 820, 'volume = Σ poids×reps')
}

// ── F — choix de métrique par EXERCICE sur la fixture réelle ───────
function f_metricChoice() {
  console.log('\n— F : choix de métrique PAR EXERCICE (fixture réelle) —')
  const groups = groupByExercise(ALL_SETS)
  const chestDip = groups.get('Chest Dip (Assisted)')
  ok(chestDip.length === 12, 'Chest Dip (Assisted) = 12 séances groupées (exercice, jour)')
  ok(chooseMetric(chestDip) === 'e1rm', 'Chest Dip ≥3 séances à top-set valide → métrique e1RM')

  const { tracked, insufficient, cardio } = analyzeAll(ALL_SETS)
  // Réalité fixture (profilée) : 16 exos e1RM, 0 volume naturel, 32 insuffisants, 4 cardio.
  ok(tracked.length === 16, `16 exos suivis (réalité fixture) — obtenu ${tracked.length}`)
  ok(tracked.every((t) => t.metric === 'e1rm'), 'tous les exos suivis de la fixture sont en e1RM (0 volume naturel)')
  ok(insufficient.length === 32, `32 exos insuffisants (< ${MIN_SESSIONS} séances) — obtenu ${insufficient.length}`)
  ok(cardio.length === 4, `4 exos cardio exclus de l’analyse force — obtenu ${cardio.length}`)
  ok(
    cardio.map((c) => c.exercise).sort().join(',') === 'Cycling (Indoor),Rowing (Machine),Running (Treadmill),Walking',
    'cardio = Cycling/Rowing/Running/Walking (exclus, label explicite)',
  )
}

// ── G — gate insuffisance : jamais extrapolé sur 2 points ──────────
function g_insufficient() {
  console.log('\n— G : gate « données insuffisantes » —')
  const groups = groupByExercise(ALL_SETS)
  // Pec Deck = 2 séances → insuffisant, AUCUN verdict.
  const pecDeck = analyzeExercise('Pec Deck (Machine)', groups.get('Pec Deck (Machine)'))
  ok(pecDeck.status === 'insufficient', 'Pec Deck (2 séances) → status insufficient')
  ok(pecDeck.verdict === undefined, 'exo insuffisant → AUCUN verdict (pas de flèche sur 2 points)')
  ok(trendVerdict([{ date: 'a', value: 10 }, { date: 'b', value: 20 }]) === null, 'trendVerdict sur 2 points → null')
}

// ── H — DURCISSEMENT D23 anti-mélange : haut-reps → VOLUME étiqueté ─
function h_antiMix() {
  console.log('\n— H : anti-mélange e1RM/volume (durcissement D23) —')
  // Exo SYNTHÉTIQUE type « Calf » : toutes les séances en haut-reps (> EPLEY_REP_CAP)
  // → AUCUN top-set valide → l’exercice ENTIER bascule au VOLUME. La fixture réelle
  // ne produit aucun exo ≥3 séances tout-haut-reps (profilé : 0) → série construite.
  const sessions = [
    { date: '2026-01-01', sets: [{ weightKg: 100, reps: 25 }, { weightKg: 100, reps: 22 }] }, // vol 4700
    { date: '2026-01-08', sets: [{ weightKg: 110, reps: 25 }, { weightKg: 110, reps: 24 }] }, // vol 5390
    { date: '2026-01-15', sets: [{ weightKg: 120, reps: 25 }, { weightKg: 120, reps: 24 }] }, // vol 5880
  ]
  ok(sessions.every((s) => sessionE1rm(s.sets) === null), 'séances tout-haut-reps → aucun e1RM valide')
  ok(chooseMetric(sessions) === 'volume', 'exo haut-reps → métrique VOLUME (jamais e1RM)')
  const a = analyzeExercise('Calf Raise (synthétique)', sessions)
  ok(a.status === 'tracked' && a.metric === 'volume', 'analyse → suivi VOLUME étiqueté')
  const series = metricSeries(sessions, 'volume')
  ok(series.length === 3 && series.every((p) => p.value > 1000), 'série de volume (Σ poids×reps), pas d’e1RM')
  ok(a.verdict === 'up', 'volume strictement croissant → ↑ (comparaison volume↔volume UNIQUEMENT)')
  // Preuve dure du NON-mélange : la valeur courante est un volume (~5880), pas un e1RM (~150).
  ok(a.current > 1000, 'valeur courante = volume (~5880), jamais un e1RM extrapolé')
}

// ── I — verdict ±2,5 %, séance molle isolée ≠ régression ───────────
function i_verdict() {
  console.log('\n— I : verdict ↑/→/↓ + robustesse au bruit —')
  // Progression nette.
  ok(trendVerdict([{ value: 100 }, { value: 105 }, { value: 110 }].map((p, i) => ({ date: i, ...p }))) === 'up', 'série croissante → ↑')
  // Stagnation dans la bande.
  ok(trendVerdict([{ value: 100 }, { value: 101 }, { value: 100.5 }].map((p, i) => ({ date: i, ...p }))) === 'flat', 'variations < 2,5 % → →')
  // Régression nette.
  ok(trendVerdict([{ value: 110 }, { value: 105 }, { value: 100 }].map((p, i) => ({ date: i, ...p }))) === 'down', 'série décroissante → ↓')
  // Séance MOLLE isolée en dernier, mais l’avant-dernière tient le plafond → état
  // courant = max(2 dernières) absorbe le creux → PAS une régression.
  const dip = [{ value: 100 }, { value: 108 }, { value: 95 }].map((p, i) => ({ date: i, ...p }))
  ok(trendVerdict(dip) !== 'down', 'séance molle isolée (108 puis 95) → état = max(2 dern.) → PAS ↓')
  ok(trendVerdict(dip) === 'up', '… et reste ↑ car 108 > 100 × 1,025')
}

// ── J — PR all-time dérivés ────────────────────────────────────────
function j_pr() {
  console.log('\n— J : records all-time dérivés —')
  const sessions = [
    { date: 'a', sets: [{ weightKg: 50, reps: 8 }] }, // e1RM 63,33
    { date: 'b', sets: [{ weightKg: 60, reps: 6 }] }, // e1RM 72  ← record
    { date: 'c', sets: [{ weightKg: 55, reps: 8 }] }, // e1RM 69,67 (récent < record)
  ]
  const pr = personalRecords(sessions, 'e1rm')
  ok(approx(pr.best, 72), 'meilleur e1RM all-time = 72 (60×6)')
  ok(pr.loadExtreme === 60, 'charge max all-time = 60 kg')
  ok(pr.isRecentPR === false, 'dernière séance (69,67) sous le record → pas de PR récent')
  const sessions2 = [...sessions, { date: 'd', sets: [{ weightKg: 65, reps: 6 }] }] // e1RM 78 ← nouveau record récent
  ok(personalRecords(sessions2, 'e1rm').isRecentPR === true, 'séance récente bat le record → PR récent')
}

// ── M — exercices ASSISTÉS : lecture inversée (contresens sémantique) ─
function m_assisted() {
  console.log('\n— M : exercices assistés (charge = assistance, lecture inversée) —')
  ok(isAssisted('Chest Dip (Assisted)') && isAssisted('  PULL UP (ASSISTED) '), 'détection « (Assisted) » trim+casse')
  ok(isAssisted('Tractions assistées'), 'détection FR « assisté/assistée »')
  ok(!isAssisted('Bench Press (Dumbbell)'), 'exo non assisté → false')
  ok(invertVerdict('up') === 'down' && invertVerdict('down') === 'up' && invertVerdict('flat') === 'flat', 'invertVerdict ↑↔↓, → inchangé')

  // FIXTURE RÉELLE : Chest Dip (Assisted), l'assistance e1RM CHUTE dans le temps
  // (86 → ~30-39) = MOINS d'aide = PLUS fort → verdict doit être ↑ (pas ↓).
  const groups = groupByExercise(ALL_SETS)
  const chestDip = analyzeExercise('Chest Dip (Assisted)', groups.get('Chest Dip (Assisted)'))
  ok(chestDip.assisted === true, 'Chest Dip (Assisted) marqué assisté')
  // Verdict brut (non inversé) sur l'assistance décroissante = down ; inversé = up.
  ok(trendVerdict(chestDip.series) === 'down', 'assistance décroissante → verdict BRUT down')
  ok(chestDip.verdict === 'up', 'verdict LU inversé → ↑ progresse (contresens corrigé)')
  ok(chestDip.warmup.length === 0, 'assisté → échauffement N/A')
  // PR assisté = MIN d'assistance all-time (pas le max).
  const minE1rm = Math.min(...chestDip.series.map((p) => p.value))
  ok(approx(chestDip.pr.best, minE1rm), 'PR assisté = MINIMUM d’assistance all-time')

  // Pull Up (Assisted) : même logique (assistance 69 → 53).
  const pullUp = analyzeExercise('Pull Up (Assisted)', groups.get('Pull Up (Assisted)'))
  ok(pullUp.verdict === 'up', 'Pull Up (Assisted) assistance ↓ → ↑ progresse')
}

// ── K — échauffement : montée en charge dérivée ────────────────────
function k_warmup() {
  console.log('\n— K : échauffement (paliers, arrondi 2,5, plancher) —')
  ok(roundToIncrement(53.7) === 52.5 || roundToIncrement(53.7) === 55, 'arrondi à 2,5 kg')
  ok(roundToIncrement(8) === 7.5, 'roundToIncrement(8) = 7,5')
  const w = computeWarmup(100)
  ok(JSON.stringify(w) === JSON.stringify([{ weight: 40, reps: 8 }, { weight: 60, reps: 5 }, { weight: 75, reps: 3 }, { weight: 90, reps: 1 }]),
    'top-set 100 kg → 40/60/75/90 × 8/5/3/1')
  ok(w.every((s) => s.weight < 100), 'tous les paliers restent sous la charge de travail')
  ok(computeWarmup(15).length === 0, 'charge 15 kg < plancher → pas d’échauffement (N/A)')
  ok(computeWarmup(0).length === 0, 'charge 0 (bodyweight/cardio) → pas d’échauffement')
  // Drop de palier : deux % consécutifs arrondissent à la même charge → strictement croissant.
  const monotonic = computeWarmup(25)
  ok(monotonic.every((s, i) => i === 0 || s.weight > monotonic[i - 1].weight), 'paliers strictement croissants (drop des collisions)')
}

// ── L — variantes statiques ────────────────────────────────────────
function l_variants() {
  console.log('\n— L : variantes anti-plateau (statiques) —')
  const v = variantsFor('Leg Extension (Machine)')
  ok(v.length >= 1 && v.includes('Hack Squat'), 'exo connu → variantes (Leg Extension → Hack Squat…)')
  ok(variantsFor('  CHEST DIP (ASSISTED)  ').length >= 1, 'lookup robuste au trim + casse')
  ok(variantsFor('Exo Inexistant XYZ').length === 0, 'exo inconnu → [] (aucune erreur)')
}

e_epley()
f_metricChoice()
g_insufficient()
h_antiMix()
i_verdict()
j_pr()
k_warmup()
l_variants()
m_assisted()

console.log(`\n${exitCode === 0 ? 'TOUS LES TESTS PASSENT' : 'ÉCHECS DÉTECTÉS'}`)
process.exit(exitCode)
