import { db, newRow, touch } from '../db.js'
import { todayKey } from '../ui.js'

// ── Consommé TOTAL du jour (saisie rapide, 1 nombre) ───────────────
// Table dédiée `dailyIntake` : { id, date, kcal, updatedAt }, 1 ligne par date,
// index unique &date. ABSENCE de ligne = consommé NON SAISI (null, JAMAIS 0).
// Symétrique de `dailyExpenditure` (Tâche 4) : saisie en 2 s après la séance,
// SANS détail macros. Réconciliation avec le futur journal nutrition : voir
// `effectiveConsumed` + DECISIONS.md D17 (provisoire, tranchée au chantier
// nutrition). Upsert sur la clé `date` : newRow() à la 1ʳᵉ écriture du jour
// (UUID + updatedAt), touch() ensuite → jamais de doublon par date (D3/D10/D11).

/** Total consommé saisi pour la date, ou null si non saisi (absence de ligne). */
export async function loadIntake(date = todayKey()) {
  const row = await db.dailyIntake.where('date').equals(date).first()
  return row ? row.kcal : null
}

/**
 * Upsert du consommé total du jour (kcal = entier ≥ 0).
 * ATOMIQUE : lecture + écriture dans une seule transaction rw (même garantie
 * que setExpenditure). L'index unique `&date` (db.js) est le backstop dur :
 * un doublon échouerait bruyamment au lieu de passer en silence.
 */
export async function setIntake(kcal, date = todayKey()) {
  await db.transaction('rw', db.dailyIntake, async () => {
    const existing = await db.dailyIntake.where('date').equals(date).first()
    if (existing) await db.dailyIntake.put(touch({ ...existing, kcal }))
    else await db.dailyIntake.add(newRow({ date, kcal }))
  })
}

/** Efface le consommé du jour → revient à « non saisi » (ligne supprimée). */
export async function clearIntake(date = todayKey()) {
  const existing = await db.dailyIntake.where('date').equals(date).first()
  if (existing) await db.dailyIntake.delete(existing.id)
}

/**
 * Consommé EFFECTIF = total manuel s'il est saisi, sinon somme du journal.
 * SEAM UNIQUE de la règle D17 (PROVISOIRE) : le `??` n'existe qu'ICI, nulle
 * part ailleurs. La règle définitive (override vs somme+ajustement, voire
 * inputs mutuellement exclusifs par date) sera tranchée au chantier nutrition.
 *
 * VERROU NULLISH : `manualTotal` à 0 est un total RÉEL (il prime), PAS une
 * absence — seuls null/undefined retombent sur la somme du journal.
 */
export function effectiveConsumed(manualTotal, journalSum) {
  return manualTotal ?? (journalSum || 0)
}
