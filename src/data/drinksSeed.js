// Base boissons alcoolisées — valeurs PAR PORTION standard (≠ /100 g). Donnée de
// RÉFÉRENCE statique, locale, v1 (calque ingredientsSeed / exerciseVariants).
// Ancien projet perdu → valeurs RÉGÉNÉRÉES depuis des standards nutritionnels
// (ordres de grandeur réalistes, AUCUNE précision inventée). D25.
//
// MODÈLE (D25) : une boisson = UNE portion (33 cl bière, 12 cl vin, 4 cl
// spiritueux…). On loggue la portion (× multiplicateur), JAMAIS une pesée /100 g.
//
// INVARIANT DUR (D25) : le kcal de l'alcool (7 kcal/g) n'est PAS 4P+4G+9L. Le kcal
// d'une portion est ici DÉRIVÉ de la composition réelle —
//   kcal = round(7·alcoholG + 4·(carb + protein) + 9·fat)
// — puis PORTÉ tel quel à la saisie (jamais recalculé depuis les seules macros).
// `alcoholG` documente d'où vient le kcal (sanity test : kcal ≈ la formule). La
// part « non répartie » (alcool) se relit ensuite comme le résidu kcal−(4P+4G+9L).
//
// DEUX AXES SÉPARÉS (D21/D25, jamais mélangés) :
//   - sugarsSimple = sucres simples réels → budget recomp (alerte A, < 20 g/j).
//   - gi ∈ {low,mid,high} = classe glycémique → composition IG du jour (alerte B).
//   Une bière : gi `high` (maltose) MAIS sucres simples bas → frappe B, pas A.
//   Un spiritueux sec : carb 0 → poids nul dans la composition IG (auto-neutre).
//   Champagne/mousseux BRUT (dosage < 12 g/L) = sec → `low` ; seuls demi-sec /
//   moelleux / doux montent en `mid`. (Arbitrage correction 0.)
//   gi `high` de la bière ASSUMÉ (alerte B un soir de repos défendable en recomp) ;
//   reclassable ici au seed si trop bruyant à l'usage — pas de logique à toucher.
//
// Catégories gérées DYNAMIQUEMENT côté UI (comme les ingrédients). ids slug stables
// (déterministes → identiques sur tout device, pas de doublon au futur sync).
// portionMl sert l'édition de quantité (ml ≈ g, updateEntryGrams). createdAt null →
// estampillé à l'insertion par le seed (calque ingredientsSeed).

