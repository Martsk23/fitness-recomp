// Test intelligence glucidique (node pur, sans navigateur ni IndexedDB).
// Prouve : ventilation des glucides par IG (carbsByGi) ; parts en % (glycemicShares)
// avec la RÈGLE DÉNOMINATEUR/NUMÉRATEUR sur le résidu `unknown` (D21, arbitrage 3) ;
// les 2 règles d'alerte (A sucres > cible ; B haut-IG jour de repos) aux bornes,
// le toggle `trained` qui coupe B, et le plancher de glucides.
import {
  carbsByGi,
  glycemicShares,
  evaluateGlycemicAlerts,
  HIGH_GI_REST_SHARE,
  MIN_CARB_FLOOR,
} from '../src/lib/glycemic.js'

let exitCode = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) exitCode = 1
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

// ── C — carbsByGi : ventilation des grammes par niveau d'IG ────────
function c_bucketing() {
  console.log('\n— C : carbsByGi (ventilation des glucides) —')
  const entries = [
    { gi: 'low', carb: 10 },
    { gi: 'low', carb: 5 },
    { gi: 'mid', carb: 20 },
    { gi: 'high', carb: 30 },
    { gi: 'high', carb: 0 }, // 0 g de carb → pèse 0 (entrée non-glucidique)
  ]
  const g = carbsByGi(entries)
  ok(g.low === 15 && g.mid === 20 && g.high === 30 && g.unknown === 0, 'somme par bucket (15/20/30/0)')

  // gi manquant / hors {low,mid,high} → bucket défensif `unknown`, jamais de crash.
  const defensive = carbsByGi([{ gi: undefined, carb: 12 }, { gi: 'bogus', carb: 8 }, { carb: 5 }])
  ok(defensive.unknown === 25 && defensive.low === 0, 'gi manquant/invalide → unknown (25), pas de crash')

  ok(carbsByGi([]).high === 0, 'journal vide → buckets à 0')
  ok(carbsByGi().high === 0, 'sans argument → buckets à 0 (défensif)')
}

// ── S — glycemicShares : parts en % + règle unknown ────────────────
function s_shares() {
  console.log('\n— S : glycemicShares (parts en %) —')
  const s = glycemicShares([
    { gi: 'low', carb: 20 },
    { gi: 'mid', carb: 30 },
    { gi: 'high', carb: 50 },
  ])
  ok(s.totalCarb === 100, 'totalCarb = 100')
  ok(approx(s.lowPct, 20) && approx(s.midPct, 30) && approx(s.highPct, 50), 'parts 20/30/50 %')
  ok(approx(s.lowPct + s.midPct + s.highPct + s.unknownPct, 100), 'les parts somment à 100 %')
  ok(approx(s.highShare, 0.5), 'highShare = 0,5')

  // Journal vide → tout à 0, pas de division par 0.
  const empty = glycemicShares([])
  ok(empty.totalCarb === 0 && empty.highShare === 0 && empty.highPct === 0, 'vide → 0 partout (pas de NaN)')

  // RÈGLE CLÉ (D21, arbitrage 3) : les grammes `unknown` comptent au DÉNOMINATEUR
  // (totalCarb), JAMAIS au numérateur haut-IG. high=30, unknown=30, total=60 →
  // highShare = 30/60 = 0,5 (et NON 30/30 = 1).
  const mixed = glycemicShares([{ gi: 'high', carb: 30 }, { gi: undefined, carb: 30 }])
  ok(mixed.totalCarb === 60, 'unknown compté au dénominateur (totalCarb = 60)')
  ok(approx(mixed.highShare, 0.5), 'highShare = high/total = 30/60 = 0,5 (unknown PAS au numérateur)')
  ok(approx(mixed.unknownPct, 50), 'unknownPct = 50 % (résidu visible)')
}

