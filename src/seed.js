import { db, nowMs, newRow, touch, SETTINGS_KEY } from './db.js'
import { SUGARS_SIMPLE_MAX } from './lib/metabolic.js'
import { INGREDIENTS_SEED } from './data/ingredientsSeed.js'
import { DRINKS_SEED } from './data/drinksSeed.js'

// Tickers par défaut : eau (compteur de verres) + compléments (cases).
// Non-perso → OK de les seeder pour tout le monde.
const DEFAULT_TICKERS = [
  { label: 'Eau', type: 'counter', target: 8, icon: 'droplet', order: 1, active: true },
  { label: 'Créatine', type: 'checkbox', target: 1, icon: 'pill', order: 2, active: true },
  { label: 'Vitamine D', type: 'checkbox', target: 1, icon: 'pill', order: 3, active: true },
  { label: 'Oméga-3', type: 'checkbox', target: 1, icon: 'pill', order: 4, active: true },
]

// Réglages de départ (Tâche 2). Plus de cibles kcal/macros en dur : elles sont
// CALCULÉES par l'onboarding depuis le profil (moteur metabolic.js). On amorce
// donc sans profil → l'app affiche l'onboarding au 1er lancement. Seule la règle
// sucres simples (DÉJÀ ACTÉE) est seedée, car non dérivée du profil.
const DEFAULT_SETTINGS = {
  id: SETTINGS_KEY,
  profile: null,
  targetsSource: 'fallback', // 'computed' une fois l'onboarding fait
  targetKcal: null,
  targetProtein: null,
  targetCarb: null,
  targetFat: null,
  targetSugarsSimple: SUGARS_SIMPLE_MAX,
  preferences: {},
}

// Amorce la base uniquement au premier lancement (idempotent).
export async function seedIfEmpty() {
  const alreadySeeded = (await db.settings.count()) > 0
  if (alreadySeeded) return

  await db.transaction('rw', db.settings, db.tickerConfigs, async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS, updatedAt: nowMs() })
    await db.tickerConfigs.bulkAdd(DEFAULT_TICKERS.map(newRow))
  })
}

// Amorce la bibliothèque d'ingrédients (58 ingrédients bruts /100 g).
// GARDÉ PAR UN FLAG EXPLICITE `settings.librarySeededV1`, PAS par « table vide »
// ni par `settings.count()` :
//  - le device est DÉJÀ initialisé (settings existe) → un seed gardé par
//    `seedIfEmpty` ne partirait jamais ; ce flag le débloque une fois.
//  - le flag vit DANS `settings`, donc il VOYAGE avec l'export/import : un
//    backup pris APRÈS le seed porte le flag → ré-import = pas de re-seed, même
//    si l'utilisateur a vidé sa bibliothèque (≠ garde « table vide » qui
//    re-seederait après un backup légitimement vide).
// Idempotent : une fois le flag posé, ne refait rien.
export async function seedLibraryIfNeeded() {
  const s = await db.settings.get(SETTINGS_KEY)
  if (!s || s.librarySeededV1) return // pas de settings → seedIfEmpty s'en charge ; déjà seedé → stop

  await db.transaction('rw', db.settings, db.ingredients, async () => {
    // createdAt estampillé à l'insertion (null dans le fichier seed).
    const now = nowMs()
    // CEINTURE + BRETELLES (le flag reste le garde PRIMAIRE) : l'id slug ÉTANT la
    // PK, on n'insère QUE les ids absents. Un re-run accidentel (flag sauté, ordre
    // de boot inattendu) ne peut alors NI dupliquer NI throw une ConstraintError
    // (`bulkAdd` sur clé existante) qui planterait le boot. On n'utilise PAS
    // `bulkPut` : un ingrédient seedé que l'utilisateur a édité (même id slug) est
    // PRÉSENT → sauté, jamais réécrit aux valeurs du seed.
    const existing = new Set(await db.ingredients.toCollection().primaryKeys())
    const missing = INGREDIENTS_SEED.filter((ing) => !existing.has(ing.id))
    if (missing.length) await db.ingredients.bulkAdd(missing.map((ing) => newRow({ ...ing, createdAt: now })))
    await db.settings.put(touch({ ...s, librarySeededV1: true }))
  })
}

// Amorce la base boissons (38 boissons alcoolisées, valeurs PAR PORTION).
// GARDÉ PAR UN FLAG `settings.drinksSeededV1` — calque EXACT de seedLibraryIfNeeded
// (D18) : part même sur un device déjà initialisé ; le flag vit dans `settings`,
// donc voyage avec l'export/import (un backup pris après le seed ne re-seede pas).
// Ceinture + bretelles : on n'insère QUE les ids slug absents (l'id ÉTANT la PK) →
// un re-run accidentel ne peut ni dupliquer ni throw, et n'écrase jamais une
// boisson éditée (pas de bulkPut). Idempotent.
export async function seedDrinksIfNeeded() {
  const s = await db.settings.get(SETTINGS_KEY)
  if (!s || s.drinksSeededV1) return

  await db.transaction('rw', db.settings, db.drinks, async () => {
    const now = nowMs()
    const existing = new Set(await db.drinks.toCollection().primaryKeys())
    const missing = DRINKS_SEED.filter((d) => !existing.has(d.id))
    if (missing.length) await db.drinks.bulkAdd(missing.map((d) => newRow({ ...d, createdAt: now })))
    await db.settings.put(touch({ ...s, drinksSeededV1: true }))
  })
}