export const DRINKS_SEED = [
  // ── Bières & cidre (33 cl ; maltose → gi high) ───────────────────
  { id: 'biere-blonde', name: 'Bière blonde', category: 'bières', portionLabel: '33 cl', portionMl: 330, kcal: 141, protein: 1.5, carb: 11, sugarsSimple: 1, fat: 0, gi: 'high', alcoholG: 13.0, isCustom: false, createdAt: null },
  { id: 'biere-brune', name: 'Bière brune', category: 'bières', portionLabel: '33 cl', portionMl: 330, kcal: 167, protein: 1.5, carb: 13, sugarsSimple: 2, fat: 0, gi: 'high', alcoholG: 15.6, isCustom: false, createdAt: null },
  { id: 'biere-blanche', name: 'Bière blanche', category: 'bières', portionLabel: '33 cl', portionMl: 330, kcal: 141, protein: 1.5, carb: 11, sugarsSimple: 1.5, fat: 0, gi: 'high', alcoholG: 13.0, isCustom: false, createdAt: null },
  { id: 'biere-ipa', name: 'Bière IPA', category: 'bières', portionLabel: '33 cl', portionMl: 330, kcal: 180, protein: 1.5, carb: 14, sugarsSimple: 1.5, fat: 0, gi: 'high', alcoholG: 16.9, isCustom: false, createdAt: null },
  { id: 'biere-triple', name: 'Bière triple', category: 'bières', portionLabel: '33 cl', portionMl: 330, kcal: 234, protein: 1.5, carb: 16, sugarsSimple: 2, fat: 0, gi: 'high', alcoholG: 23.4, isCustom: false, createdAt: null },
  { id: 'biere-sans-alcool', name: 'Bière sans alcool', category: 'bières', portionLabel: '33 cl', portionMl: 330, kcal: 69, protein: 1.5, carb: 14, sugarsSimple: 6, fat: 0, gi: 'high', alcoholG: 1.0, isCustom: false, createdAt: null },
  { id: 'cidre-brut', name: 'Cidre brut', category: 'bières', portionLabel: '25 cl', portionMl: 250, kcal: 86, protein: 0, carb: 6, sugarsSimple: 6, fat: 0, gi: 'mid', alcoholG: 8.9, isCustom: false, createdAt: null },

  // ── Vins (12 cl ; secs → gi low, doux → gi mid) ──────────────────
  { id: 'vin-rouge', name: 'Vin rouge', category: 'vins', portionLabel: '12 cl', portionMl: 120, kcal: 98, protein: 0, carb: 3, sugarsSimple: 0.6, fat: 0, gi: 'low', alcoholG: 12.3, isCustom: false, createdAt: null },
  { id: 'vin-blanc-sec', name: 'Vin blanc sec', category: 'vins', portionLabel: '12 cl', portionMl: 120, kcal: 92, protein: 0, carb: 3, sugarsSimple: 1, fat: 0, gi: 'low', alcoholG: 11.4, isCustom: false, createdAt: null },
  { id: 'vin-rose', name: 'Vin rosé', category: 'vins', portionLabel: '12 cl', portionMl: 120, kcal: 95, protein: 0, carb: 3, sugarsSimple: 1.5, fat: 0, gi: 'low', alcoholG: 11.8, isCustom: false, createdAt: null },
  { id: 'champagne-brut', name: 'Champagne brut', category: 'vins', portionLabel: '12 cl', portionMl: 120, kcal: 86, protein: 0, carb: 1.5, sugarsSimple: 1.5, fat: 0, gi: 'low', alcoholG: 11.4, isCustom: false, createdAt: null },
  { id: 'prosecco-brut', name: 'Prosecco brut', category: 'vins', portionLabel: '12 cl', portionMl: 120, kcal: 81, protein: 0, carb: 2, sugarsSimple: 2, fat: 0, gi: 'low', alcoholG: 10.4, isCustom: false, createdAt: null },
  { id: 'champagne-demi-sec', name: 'Champagne demi-sec', category: 'vins', portionLabel: '12 cl', portionMl: 120, kcal: 108, protein: 0, carb: 7, sugarsSimple: 7, fat: 0, gi: 'mid', alcoholG: 11.4, isCustom: false, createdAt: null },
  { id: 'vin-blanc-moelleux', name: 'Vin blanc moelleux', category: 'vins', portionLabel: '12 cl', portionMl: 120, kcal: 116, protein: 0, carb: 9, sugarsSimple: 8, fat: 0, gi: 'mid', alcoholG: 11.4, isCustom: false, createdAt: null },
  { id: 'sauternes', name: 'Sauternes', category: 'vins', portionLabel: '12 cl', portionMl: 120, kcal: 141, protein: 0, carb: 12, sugarsSimple: 11, fat: 0, gi: 'mid', alcoholG: 13.3, isCustom: false, createdAt: null },

  // ── Apéritifs / vins mutés ───────────────────────────────────────
  { id: 'porto', name: 'Porto', category: 'apéritifs', portionLabel: '8 cl', portionMl: 80, kcal: 120, protein: 0, carb: 8, sugarsSimple: 7, fat: 0, gi: 'mid', alcoholG: 12.6, isCustom: false, createdAt: null },
  { id: 'martini-rouge', name: 'Martini rouge', category: 'apéritifs', portionLabel: '8 cl', portionMl: 80, kcal: 114, protein: 0, carb: 12, sugarsSimple: 11, fat: 0, gi: 'high', alcoholG: 9.5, isCustom: false, createdAt: null },
  { id: 'aperol', name: 'Aperol', category: 'apéritifs', portionLabel: '4 cl', portionMl: 40, kcal: 61, protein: 0, carb: 9, sugarsSimple: 9, fat: 0, gi: 'high', alcoholG: 3.5, isCustom: false, createdAt: null },
  { id: 'pastis', name: 'Pastis', category: 'apéritifs', portionLabel: '3 cl', portionMl: 30, kcal: 75, protein: 0, carb: 0, sugarsSimple: 0, fat: 0, gi: 'low', alcoholG: 10.7, isCustom: false, createdAt: null },

  // ── Spiritueux secs (4 cl ; carb 0 → poids nul en composition IG) ─
  { id: 'vodka', name: 'Vodka', category: 'spiritueux', portionLabel: '4 cl', portionMl: 40, kcal: 88, protein: 0, carb: 0, sugarsSimple: 0, fat: 0, gi: 'low', alcoholG: 12.6, isCustom: false, createdAt: null },
  { id: 'whisky', name: 'Whisky', category: 'spiritueux', portionLabel: '4 cl', portionMl: 40, kcal: 88, protein: 0, carb: 0, sugarsSimple: 0, fat: 0, gi: 'low', alcoholG: 12.6, isCustom: false, createdAt: null },
  { id: 'gin', name: 'Gin', category: 'spiritueux', portionLabel: '4 cl', portionMl: 40, kcal: 88, protein: 0, carb: 0, sugarsSimple: 0, fat: 0, gi: 'low', alcoholG: 12.6, isCustom: false, createdAt: null },
  { id: 'rhum-blanc', name: 'Rhum blanc', category: 'spiritueux', portionLabel: '4 cl', portionMl: 40, kcal: 88, protein: 0, carb: 0, sugarsSimple: 0, fat: 0, gi: 'low', alcoholG: 12.6, isCustom: false, createdAt: null },
  { id: 'tequila', name: 'Tequila', category: 'spiritueux', portionLabel: '4 cl', portionMl: 40, kcal: 84, protein: 0, carb: 0, sugarsSimple: 0, fat: 0, gi: 'low', alcoholG: 12.0, isCustom: false, createdAt: null },
  { id: 'cognac', name: 'Cognac', category: 'spiritueux', portionLabel: '4 cl', portionMl: 40, kcal: 88, protein: 0, carb: 0, sugarsSimple: 0, fat: 0, gi: 'low', alcoholG: 12.6, isCustom: false, createdAt: null },
  { id: 'rhum-ambre', name: 'Rhum ambré', category: 'spiritueux', portionLabel: '4 cl', portionMl: 40, kcal: 88, protein: 0, carb: 0, sugarsSimple: 0, fat: 0, gi: 'low', alcoholG: 12.6, isCustom: false, createdAt: null },

  // ── Liqueurs (sucrées → gi high ; crémeuses → fat) ───────────────
  { id: 'get-27', name: 'Get 27', category: 'liqueurs', portionLabel: '4 cl', portionMl: 40, kcal: 102, protein: 0, carb: 14, sugarsSimple: 14, fat: 0, gi: 'high', alcoholG: 6.6, isCustom: false, createdAt: null },
  { id: 'baileys', name: 'Baileys', category: 'liqueurs', portionLabel: '5 cl', portionMl: 50, kcal: 113, protein: 1.5, carb: 6, sugarsSimple: 5, fat: 4, gi: 'high', alcoholG: 6.7, isCustom: false, createdAt: null },
  { id: 'limoncello', name: 'Limoncello', category: 'liqueurs', portionLabel: '4 cl', portionMl: 40, kcal: 110, protein: 0, carb: 12, sugarsSimple: 12, fat: 0, gi: 'high', alcoholG: 8.8, isCustom: false, createdAt: null },
  { id: 'cointreau', name: 'Cointreau', category: 'liqueurs', portionLabel: '4 cl', portionMl: 40, kcal: 128, protein: 0, carb: 10, sugarsSimple: 10, fat: 0, gi: 'high', alcoholG: 12.6, isCustom: false, createdAt: null },
  { id: 'amaretto', name: 'Amaretto', category: 'liqueurs', portionLabel: '4 cl', portionMl: 40, kcal: 118, protein: 0, carb: 14, sugarsSimple: 14, fat: 0, gi: 'high', alcoholG: 8.8, isCustom: false, createdAt: null },

  // ── Cocktails (sirop/jus → sucres élevés ET gi high) ─────────────
  { id: 'mojito', name: 'Mojito', category: 'cocktails', portionLabel: '1 verre', portionMl: 200, kcal: 170, protein: 0, carb: 18, sugarsSimple: 16, fat: 0, gi: 'high', alcoholG: 14.0, isCustom: false, createdAt: null },
  { id: 'pina-colada', name: 'Piña colada', category: 'cocktails', portionLabel: '1 verre', portionMl: 220, kcal: 261, protein: 1, carb: 28, sugarsSimple: 22, fat: 6, gi: 'high', alcoholG: 13.0, isCustom: false, createdAt: null },
  { id: 'margarita', name: 'Margarita', category: 'cocktails', portionLabel: '1 verre', portionMl: 140, kcal: 160, protein: 0, carb: 12, sugarsSimple: 11, fat: 0, gi: 'high', alcoholG: 16.0, isCustom: false, createdAt: null },
  { id: 'cuba-libre', name: 'Cuba libre', category: 'cocktails', portionLabel: '1 verre', portionMl: 220, kcal: 179, protein: 0, carb: 22, sugarsSimple: 21, fat: 0, gi: 'high', alcoholG: 13.0, isCustom: false, createdAt: null },
  { id: 'gin-tonic', name: 'Gin tonic', category: 'cocktails', portionLabel: '1 verre', portionMl: 220, kcal: 155, protein: 0, carb: 16, sugarsSimple: 15, fat: 0, gi: 'high', alcoholG: 13.0, isCustom: false, createdAt: null },
  { id: 'spritz', name: 'Spritz', category: 'cocktails', portionLabel: '1 verre', portionMl: 200, kcal: 119, protein: 0, carb: 14, sugarsSimple: 13, fat: 0, gi: 'high', alcoholG: 9.0, isCustom: false, createdAt: null },
  { id: 'cosmopolitan', name: 'Cosmopolitan', category: 'cocktails', portionLabel: '1 verre', portionMl: 120, kcal: 146, protein: 0, carb: 12, sugarsSimple: 11, fat: 0, gi: 'high', alcoholG: 14.0, isCustom: false, createdAt: null },
]
