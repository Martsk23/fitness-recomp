import { db, newRow, touch } from '../db.js'
import { todayKey } from '../ui.js'

// ── Dépense énergétique du jour (Tâche 4) ──────────────────────────
// Une ligne `dailyExpenditure` par date : { id, date, kcal, updatedAt }.
// La valeur saisie = dépense TOTALE du jour (repos + activité, ≈ TDEE réel),
// pas seulement le sport — un seul nombre, saisie rapide (pas de HealthKit).
// ABSENCE de ligne = dépense NON SAISIE (≠ 0). Upsert sur la clé `date` :
// newRow() à la 1ʳᵉ écriture du jour (UUID + updatedAt), touch() ensuite →
// jamais de doublon par date (même invariant que les tickers, D3/D10/D11).

/** Dépense totale saisie pour la date, ou null si non saisie (absence de ligne). */
export async function loadExpenditure(date = todayKey()) {
  const row = await db.dailyExpenditure.where('date').equals(date).first()
  return row ? row.kcal : null
}

/**
 * Upsert de la dépense du jour (kcal = entier ≥ 0).
 * ATOMIQUE : la lecture + l'écriture s'exécutent dans une seule transaction rw.
 * IndexedDB sérialise les transactions rw de même scope → deux setExpenditure
 * concurrents sur la même date ne peuvent pas faire chacun un `add` (le 2ᵉ voit
 * la ligne du 1ᵉʳ → update). L'index unique `&date` (db.js) est le backstop dur :
 * un doublon échouerait bruyamment au lieu de passer silencieusement.
 */
export async function setExpenditure(kcal, date = todayKey()) {
  await db.transaction('rw', db.dailyExpenditure, async () => {
    const existing = await db.dailyExpenditure.where('date').equals(date).first()
    if (existing) await db.dailyExpenditure.put(touch({ ...existing, kcal }))
    else await db.dailyExpenditure.add(newRow({ date, kcal }))
  })
}

/** Efface la dépense du jour → revient à « non saisi » (suppression de la ligne). */
export async function clearExpenditure(date = todayKey()) {
  const existing = await db.dailyExpenditure.where('date').equals(date).first()
  if (existing) await db.dailyExpenditure.delete(existing.id)
}

/**
 * Bilan = consommé − dépensé (jamais stocké, toujours recalculé).
 *  - négatif = déficit (sous la dépense), positif = surplus.
 *  - null si la dépense n'est pas saisie (rien à comparer).
 * Pur et déterministe. La gestion de l'état « consommé non encore suivi »
 * (journal vide tant que la nutrition n'est pas implémentée) est faite côté UI.
 */
export function energyBalance(consumedKcal, expenditureKcal) {
  if (expenditureKcal == null) return null
  return Math.round((consumedKcal || 0) - expenditureKcal)
}