// ── A — alerte sucres simples > cible (borne stricte) ──────────────
function a_sugars() {
  console.log('\n— A : alerte sucres simples (> cible) —')
  const ids = (args) => evaluateGlycemicAlerts(args).map((x) => x.id)
  const base = { shares: glycemicShares([]), trained: true } // B neutralisé (trained + 0 carb)

  ok(!ids({ ...base, sugars: 20, sugarsTarget: 20 }).includes('sugars-high'), 'sucres = cible (20) → PAS d\'alerte (strict)')
  ok(ids({ ...base, sugars: 21, sugarsTarget: 20 }).includes('sugars-high'), 'sucres > cible (21) → alerte A')
  ok(!ids({ ...base, sugars: 5, sugarsTarget: 20 }).includes('sugars-high'), 'sucres bas → pas d\'alerte A')
  // cible absente (défensif) → jamais d'alerte sucres.
  ok(!ids({ ...base, sugars: 999, sugarsTarget: null }).includes('sugars-high'), 'cible null → pas d\'alerte A')
}

// ── B — alerte haut-IG un jour de repos (seuils + garde trained) ───
function b_high_gi_rest() {
  console.log('\n— B : alerte haut-IG jour de repos —')
  const has = (args) => evaluateGlycemicAlerts(args).map((x) => x.id).includes('high-gi-rest')
  const sug = { sugars: 0, sugarsTarget: 20 } // A neutralisée

  // Référence : 60 g de glucides, 60 % haut-IG, jour de repos → B déclenche.
  const sRest = glycemicShares([{ gi: 'high', carb: 36 }, { gi: 'low', carb: 24 }]) // total 60, highShare 0,6
  ok(has({ ...sug, shares: sRest, trained: false }), 'repos + 60 g + 60 % haut-IG → alerte B')

  // GARDE trained : la même journée AVEC séance → pas d'alerte (haut-IG OK autour du sport).
  ok(!has({ ...sug, shares: sRest, trained: true }), 'séance marquée → B coupée (haut-IG justifié)')

  // Borne share : exactement 50 % déclenche (≥), 49 % non.
  const s50 = glycemicShares([{ gi: 'high', carb: 50 }, { gi: 'low', carb: 50 }]) // total 100, share 0,50
  const s49 = glycemicShares([{ gi: 'high', carb: 49 }, { gi: 'low', carb: 51 }]) // total 100, share 0,49
  ok(approx(s50.highShare, HIGH_GI_REST_SHARE), 'sanity : s50.highShare = seuil')
  ok(has({ ...sug, shares: s50, trained: false }), 'share = 50 % (borne) → B déclenche')
  ok(!has({ ...sug, shares: s49, trained: false }), 'share = 49 % → pas de B')

  // Plancher glucides : 50 g (borne) déclenche, 49 g non, même à 100 % haut-IG.
  const c50 = glycemicShares([{ gi: 'high', carb: 50 }]) // total 50, share 1,0
  const c49 = glycemicShares([{ gi: 'high', carb: 49 }]) // total 49, share 1,0
  ok(c50.totalCarb === MIN_CARB_FLOOR, 'sanity : c50.totalCarb = plancher')
  ok(has({ ...sug, shares: c50, trained: false }), 'totalCarb = 50 g (borne) → B déclenche')
  ok(!has({ ...sug, shares: c49, trained: false }), 'totalCarb = 49 g (< plancher) → pas de B même à 100 % haut-IG')

  // RÈGLE unknown ⊄ numérateur (D21) : high=40 / unknown=60 / total=100 → share 0,4
  // < 0,5 → PAS d'alerte. Si l'unknown gonflait le numérateur (100/100), B crierait à tort.
  const sUnknown = glycemicShares([{ gi: 'high', carb: 40 }, { gi: undefined, carb: 60 }])
  ok(approx(sUnknown.highShare, 0.4), 'sanity : unknown au dénominateur → highShare 0,4')
  ok(!has({ ...sug, shares: sUnknown, trained: false }), 'unknown dilue (40 % haut) → PAS de B (jamais au numérateur)')

  // Combinaison : les deux règles peuvent coexister.
  const both = evaluateGlycemicAlerts({ sugars: 25, sugarsTarget: 20, shares: sRest, trained: false }).map((x) => x.id)
  ok(both.includes('sugars-high') && both.includes('high-gi-rest'), 'A et B cumulables sur la même journée')
}

function main() {
  c_bucketing()
  s_shares()
  a_sugars()
  b_high_gi_rest()
  console.log(`\n${exitCode === 0 ? 'TOUS LES TESTS PASSENT' : 'ÉCHECS DÉTECTÉS'}`)
  process.exit(exitCode)
}
main()
