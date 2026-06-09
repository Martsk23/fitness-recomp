import { db, newRow, touch } from '../db.js'
import { todayKey } from '../ui.js'

// ── Tickers : logique d'état journalier (D3) ───────────────────────
// Une ligne tickerStates par (tickerId, date). ABSENCE de ligne pour
// aujourd'hui = valeur 0 → reset automatique à minuit SANS cron : demain,
// aucune ligne ne correspond à la nouvelle date → tout repart à 0.

/** Borne basse à 0 : un compteur ne descend jamais sous zéro. */
export const clampCounter = (v) => Math.max(0, v)

/**
 * Valeur suivante d'un ticker selon l'action.
 *  - counter : 'inc' = +1, 'dec' = −1 (borné à 0)
 *  - checkbox : 'toggle' = bascule 0 ↔ 1 (toute valeur vraie → 0)
 * Pur et déterministe (testé en node).
 */
export function nextValue(config, current, action) {
  if (config.type === 'counter') {
    if (action === 'inc') return clampCounter(current + 1)
    if (action === 'dec') return clampCounter(current - 1)
    return current
  }
  if (config.type === 'checkbox') return current ? 0 : 1
  return current
}

/** Tickers actifs, triés par `order`. */
export async function loadActiveConfigs() {
  const rows = await db.tickerConfigs.orderBy('order').toArray()
  return rows.filter((t) => t.active)
}

/** Map tickerId → valeur pour une date (défaut = aujourd'hui). Absence ⇒ clé absente ⇒ 0 côté lecteur. */
export async function loadStates(date = todayKey()) {
  const rows = await db.tickerStates.where('date').equals(date).toArray()
  const map = {}
  for (const r of rows) map[r.tickerId] = r.value
  return map
}

/**
 * Écrit la valeur du ticker pour la date (upsert sur la clé (tickerId, date)).
 * newRow() à la 1ʳᵉ écriture du jour (UUID + updatedAt), touch() ensuite —
 * jamais de doublon par (ticker, jour). On garde une ligne à 0 plutôt que de
 * la supprimer : 0 explicite et absence (= 0) sont équivalents pour la lecture.
 */
export async function setValue(tickerId, value, date = todayKey()) {
  const existing = await db.tickerStates.where('[tickerId+date]').equals([tickerId, date]).first()
  if (existing) await db.tickerStates.put(touch({ ...existing, value }))
  else await db.tickerStates.add(newRow({ tickerId, date, value }))
}
