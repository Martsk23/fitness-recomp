// ── Variantes anti-plateau (Phase 2, point 7 / D23) — donnée de RÉFÉRENCE ──
// Table STATIQUE et LOCALE (v1). Exercice → variantes du même schéma de
// mouvement, à proposer quand un exercice stagne/régresse. PAS d'IA (Phase 3) :
// pure correspondance de code, comme ingredientsSeed (donnée de référence).
// Clés NORMALISÉES (trim + minuscules) → lookup robuste aux espaces/casse de Strong.
//
// Couvre les exercices récurrents de la bibliothèque réelle ; un exercice absent
// renvoie [] (aucune suggestion, jamais d'erreur). Enrichissable.

import { normalizeName } from '../lib/strongImport.js'

const VARIANTS = {
  // ── Pectoraux ──
  'chest dip (assisted)': ['Bench Press (Dumbbell)', 'Incline Bench Press (Dumbbell)', 'Chest Press (Machine)'],
  'bench press (dumbbell)': ['Bench Press (Barbell)', 'Incline Bench Press (Dumbbell)', 'Chest Press (Machine)'],
  'incline bench press (dumbbell)': ['Bench Press (Dumbbell)', 'Incline Bench Press (Barbell)', 'Chest Press (Machine)'],
  'chest fly': ['Pec Deck (Machine)', 'Cable Fly', 'Incline Bench Press (Dumbbell)'],
  'pec deck (machine)': ['Chest Fly', 'Cable Fly', 'Chest Press (Machine)'],

  // ── Dos ──
  'pull up (assisted)': ['Lat Pulldown (Cable)', 'Lat Pulldown (Machine)', 'Seated Row (Cable)'],
  'lat pulldown (cable)': ['Pull Up (Assisted)', 'Lat Pulldown (Machine)', 'Seated Row (Cable)'],
  'lat pulldown (machine)': ['Lat Pulldown (Cable)', 'Pull Up (Assisted)', 'Seated Row (Cable)'],
  'seated row (cable)': ['Iso-Lateral Row (Machine)', 'Bent Over Row (Barbell)', 'Lat Pulldown (Cable)'],
  'iso-lateral row (machine)': ['Seated Row (Cable)', 'Bent Over Row (Barbell)', 'Lat Pulldown (Cable)'],
  'bent over row (barbell)': ['Seated Row (Cable)', 'Iso-Lateral Row (Machine)', 'Lat Pulldown (Cable)'],

  // ── Jambes ──
  'leg extension (machine)': ['Hack Squat', 'Leg Press', 'Squat (Dumbbell)'],
  'leg press': ['Hack Squat', 'Leg Extension (Machine)', 'Squat (Dumbbell)'],
  'leg press iso': ['Leg Press', 'Hack Squat', 'Leg Extension (Machine)'],
  'hack squat': ['Leg Press', 'Leg Extension (Machine)', 'Squat (Dumbbell)'],
  'seated leg curl (machine)': ['Lying Leg Curl (Machine)', 'Back Extension (Machine)'],
  'lying leg curl (machine)': ['Seated Leg Curl (Machine)', 'Back Extension (Machine)'],
  'hip abductor (machine)': ['Hip Adductor (Machine)'],
  'hip adductor (machine)': ['Hip Abductor (Machine)'],
  'calf press on leg press': ['Seated Calf Raise (Plate Loaded)'],
  'seated calf raise (plate loaded)': ['Calf Press on Leg Press'],

  // ── Épaules ──
  'shoulder press (machine)': ['Seated Overhead Press (Dumbbell)', 'Overhead Press (Smith Machine)', 'Lateral Raise (Machine)'],
  'seated overhead press (dumbbell)': ['Shoulder Press (Machine)', 'Overhead Press (Smith Machine)'],
  'overhead press (smith machine)': ['Shoulder Press (Machine)', 'Seated Overhead Press (Dumbbell)'],
  'lateral raise (machine)': ['Lateral Raise (Dumbbell)', 'Shoulder Press (Machine)'],

  // ── Biceps ──
  'bicep curl (cable)': ['Bicep Curl (Dumbbell)', 'Bicep Curl (Barbell)', 'Hammer Curl (Dumbbell)'],
  'bicep curl (dumbbell)': ['Bicep Curl (Cable)', 'Bicep Curl (Barbell)', 'Hammer Curl (Dumbbell)'],
  'bicep curl (barbell)': ['Bicep Curl (Dumbbell)', 'Bicep Curl (Cable)', 'Hammer Curl (Dumbbell)'],
  'hammer curl (dumbbell)': ['Bicep Curl (Dumbbell)', 'Bicep Curl (Cable)'],

  // ── Triceps ──
  'triceps pushdown (cable - straight bar)': ['Triceps Extension', 'Chest Dip (Assisted)'],
  'triceps extension': ['Triceps Pushdown (Cable - Straight Bar)', 'Chest Dip (Assisted)'],
}

/** Variantes anti-plateau d'un exercice (donnée statique v1). [] si inconnu. */
export function variantsFor(exercise) {
  return VARIANTS[normalizeName(exercise)] ?? []
}
