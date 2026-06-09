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
But : **utiliser l'app tous les jours.** Séquence révisée (cadrage 09/06) :

- [x] **1.0 Migration schéma v2** — PK UUID, `updatedAt` partout, `loggedAt`, base compatible sync futur (voir DECISIONS.md D10-D13). ✅ commitée.
- [x] **1.1 Suivi du poids** ✅ commitée (098bb88) — saisie kg + date/heure → `weightLogs` ; courbe de tendance + moyenne glissante (trailing 7 points, D14) ; encart « bon moment pour se peser ». Dashboard Jour = poids du jour + tendance. _(Régression écran Jour blanc corrigée au passage + smoke Playwright committé, 8bed676.)_
- [x] **2. Profil / onboarding + moteur de calcul métabolique** ✅ commitée (de0dc89) — profil (sexe, âge, taille, activité, objectif, %MG?) ; BMR Mifflin-St Jeor / Katch-McArdle, TDEE (5 multiplicateurs), cibles recomp (TDEE×0,90, prot 2,0 g/kg) avec garde-fous codés en dur ; IMC + caveat ; dé-seed des cibles. Calibrage TDEE empirique différé (seam prêt). Voir D15.
- [x] **3. Tickers interactifs** ✅ commitée (6406954) — cocher/incrémenter sur Jour → `tickerStates` keyé par date (absence de ligne = 0 → reset auto minuit, **pas de cron**, D3) ; compteurs − / + bornés à 0, cases en toggle ; progression par ticker (5/8) + compteur de complétion. Logique extraite/testée (`src/lib/tickers.js`).
- [x] **4. Bilan énergétique** ✅ commitée (8739e19 + harden ae947ae) — encart Jour : saisie rapide de la dépense totale du jour → table dédiée `dailyExpenditure` (1 ligne/date, index unique `&date`, absence = non saisi) ; bilan = consommé − dépensé, calculé jamais stocké, consommé honnête tant que la nutrition n'est pas là. Bump `DEXIE_VERSION 2→3` additif + garde-fou wipe réservé v1 (D16).
- [x] **4.5 Consommé rapide du jour** ✅ (D17, commit en attente) — saisie du **total kcal du jour** (1 nombre, 2 s, pas de macros) → table dédiée `dailyIntake` (1 ligne/date, index unique `&date`, absence = non saisi). Seam unique `effectiveConsumed = manualTotal ?? journalSum` (verrou nullish). Bump `DEXIE_VERSION 3→4` additif (D16/D17). Macros « non renseigné » quand le consommé vient du total manuel. Réconciliation définitive avec la nutrition **déférée**.
- [x] **5. Nutrition** ✅ (D18, commit en attente) — écran Bouffe : bibliothèque 58 ingrédients bruts /100 g (recherche + filtres catégorie dynamiques + CRUD) ; composition d'un plat par pesée → `journalEntries` (macros figées D1, sourceType D2, IG copié D5) ; journal du jour (regrammage/suppression). Seed gardé par flag `librarySeededV1`. **Zéro bump Dexie** (champs non indexés). Côté « consommé » du Jour s'allume seul. **Clôt la Phase 1.** _Boissons (~38) déférées en sous-tâche ; réconciliation définitive D17 reste à trancher en Phase 2._

### Inter-phases — Recettes récurrentes ✅ (D19, commit en attente)
- [x] **Recettes récurrentes** — store `recipes` additif (DEXIE_VERSION 4→5, SCHEMA_VERSION reste 2) ; une recette = formule de **références vivante** (`{ sourceId, nameSnapshot, grams }`, pas de macros figées), rappelable en 1 tap → append au journal du jour via `saveMeal` (macros figées **à l'application**, D1) ; `nameSnapshot` **fallback-only** (affiché seulement si l'ingrédient ne résout plus → ligne sautée + avertissement) ; sous-vue **Recettes** dans le segmented control de Bouffe ; renommage seul (édition des lignes différée) ; « Enregistrer comme recette » depuis le Composer **conserve** les lignes. Test migration **S8** (v4→v5 additif, données préservées) + `recipes.test.mjs` + 2 smokes (nominal + dégradé). Voir D19.

_Parké : tracking micronutriments fin (fer/vitD…) → exige une base Ciqual/USDA, phase dédiée._
_Parké : **Tickers configurables** (cahier des charges, volontairement différé) — l'utilisateur ajoute/retire ses propres tickers et règle label / type / cible / ordre / `active` (les 4 actuels sont seedés et figés). Écran de gestion sur `tickerConfigs` (déjà en base, déjà dans `TABLES`) ; touche à `seed.js` (seed conditionnel) et à l'export. Petite tranche dédiée, après le quotidien utilisable._

## Dette technique
- **Bundle > 500 kB** (warning au build) à cause de **Recharts**. Optimisation = **lazy-load des écrans à graphes** (Poids, puis Perf en Phase 2) via `React.lazy` / import dynamique, pour sortir Recharts du chunk initial. **À faire plus tard** — pas bloquant pour une app 100 % locale, juste tracé pour ne pas le perdre.

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
