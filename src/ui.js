// ── Tokens couleur (instrument / ordinateur de bord) ──────────────
// Repris de la maquette ebauche-app-fitness.jsx (charte validée).
export const C = {
  bg: '#0B0E13',
  surface: '#151A21',
  surfaceHi: '#1C232C',
  line: '#262E39',
  text: '#E8EBEF',
  muted: '#8A93A2',
  faint: '#5B6573',
  energy: '#BEF264', // lime
  protein: '#38BDF8', // sky
  carb: '#FBBF24', // amber
  fat: '#C084FC', // violet
  warn: '#FB7185', // rose
}

export const num = { fontVariantNumeric: 'tabular-nums' }

// Clé jour locale 'YYYY-MM-DD' (pas UTC : le bilan est celui du fuseau de l'iPhone).
export function todayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const FR_DATE = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
})
export const formatFrDate = (d = new Date()) => FR_DATE.format(d)
