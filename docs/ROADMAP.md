# ROADMAP — Fitness Recomp

## Phase 0 — Fondations ✅
Coquille installable iOS, hors-ligne, qui ne perd pas ses données + sauvegarde/restauration.
- [x] Scaffold React + Vite + Tailwind v4
- [x] PWA installable (manifest + service worker hors-ligne, `vite-plugin-pwa`)
- [x] Dexie.js avec le schéma v1 validé
- [x] Export JSON complet + import/restauration
- [x] `navigator.storage.persist()` au lancement
- [x] Docs `/docs/` créées
- [x] Shell UI (header, tab bar, écran Jour lecture seule, écran Données)

## Phase 1 — Le quotidien utilisable (priorité absolue)
But : **utiliser l'app tous les jours.**
1. Nutrition : bibliothèque d'ingrédients bruts + composition d'un plat par pesée (g) → calcul auto kcal + macros.
2. Poids : saisie + graphe avec moyenne glissante + guide « bon moment pour se peser ».
3. Tickers quotidiens (eau par verres, compléments) interactifs avec reset journalier + widget (ex. 5/8).
4. Bilan énergétique : consommé − dépensé, saisie manuelle rapide de la dépense du jour.

## Phase 2 — Intelligence
5. Intelligence glucidique : IG bas (énergie stable) vs haut (autour des entraînements), sucres simples < 20 g/j, barres de composition, alertes contextuelles selon timing/activité.
6. Import CSV Strong : détection auto des colonnes (date, exercice, set, reps, poids) → suivi des perfs.
7. Analyse de perf : progressions / stagnations / régressions par exercice, échauffement calculé, table exercice → variantes.

## Phase 3 — Assistance
8. Mini-chat repas, **moteur de règles 100 % local** : macros restantes + contexte (sport ? heure ?) → 2-3 idées de repas maison dans le budget.
9. Couche IA Claude **optionnelle**, opt-in, désactivable — interface commune moteur de règles / moteur IA prévue dès la Phase 3 (implémentation différée).

## À recréer (ancien projet perdu — pas de migration)
- Base ~38 boissons alcoolisées (kcal + portions standard).
- Logique d'intelligence glucidique.
- Bibliothèque d'ingrédients bruts de départ (/100 g), enrichissable.
