// Bibliothèque d'ingrédients bruts — valeurs nutritionnelles /100 g.
// Source : docs/seed validée (ingredients-seed.json, _meta documentaire exclu).
// Le composeur de plat saisit des grammes → valeur = (champ /100 g) × g ÷ 100.
//
// Convention cru/cuit (documentaire, capturée dans les `name`) :
//  - Féculents qui gonflent (riz, pâtes, p. de terre, patate douce, quinoa,
//    lentilles) = valeurs CUITES (on pèse l'assiette).
//  - Viandes/poissons = valeurs CRUES (on pèse la portion au prep).
//  - Le reste = tel quel.
// Catégories : féculents, protéines, légumes, matières grasses (déjà en base)
// + fruits, laitages, aromates (nouvelles, gérées DYNAMIQUEMENT dans les filtres).
// Ne PAS modifier ces valeurs : elles ont été validées en amont.
export const INGREDIENTS_SEED = [
  { id: 'riz-blanc-cuit', name: 'Riz blanc (cuit)', category: 'féculents', kcal100: 130, protein100: 2.7, carb100: 28, sugarsSimple100: 0.1, fat100: 0.3, gi: 'high', isCustom: false, createdAt: null },
  { id: 'pates-cuit', name: 'Pâtes (cuit)', category: 'féculents', kcal100: 158, protein100: 5.8, carb100: 31, sugarsSimple100: 1, fat100: 0.9, gi: 'mid', isCustom: false, createdAt: null },
  { id: 'pomme-de-terre-cuit', name: 'Pomme de terre (cuit)', category: 'féculents', kcal100: 87, protein100: 2, carb100: 20, sugarsSimple100: 0.9, fat100: 0.1, gi: 'high', isCustom: false, createdAt: null },
  { id: 'patate-douce-cuit', name: 'Patate douce (cuit)', category: 'féculents', kcal100: 90, protein100: 2, carb100: 21, sugarsSimple100: 6.5, fat100: 0.1, gi: 'mid', isCustom: false, createdAt: null },
  { id: 'quinoa-cuit', name: 'Quinoa (cuit)', category: 'féculents', kcal100: 120, protein100: 4.4, carb100: 21, sugarsSimple100: 0.9, fat100: 1.9, gi: 'low', isCustom: false, createdAt: null },
  { id: 'lentilles-cuit', name: 'Lentilles (cuit)', category: 'féculents', kcal100: 116, protein100: 9, carb100: 20, sugarsSimple100: 1.8, fat100: 0.4, gi: 'low', isCustom: false, createdAt: null },
  { id: 'flocons-avoine', name: "Flocons d'avoine (cru)", category: 'féculents', kcal100: 379, protein100: 13, carb100: 60, sugarsSimple100: 1, fat100: 7, gi: 'low', isCustom: false, createdAt: null },
  { id: 'pain-complet', name: 'Pain complet', category: 'féculents', kcal100: 247, protein100: 9, carb100: 41, sugarsSimple100: 3, fat100: 3.4, gi: 'mid', isCustom: false, createdAt: null },

  { id: 'blanc-poulet-cru', name: 'Blanc de poulet (cru)', category: 'protéines', kcal100: 120, protein100: 23, carb100: 0, sugarsSimple100: 0, fat100: 2.6, gi: 'low', isCustom: false, createdAt: null },
  { id: 'steak-hache-5-cru', name: 'Steak haché 5% (cru)', category: 'protéines', kcal100: 137, protein100: 20, carb100: 0, sugarsSimple100: 0, fat100: 5, gi: 'low', isCustom: false, createdAt: null },
  { id: 'oeuf-entier', name: 'Œuf entier', category: 'protéines', kcal100: 143, protein100: 12.6, carb100: 0.7, sugarsSimple100: 0.7, fat100: 9.5, gi: 'low', isCustom: false, createdAt: null },
  { id: 'thon-naturel', name: 'Thon naturel (égoutté)', category: 'protéines', kcal100: 116, protein100: 26, carb100: 0, sugarsSimple100: 0, fat100: 1, gi: 'low', isCustom: false, createdAt: null },
  { id: 'saumon-cru', name: 'Saumon (cru)', category: 'protéines', kcal100: 208, protein100: 20, carb100: 0, sugarsSimple100: 0, fat100: 13, gi: 'low', isCustom: false, createdAt: null },
  { id: 'cabillaud-cru', name: 'Cabillaud (cru)', category: 'protéines', kcal100: 76, protein100: 17, carb100: 0, sugarsSimple100: 0, fat100: 0.7, gi: 'low', isCustom: false, createdAt: null },
  { id: 'tofu-ferme', name: 'Tofu ferme', category: 'protéines', kcal100: 145, protein100: 16, carb100: 1.9, sugarsSimple100: 0.5, fat100: 8, gi: 'low', isCustom: false, createdAt: null },
  { id: 'whey-arkens-isolate', name: 'Whey Arkens Isolate (Black Protein)', category: 'protéines', kcal100: 363, protein100: 86, carb100: 3.1, sugarsSimple100: 2.1, fat100: 0.9, gi: 'low', isCustom: false, createdAt: null },

  { id: 'brocoli-cuit', name: 'Brocoli (cuit)', category: 'légumes', kcal100: 34, protein100: 2.8, carb100: 4, sugarsSimple100: 1.7, fat100: 0.4, gi: 'low', isCustom: false, createdAt: null },
  { id: 'haricots-verts-cuit', name: 'Haricots verts (cuit)', category: 'légumes', kcal100: 31, protein100: 1.8, carb100: 5, sugarsSimple100: 2, fat100: 0.2, gi: 'low', isCustom: false, createdAt: null },
  { id: 'courgette', name: 'Courgette', category: 'légumes', kcal100: 17, protein100: 1.2, carb100: 2.5, sugarsSimple100: 2, fat100: 0.3, gi: 'low', isCustom: false, createdAt: null },
  { id: 'tomate', name: 'Tomate', category: 'légumes', kcal100: 18, protein100: 0.9, carb100: 3.5, sugarsSimple100: 2.6, fat100: 0.2, gi: 'low', isCustom: false, createdAt: null },
  { id: 'epinards-cuit', name: 'Épinards (cuit)', category: 'légumes', kcal100: 23, protein100: 2.9, carb100: 1, sugarsSimple100: 0.4, fat100: 0.4, gi: 'low', isCustom: false, createdAt: null },
  { id: 'carotte', name: 'Carotte', category: 'légumes', kcal100: 41, protein100: 0.9, carb100: 8, sugarsSimple100: 4.7, fat100: 0.2, gi: 'mid', isCustom: false, createdAt: null },
  { id: 'poivron', name: 'Poivron', category: 'légumes', kcal100: 26, protein100: 1, carb100: 5, sugarsSimple100: 3, fat100: 0.3, gi: 'low', isCustom: false, createdAt: null },
  { id: 'champignons', name: 'Champignons', category: 'légumes', kcal100: 22, protein100: 3, carb100: 1, sugarsSimple100: 1, fat100: 0.3, gi: 'low', isCustom: false, createdAt: null },

  { id: 'huile-olive', name: "Huile d'olive", category: 'matières grasses', kcal100: 884, protein100: 0, carb100: 0, sugarsSimple100: 0, fat100: 100, gi: 'low', isCustom: false, createdAt: null },
  { id: 'beurre', name: 'Beurre', category: 'matières grasses', kcal100: 717, protein100: 0.9, carb100: 0.6, sugarsSimple100: 0.6, fat100: 81, gi: 'low', isCustom: false, createdAt: null },
  { id: 'amandes', name: 'Amandes', category: 'matières grasses', kcal100: 579, protein100: 21, carb100: 22, sugarsSimple100: 4, fat100: 50, gi: 'low', isCustom: false, createdAt: null },
  { id: 'avocat', name: 'Avocat', category: 'matières grasses', kcal100: 160, protein100: 2, carb100: 9, sugarsSimple100: 0.7, fat100: 15, gi: 'low', isCustom: false, createdAt: null },
  { id: 'beurre-cacahuete', name: 'Beurre de cacahuète', category: 'matières grasses', kcal100: 588, protein100: 25, carb100: 20, sugarsSimple100: 9, fat100: 50, gi: 'low', isCustom: false, createdAt: null },

  { id: 'banane', name: 'Banane', category: 'fruits', kcal100: 89, protein100: 1.1, carb100: 20, sugarsSimple100: 12, fat100: 0.3, gi: 'mid', isCustom: false, createdAt: null },
  { id: 'pomme', name: 'Pomme', category: 'fruits', kcal100: 52, protein100: 0.3, carb100: 14, sugarsSimple100: 10, fat100: 0.2, gi: 'low', isCustom: false, createdAt: null },
  { id: 'poire', name: 'Poire', category: 'fruits', kcal100: 57, protein100: 0.4, carb100: 15, sugarsSimple100: 10, fat100: 0.1, gi: 'low', isCustom: false, createdAt: null },
  { id: 'orange', name: 'Orange', category: 'fruits', kcal100: 47, protein100: 0.9, carb100: 9, sugarsSimple100: 9, fat100: 0.1, gi: 'low', isCustom: false, createdAt: null },
  { id: 'clementine', name: 'Clémentine', category: 'fruits', kcal100: 53, protein100: 0.8, carb100: 13, sugarsSimple100: 11, fat100: 0.3, gi: 'low', isCustom: false, createdAt: null },
  { id: 'fraise', name: 'Fraise', category: 'fruits', kcal100: 32, protein100: 0.7, carb100: 6, sugarsSimple100: 4.9, fat100: 0.3, gi: 'low', isCustom: false, createdAt: null },
  { id: 'framboise', name: 'Framboise', category: 'fruits', kcal100: 52, protein100: 1.2, carb100: 12, sugarsSimple100: 4.4, fat100: 0.7, gi: 'low', isCustom: false, createdAt: null },
  { id: 'myrtille', name: 'Myrtille', category: 'fruits', kcal100: 57, protein100: 0.7, carb100: 12, sugarsSimple100: 10, fat100: 0.3, gi: 'low', isCustom: false, createdAt: null },
  { id: 'kiwi', name: 'Kiwi', category: 'fruits', kcal100: 61, protein100: 1.1, carb100: 15, sugarsSimple100: 9, fat100: 0.5, gi: 'low', isCustom: false, createdAt: null },
  { id: 'peche', name: 'Pêche', category: 'fruits', kcal100: 39, protein100: 0.9, carb100: 10, sugarsSimple100: 8, fat100: 0.3, gi: 'low', isCustom: false, createdAt: null },
  { id: 'abricot', name: 'Abricot', category: 'fruits', kcal100: 48, protein100: 1.4, carb100: 11, sugarsSimple100: 9, fat100: 0.4, gi: 'low', isCustom: false, createdAt: null },
  { id: 'prune', name: 'Prune', category: 'fruits', kcal100: 46, protein100: 0.7, carb100: 11, sugarsSimple100: 10, fat100: 0.3, gi: 'low', isCustom: false, createdAt: null },
  { id: 'cerise', name: 'Cerise', category: 'fruits', kcal100: 63, protein100: 1.1, carb100: 16, sugarsSimple100: 13, fat100: 0.2, gi: 'mid', isCustom: false, createdAt: null },
  { id: 'raisin', name: 'Raisin', category: 'fruits', kcal100: 69, protein100: 0.7, carb100: 18, sugarsSimple100: 16, fat100: 0.2, gi: 'high', isCustom: false, createdAt: null },
  { id: 'ananas', name: 'Ananas', category: 'fruits', kcal100: 50, protein100: 0.5, carb100: 13, sugarsSimple100: 10, fat100: 0.1, gi: 'mid', isCustom: false, createdAt: null },
  { id: 'mangue', name: 'Mangue', category: 'fruits', kcal100: 60, protein100: 0.8, carb100: 15, sugarsSimple100: 14, fat100: 0.4, gi: 'mid', isCustom: false, createdAt: null },
  { id: 'melon', name: 'Melon', category: 'fruits', kcal100: 34, protein100: 0.8, carb100: 8, sugarsSimple100: 8, fat100: 0.2, gi: 'mid', isCustom: false, createdAt: null },
  { id: 'pasteque', name: 'Pastèque', category: 'fruits', kcal100: 30, protein100: 0.6, carb100: 8, sugarsSimple100: 6, fat100: 0.2, gi: 'high', isCustom: false, createdAt: null },

  { id: 'fromage-blanc-0', name: 'Fromage blanc 0%', category: 'laitages', kcal100: 47, protein100: 8, carb100: 4, sugarsSimple100: 4, fat100: 0.2, gi: 'low', isCustom: false, createdAt: null },
  { id: 'skyr-nature', name: 'Skyr nature', category: 'laitages', kcal100: 63, protein100: 11, carb100: 4, sugarsSimple100: 4, fat100: 0.2, gi: 'low', isCustom: false, createdAt: null },
  { id: 'yaourt-grec-nature', name: 'Yaourt grec nature', category: 'laitages', kcal100: 97, protein100: 9, carb100: 4, sugarsSimple100: 4, fat100: 5, gi: 'low', isCustom: false, createdAt: null },
  { id: 'petit-suisse', name: 'Petit suisse', category: 'laitages', kcal100: 138, protein100: 9, carb100: 3.5, sugarsSimple100: 3.5, fat100: 8, gi: 'low', isCustom: false, createdAt: null },
  { id: 'yaourt-nature', name: 'Yaourt nature', category: 'laitages', kcal100: 61, protein100: 3.5, carb100: 5, sugarsSimple100: 5, fat100: 3.3, gi: 'low', isCustom: false, createdAt: null },
  { id: 'lait-demi-ecreme', name: 'Lait demi-écrémé', category: 'laitages', kcal100: 46, protein100: 3.2, carb100: 4.8, sugarsSimple100: 4.8, fat100: 1.5, gi: 'low', isCustom: false, createdAt: null },

  { id: 'ail', name: 'Ail', category: 'aromates', kcal100: 149, protein100: 6.4, carb100: 33, sugarsSimple100: 1, fat100: 0.5, gi: 'low', isCustom: false, createdAt: null },
  { id: 'oignon', name: 'Oignon', category: 'aromates', kcal100: 40, protein100: 1.1, carb100: 9, sugarsSimple100: 4.2, fat100: 0.1, gi: 'mid', isCustom: false, createdAt: null },
  { id: 'gingembre-frais', name: 'Gingembre frais', category: 'aromates', kcal100: 80, protein100: 1.8, carb100: 18, sugarsSimple100: 1.7, fat100: 0.8, gi: 'low', isCustom: false, createdAt: null },
  { id: 'persil-frais', name: 'Persil frais', category: 'aromates', kcal100: 36, protein100: 3, carb100: 6, sugarsSimple100: 0.9, fat100: 0.8, gi: 'low', isCustom: false, createdAt: null },
  { id: 'basilic-frais', name: 'Basilic frais', category: 'aromates', kcal100: 23, protein100: 3.2, carb100: 2.7, sugarsSimple100: 0.3, fat100: 0.6, gi: 'low', isCustom: false, createdAt: null },
]
