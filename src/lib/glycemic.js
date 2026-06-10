// ── Intelligence glucidique du jour (Phase 2, D21) — logique PURE ──
// Tout se dérive du journal du jour : chaque `journalEntry` porte `carb`
// (grammes) et `gi ∈ {low, mid, high}` FIGÉS à la saisie (D5/D18). Aucune
// donnée stockée ici — pur calcul, déterministe, testable en node.
//
// Pondération : la composition IG se mesure en GRAMMES DE GLUCIDES par niveau
// d'IG (l'IG qualifie le glucide ; une entrée ~0 g de carb pèse ~0). Les sucres
// simples sont un axe SÉPARÉ (règle A), pas mélangés à la composition IG.

// Seuils — SEAM UNIQUE (calque effectiveConsumed/D20) : aucune autre expression
// de seuil glucidique ailleurs dans l'app. Toute évolution se fait ICI.
export const HIGH_GI_REST_SHARE = 0.5 // part de glucides haut-IG déclenchant l'alerte B
export const MIN_CARB_FLOOR = 50 // plancher (g) sous lequel B ne crie pas (journée ~sans glucides)

const GI_BUCKETS = new Set(['low', 'mid', 'high'])

/**
 * Grammes de glucides ventilés par niveau d'IG.
 * `gi` absent ou hors {low,mid,high} → bucket DÉFENSIF `unknown` (D18 le copie
 * toujours, mais on ne crashe jamais sur une donnée legacy/corrompue).
 */
export function carbsByGi(entries = []) {
  const g = { low: 0, mid: 0, high: 0, unknown: 0 }
  for (const e of entries) {
    const c = e?.carb || 0
    const bucket = GI_BUCKETS.has(e?.gi) ? e.gi : 'unknown'
    g[bucket] += c
  }
  return g
}

/**
 * Composition glucidique : grammes par bucket + parts en %.
 *
 * RÈGLE DÉNOMINATEUR / NUMÉRATEUR (D21, arbitrage 3) : les grammes `unknown`
 * (IG manquant, défensif) comptent au DÉNOMINATEUR (`totalCarb` = glucide
 * RÉEL) mais JAMAIS au numérateur haut-IG. `highShare` = high / totalCarb :
 * un gramme non classé dilue donc la part haut-IG, il ne la gonfle jamais.
 */
export function glycemicShares(entries = []) {
  const g = carbsByGi(entries)
  const totalCarb = g.low + g.mid + g.high + g.unknown
  const pct = (x) => (totalCarb > 0 ? (x / totalCarb) * 100 : 0)
  return {
    ...g,
    totalCarb,
    lowPct: pct(g.low),
    midPct: pct(g.mid),
    highPct: pct(g.high),
    unknownPct: pct(g.unknown),
    // numérateur = g.high SEUL ; dénominateur = totalCarb (unknown inclus).
    highShare: totalCarb > 0 ? g.high / totalCarb : 0,
  }
}

/**
 * Évalue les alertes glucidiques du jour (SEAM UNIQUE des seuils, D21).
 * Set MINIMAL de 2 règles, chacune pure et testable :
 *  - A « sucres-high » : sucres simples > cible (D15, défaut 20 g).
 *  - B « high-gi-rest » : un jour SANS séance, >50 % des glucides en haut-IG,
 *    avec un plancher de 50 g de glucides (ne crie pas sur une journée quasi
 *    sans glucides). Le haut-IG se justifie autour de la séance ; sur un jour
 *    de repos c'est le signal actionnable.
 * Rejet acté (D21) : « bas-IG insuffisant » (bruyant, faiblement fondé) — différé.
 *
 * @returns {{id:string, severity:string, message:string}[]} (vide = rien à signaler)
 */
export function evaluateGlycemicAlerts({ sugars = 0, sugarsTarget, shares, trained } = {}) {
  const alerts = []
  if (sugarsTarget != null && sugars > sugarsTarget) {
    alerts.push({
      id: 'sugars-high',
      severity: 'warn',
      message: `Sucres simples : ${Math.round(sugars)} g (cible < ${sugarsTarget} g)`,
    })
  }
  const s = shares || {}
  if (!trained && (s.totalCarb || 0) >= MIN_CARB_FLOOR && (s.highShare || 0) >= HIGH_GI_REST_SHARE) {
    alerts.push({
      id: 'high-gi-rest',
      severity: 'warn',
      message: `IG haut un jour sans séance : ${Math.round(s.highPct || 0)} % des glucides`,
    })
  }
  return alerts
}
