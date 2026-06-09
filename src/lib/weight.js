// Logique pure du suivi du poids (aucune dépendance Dexie/DOM → testable en node).

// Fenêtre de la moyenne glissante = nombre de POINTS, pas de jours.
export const MA_WINDOW = 7

// Heure (locale) avant laquelle on considère qu'on est "le matin" pour la pesée.
export const MORNING_END_HOUR = 12

/**
 * Moyenne glissante "trailing" sur les `window` derniers points (ancien → récent).
 * Renvoie un tableau aligné sur `values` : ma[i] = moyenne de values[i-window+1 .. i].
 *
 * CAVEAT déterminant — la fenêtre compte des POINTS, pas des jours calendaires.
 * Si des pesées sont sautées, ces N points couvrent plus de jours réels → la
 * tendance devient bruitée et en retard. Le lissage par fenêtre calendaire
 * (7 jours réels) est volontairement REPORTÉ (cf. ROADMAP 1.1) : ne pas coder
 * le calendaire ici tant que l'usage réel ne le justifie pas.
 */
export function movingAverage(values, window = MA_WINDOW) {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1)
    const slice = values.slice(start, i + 1)
    return slice.reduce((sum, v) => sum + v, 0) / slice.length
  })
}

/**
 * Tendance : delta (kg) entre la moyenne glissante la plus récente et celle
 * d'environ `window` points plus tôt. Neutre par défaut (recomp → le poids
 * peut stagner ; pas de jugement "bien/mal" ici).
 */
export function trend(values, window = MA_WINDOW) {
  if (values.length < 2) return { direction: 'flat', deltaKg: 0 }
  const ma = movingAverage(values, window)
  const last = ma[ma.length - 1]
  const refIdx = Math.max(0, ma.length - 1 - window)
  const deltaKg = last - ma[refIdx]
  const direction = Math.abs(deltaKg) < 0.1 ? 'flat' : deltaKg < 0 ? 'down' : 'up'
  return { direction, deltaKg }
}

/**
 * "Bon moment pour te peser" : le matin (avant MORNING_END_HOUR) ET aucune
 * pesée encore enregistrée aujourd'hui.
 */
export function shouldWeighNow({ hasLoggedToday, now = new Date() }) {
  if (hasLoggedToday) return false
  return now.getHours() < MORNING_END_HOUR
}
