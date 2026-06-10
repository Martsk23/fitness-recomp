# PROGRESS — Fitness Recomp

_Mis à jour à chaque fin de session pour reprise sans perte de contexte._

## Fait
### Phase 0 — Fondations (session du 09/06/2026)
- Scaffold React 19 + Vite 8, Tailwind v4 (`@tailwindcss/vite`).
- PWA installable : manifest (icônes 192/512 + maskable, apple-touch-icon, meta iOS standalone, safe-area), service worker hors-ligne via `vite-plugin-pwa` (`registerType: autoUpdate`, `navigateFallback`).
- Dexie v1 : 9 tables conformes au schéma validé (`src/db.js`), `TABLES` = source unique pour export/import.
- Seed premier lancement : settings (objectifs recomp) + 4 tickers (eau + 3 compléments).
- Export JSON complet + import/restauration (`src/lib/backup.js`), avec garde de version de schéma.
- `navigator.storage.persist()` au boot (best-effort, non bloquant) + estimate.
- UI shell : header (date FR + chip Recomp + ⚙), tab bar 5 onglets, écran **Jour** (tableau de bord lecture seule alimenté par Dexie), écran **Données** (export/import/persistance/contenu base).
- Docs `/docs/` : CLAUDE.md, ROADMAP.md, PROGRESS.md, DECISIONS.md + copie du prompt de démarrage.

**Vérifs** : `npm run build` ✅ · `npm run lint` ✅ (0 erreur) · smoke-test Playwright 9/9 ✅ (rendu, seed 5 lignes, export JSON valide & complet, **persistance après reload**, 0 erreur console).

### Tâche 1.0 — Migration schéma v2 (session du 09/06/2026)
- Schéma v2 : **PK UUID** (string) sur les 9 tables, `DEXIE_VERSION=2` ≠ `SCHEMA_VERSION=2`, `settings` en clé sentinelle `'singleton'`, `updatedAt` partout + `loggedAt` sur journalEntries. Helpers `newRow()`/`touch()` (`src/db.js`).
- `src/lib/migrate.js` : `migrateLegacyIfNeeded()` (détection v1 par ouverture dynamique → **backup durable** dans IndexedDB séparée `fitnessRecompBackups` **avant** `Dexie.delete` → wipe ; idempotent) + `transformV1toV2()` (remap FK parents→enfants, orphelines drop+count) réservé à l'import.
- `backup.js` : `SCHEMA_VERSION=2`, import d'un bundle v1 → transform puis `bulkPut` **sans hook** (préserve `updatedAt` du fichier), remonte les orphelines. `main.jsx` : migration **avant** `db.open()`. `Data.jsx` : récupération du backup de migration.
- Décisions actées : **D10/D10-bis/D10-ter, D11, D12, D13** (voir DECISIONS.md).

**Vérifs** : `node tests/migration.test.mjs` ✅ (fake-indexeddb, sans navigateur) — S1 fresh+idempotence, S2 legacy wipe+reseed+backup-avant-delete+idempotence boot 2×, S3 transformV1toV2 (remap FK + drop orphelines 1/1/1), S4 round-trip import v1→export v2→ré-import identique (updatedAt préservé). `npm run lint` ✅ · `npm run build` ✅.

### Fix — écran Jour blanc (`get(1)` → `SETTINGS_KEY`) (session du 09/06/2026)
- Régression du commit 1.0 : `Jour.jsx` lisait `db.settings.get(1)` alors que seed/migrate écrivent la clé `'singleton'` (D10-bis) → `settings` undefined → `return null` → **dashboard Jour blanc sur l'appareil** (dès le 1ᵉʳ seed, pas seulement post-migration). Fix = `get(SETTINGS_KEY)`.
- **Non détecté** car `migration.test.mjs` tourne en node/fake-indexeddb et ne monte aucun composant React. → Ajout d'un **smoke Playwright committé** (`tests/e2e/smoke.spec.js` + `playwright.config.js`, script `npm run smoke`) qui monte le vrai React dans un vrai IndexedDB sur l'app buildée. Prérequis machine neuve documenté dans README (`npx playwright install chromium`).

**Vérifs** : smoke **rouge sur le code buggé → vert après fix** (preuve qu'il attrape la classe de bug) · `npm run lint` ✅ · `npm test` ✅ · `npm run build` ✅. **Commit `8bed676`.**

### Tâche 1.1 — Suivi du poids (session du 09/06/2026)
- `src/lib/weight.js` (logique pure, testable node) : `movingAverage` trailing **7 derniers points** (caveat commenté : fenêtre = points, pas jours → sauts de pesée bruitent la tendance ; calendaire **reporté**), `trend` (down/up/flat + delta), `shouldWeighNow` (matin < 12h ET pas encore pesé).
- `src/screens/Poids.jsx` (+ onglet câblé dans `App.jsx`) : saisie kg (virgule/point) + date/heure (défaut = maintenant) → `weightLogs` via `newRow()` (UUID + `updatedAt`), `date = todayKey(datetime)` ; courbe Recharts (points bruts + moyenne glissante) + historique.
- `Jour.jsx` : encart pesée du jour + tendance, sinon CTA « bon moment pour te peser » le matin, sinon rappel discret.
- **Schéma inchangé** : `weightLogs` déjà en v2 et déjà dans `TABLES` → export/import couvre la pesée sans modif.
- Décision design actée : **D14** (moyenne glissante trailing N points, voir DECISIONS.md).

**Vérifs** : `tests/weight.test.mjs` ✅ (moyenne glissante sur séries connues, valeurs exactes ; tendance ; heuristique — branché dans `npm test`) · smoke Playwright **persistance pesée** ✅ (saisie `77,7` → reload → relue + Jour reflète la pesée) · `npm run lint` ✅ · `npm run build` ✅ · `npm test` migration **reste vert**. **Commit `098bb88`.**

### Tâche 2 — Profil / moteur de calcul métabolique (session du 09/06/2026)
- `src/lib/metabolic.js` (moteur pur, testable node) : BMR **Mifflin-St Jeor** (défaut) / **Katch-McArdle** (si %MG saisi), **5 multiplicateurs** TDEE (1.2→1.9), cibles par objectif (**recomp = TDEE×0,90, prot 2,0 g/kg, lip 0,8 g/kg, glucides = reste, sucres <20 acté**), IMC, **garde-fous codés en dur** (plancher kcal ♂1500/♀1200, déficit plafonné −20 %, prot ≥1,6 g/kg, lip ≥0,6 g/kg, glucides jamais négatifs).
- `src/screens/Profil.jsx` : onboarding (profil vide au boot) + édition dans Données ; **poids = dernier `weightLogs` sinon saisie qui crée la 1ʳᵉ pesée** ; aperçu live des cibles ; écrit `settings` (profil + cibles + `targetsSource:'computed'`) via `touch()`.
- `App.jsx` : gate onboarding au boot si profil incomplet (cadre `Shell` partagé). `Data.jsx` : section Profil & cibles + recalcul. `Jour.jsx` : fallback propre (pas de `NaN`) si cibles non calculées.
- `seed.js` : **dé-seed** des cibles en dur (`profile:null`, `targetsSource:'fallback'`, sucres 20 conservés).
- **Schéma inchangé** (`DEXIE_VERSION`/`SCHEMA_VERSION` = 2) : champs `settings` non indexés, additifs, rétro-compatibles ; export couvre via `TABLES` (lignes complètes). Calibrage TDEE empirique **différé** (seam centralisé dans `metabolic.js`).
- Décisions actées : **D15** (politique cibles recomp + garde-fous). Voir DECISIONS.md.

**Vérifs** : `tests/metabolic.test.mjs` ✅ (BMR valeurs connues, multiplicateurs, cibles recomp 2483/160/317/64, **garde-fous qui bloquent** + invariant balayage) · smoke Playwright ✅ (onboarding → cibles calculées 2483 → reload profil persisté) · `tests/migration.test.mjs` assertion reseed adaptée au dé-seed ✅ · `npm run lint`/`build`/`test` ✅. **Commit `de0dc89`.**

### Tâche 3 — Tickers interactifs (session du 09/06/2026)
- `src/lib/tickers.js` (logique extraite, testable node) : `nextValue` (counter `inc`/`dec` borné à 0 / checkbox `toggle`), `clampCounter`, `loadActiveConfigs` (triés par `order`), `loadStates(date)` (map tickerId→valeur, **absence ⇒ 0**), `setValue` (**upsert** sur la clé `(tickerId, date)` : `newRow()` à la 1ʳᵉ écriture du jour, `touch()` ensuite → jamais de doublon ; ligne à 0 conservée plutôt que supprimée — 0 explicite ≡ absence).
- `src/screens/Jour.jsx` : section **« Routine du jour »** — compteurs (eau) avec − / + (bornage 0, − désactivé à 0, ajout demandé), cases (compléments) en toggle ; progression par ticker (`5 / 8`) + compteur de complétion (`3 / 4`) ; maj **optimiste** puis persistance.
- **Schéma inchangé** : `tickerStates` déjà en v2 et dans `TABLES` → export/import couvre sans modif `db.js`. Pas de nouvelle décision (D3/D10/D11 appliquées).
- **Tickers figés** (les 4 seedés) : ajout/retrait/cible/ordre par l'utilisateur **différé** → tranche future au ROADMAP.

**Vérifs** : `tests/tickers.test.mjs` ✅ (nextValue/clamp purs ; upsert sans doublon ; **« autre date repart à 0 »** prouvé en base) — branché dans `npm test` (migration/weight/metabolic **restent verts**) · smoke Playwright ✅ (0 → +3 → −1 → clamp 0 → 2 + Créatine cochée → **reload : état du jour conservé** ; injection d'une ligne d'hier qui ne remonte pas aujourd'hui) · `npm run lint`/`build` ✅. **Commit `6406954`.**

### Tâche 4 — Bilan énergétique (session du 09/06/2026)
- `src/lib/expenditure.js` (nouveau, testable node) : table dédiée **`dailyExpenditure`** (`{ id, date, kcal, updatedAt }`, **1 ligne par date, absence = non saisi**) ; `loadExpenditure`/`setExpenditure`/`clearExpenditure` (upsert **atomique** en transaction rw) + `energyBalance` pur (consommé − dépensé, **calculé jamais stocké**).
- `src/screens/Jour.jsx` : encart **« Bilan énergétique »** — saisie rapide de la **dépense TOTALE du jour** (1 nombre, pas de HealthKit) ; consommé **honnête** tant que la nutrition n'est pas suivie (« non suivi pour l'instant » / « en attente des repas ») ; bilan signé (déficit lime / surplus rose).
- **Contrainte dure (table + export/import même tâche)** : `db.js` **`DEXIE_VERSION 2→3`** montée **ADDITIVE** (nouveau store, index **unique `&date`**) + ajout à `TABLES` ; `backup.js` `replace` vide TOUTES les tables (restauration intégrale atomique). **`SCHEMA_VERSION` gardé à 2** (table additive = rétro-compat import).
- **Garde-fou anti-perte de données** : `migrate.js` — wipe legacy réservé aux bases **pré-UUID** (`verno < FIRST_UUID_DEXIE_VERSION`) ; une base v2 réelle **n'est jamais wipée** (upgrade additif Dexie).
- Décision actée : **D16** (versioning additif + corollaires : SCHEMA_VERSION découplé, import atomique, dépense en table dédiée). Voir DECISIONS.md.

**Vérifs** : `tests/expenditure.test.mjs` ✅ (energyBalance ; upsert/absence/clear ; **double-write concurrent → 1 ligne**) · `migration.test.mjs` **S5** ✅ (base v2 réelle → bump v3 → **données préservées**, store vide, 0 backup wipe) + **S6** ✅ (tolérance import : bundle v2 sans la table + table inconnue → pas de throw → justifie SCHEMA_VERSION=2) · smoke Playwright **bilan** ✅ (repas injecté 600 + dépense 2500 → **−1900**, persistance reload, **1 ligne keyée par date**) · suites migration/weight/metabolic/tickers **restent vertes** · `npm run lint`/`build` ✅. **Commits `8739e19` (feat) + `ae947ae` (harden, review).**

### Tâche 4.5 — Consommé rapide du jour (session du 09/06/2026)
- `src/lib/intake.js` (nouveau, testable node) : table dédiée **`dailyIntake`** (`{ id, date, kcal, updatedAt }`, **1 ligne/date, absence = non saisi (null, jamais 0)**) ; `loadIntake`/`setIntake`/`clearIntake` (upsert **atomique** en transaction rw, calque de `expenditure.js`) + **seam unique `effectiveConsumed(manualTotal, journalSum)`** = `manualTotal ?? journalSum` (**verrou nullish** : 0 prime, seul null/undefined retombe sur le journal).
- `src/screens/Jour.jsx` : la ligne **« Consommé »** du Bilan devient **éditable** (calque exact de la ligne Dépense — tap → input → OK, **saisie 2 s**) ; le total remonte au **héro** (anneau « Restant » + « X mangé ») et au bilan. **Macros P/C/L + sucres affichés « — / non renseigné »** quand le consommé vient du total manuel (pas de faux zéros). Fallback somme du journal conservé (existant smoke bilan reste vert).
- **Contrainte dure (table + export/import même tâche)** : `db.js` **`DEXIE_VERSION 3→4`** montée **ADDITIVE** (nouveau store, index unique `&date`) + ajout à `TABLES`. **`SCHEMA_VERSION` gardé à 2** (rétro-compat import). `backup.js` **inchangé** (piloté par `TABLES`, D7).
- Décision actée : **D17** (consommé rapide en table dédiée + réconciliation nutrition **provisoire/déférée** ; verrou nullish). Voir DECISIONS.md.

**Vérifs** : `tests/intake.test.mjs` ✅ (effectiveConsumed + **verrou nullish 0≠absence** ; scénario bilan pas-de-total/2100/clear ; upsert/absence/clear ; double-write concurrent → 1 ligne) · `migration.test.mjs` **S7** ✅ (base v3 réelle → bump v4 → **données préservées**, `dailyIntake` vide, 0 backup wipe) · smoke Playwright **consommé rapide** ✅ (2100 → bilan −400, persistance reload, 1 ligne/date, macros « non renseigné », effacer → rouvre la saisie) · suites migration/weight/metabolic/tickers/expenditure **restent vertes** (5/5 smoke) · `npm run lint`/`build` ✅. **Commit `59eef78`** (+ `1b8cc25` chore test auto-deploy Netlify).

### Tâche 5 — Nutrition (clôt la Phase 1) (session du 09/06/2026)
- `src/data/ingredientsSeed.js` : **58 ingrédients bruts /100 g** validés (féculents/protéines/légumes/matières grasses + **3 nouvelles catégories** fruits/laitages/aromates), `_meta` documentaire exclu, **ids slug stables** (déterministes, mieux que UUID aléatoires pour de la donnée de référence).
- `src/lib/nutrition.js` (logique pure + I/O, testable node) : `lineMacros`/`composeTotals` (valeur = /100 g × g ÷ 100, kcal entier, macros 0,1 g), `regramMacros` (**rescale le SNAPSHOT, jamais relire l'ingrédient** → D1), `validateIngredient` (**sucres ⊂ glucides**, IG 3 niveaux D5, ≥ 0), `distinctCategories` (connues d'abord puis custom en alpha → **filtres dynamiques**), CRUD ingrédient, `saveMeal` (**1 `journalEntry`/ligne, macros figées D1, sourceType ingredient D2, gi copié, UUID/updatedAt/loggedAt** — transaction rw), `loadDayEntries`/`updateEntryGrams`/`deleteEntry`.
- `src/screens/Bouffe.jsx` (onglet `bouffe`, ex-Placeholder) : 3 sous-vues — **Composer** (select groupé par catégorie + grammes → lignes empilées → total live → enregistrer), **Journal** du jour (regrammage/suppression), **Bibliothèque** (recherche `name` + filtres catégorie dynamiques + ajout/édition/suppression). `App.jsx` câblé.
- `src/seed.js` : `seedLibraryIfNeeded()` **gardé par le flag `settings.librarySeededV1`** (part sur device **déjà initialisé**, idempotent, **indépendant de l'import** car le flag voyage dans `settings`) ; `main.jsx` l'appelle au boot après `seedIfEmpty()`.
- **Schéma INCHANGÉ — zéro bump Dexie** (`DEXIE_VERSION` reste 4, `SCHEMA_VERSION` reste 2) : les stores `ingredients`/`journalEntries`/`drinks` existent depuis v2, leurs index (name/category/date) suffisent, les valeurs /100 g et snapshots sont **non indexés** → écriture libre. `backup.js` **intouché** (3 tables déjà dans `TABLES`, D7). D16/D17 ne s'appliquent pas (aucun nouveau store).
- **Côté « consommé » du Jour s'allume seul** depuis `journalEntries` (déjà câblé, Tâche 4/4.5) — sauf total manuel D17 (prime).
- **Hors périmètre (déféré)** : boissons (~38 alcoolisées) — table `drinks` en place, `sourceType:'drink'` non utilisé ; intelligence glucidique (barres/alertes IG) = Phase 2 (on capte juste `sugarsSimple100`+`gi`) ; recettes récurrentes ; couche IA.
- Décision actée : **D18** (nutrition zéro-bump + seed flag + ids slug + regram-from-snapshot + boissons déférées). Voir DECISIONS.md.

**Hardening (pré-commit)** : (2) audit ids slug ↔ `sourceId`/lookups/export-import/migrate → **tous agnostiques au format**, aucune hypothèse UUID en prod (rien à corriger) ; (3) `seedLibraryIfNeeded` durci **ceinture+bretelles** — n'insère QUE les ids slug manquants (l'id slug ÉTANT la PK) → un re-run sur flag sauté ne peut **ni dupliquer ni throw ConstraintError** (boot survit) et **n'écrase jamais un ingrédient édité** (pas de `bulkPut`) ; (4) validation confirmée **à l'édition aussi** (`updateIngredient`), pas que création ; (1) comptage seed re-vérifié = 8/8/8/5/18/6/5 (narration « 7/19 » erronée, **fichier correct**).

**Vérifs** : `tests/nutrition.test.mjs` ✅ (calcul portion exact ; totaux ; regram ÷2 **sur snapshot, ingrédient supprimé** ; validation sucres>glucides/IG/négatifs **création + édition** ; catégories dynamiques ; `saveMeal` → N entrées figées D1/D2/D5/D10-D12 ; **seed via flag** → 58 ing., idempotent, **biblio vidée + flag ⇒ pas de re-seed** ; **misfire flag → 0 doublon, 0 throw, édition préservée**) · smoke Playwright **7/7** ✅ — **nutrition** (seed 58 + flag au boot → plat poulet 200 g = **240 kcal** → **Journal conservé après reload** → **« 240 mangé » au Jour**) + **bibliothèque CRUD rendu réel** (créer → visible → éditer → supprimer) ; 5 smokes antérieurs **restent verts** · suites migration/weight/metabolic/tickers/expenditure/intake **restent vertes** (7 suites node) · `npm run lint`/`build` ✅. **Commit `a587528`** (poussé en ligne).

### Fix socle PWA — auto-update du service worker (Phase 0, session du 10/06/2026)
- **Symptôme** : la nutrition s'affichait dans Chrome mais **PAS dans la PWA installée sur l'iPhone** → la PWA reservait l'ancien bundle précaché (build pré-nutrition, sans `seedLibraryIfNeeded` ni écran Bouffe).
- **Cause racine** : `injectRegister:'auto'` posait un `registerSW.js` **minimal sans rechargement** → même avec `skipWaiting`+`clientsClaim` (déjà émis), la page ouverte gardait l'ancien JS en mémoire ; iOS suspend la PWA → l'ancien shell restait servi. **Aucune décision rouverte (D1→D18)** : pur socle.
- **Fix** : `vite.config.js` `injectRegister:false` (on enregistre nous-mêmes → plus de double-registration) + `skipWaiting`/`clientsClaim` **explicités** ; `main.jsx` `registerSW({ immediate:true })` de `virtual:pwa-register` (auto-reload contrôlé au nouveau SW) + **vérif d'update au RETOUR de focus/visibilité uniquement** (`visibilitychange` → `registration.update()`) — jamais de timer qui arracherait la page **en pleine compo**.
- **Points 2/3 audités, sains** : precache workbox couvre **tout le bundle** (un seul chunk, offline complet) ; ordre du seed correct (`seedIfEmpty` crée settings **avant** `seedLibraryIfNeeded` → 58 dès la 1ʳᵉ ouverture, **sans 2ᵉ reload**).
- **Remédiation one-shot device** (aucun code ne dé-fige un SW déjà installé) : fermer la PWA du sélecteur d'apps + rouvrir (2×) ; si figé, retirer/ré-ajouter à l'écran d'accueil.

**Vérifs** : `sw.js` émet bien `skipWaiting`+`clientsClaim` ; `index.html` **n'injecte plus** de `registerSW.js` (0 → pas de double-enregistrement) · smoke Playwright **fresh-install** ✅ (storage vierge → 1ʳᵉ ouverture → **58 ingrédients visibles SANS reload**, sentinelle de page intacte) · **8/8 smoke (×2 runs stables)** · 7 suites node **restent vertes** · `npm run lint`/`build` ✅. **Commit `a13fe83` (poussé en ligne).**

### Recettes récurrentes (inter-phases, session du 10/06/2026)
- `src/db.js` : **`DEXIE_VERSION 4→5`** montée **ADDITIVE delta-only** (pattern exact v3/v4, fusion Dexie, **aucun callback upgrade**) — nouveau store `recipes: 'id, name'` + ajout à `TABLES` (même commit, D7). `SCHEMA_VERSION` reste 2. `backup.js` intouché.
- `src/lib/nutrition.js` : recette = **formule de références VIVANTE** (`lines: [{ sourceId, nameSnapshot, grams }]`, zéro macro figée). `resolveRecipe` (pur) re-résout contre la biblio **courante** → nom à jour si renommé ; `saveRecipe`/`loadRecipes`/`renameRecipe`/`deleteRecipe` ; `applyRecipe` = **append** au journal via `saveMeal` (macros figées **à l'application**, D1), lignes mortes **sautées** + remontées, **toutes mortes ⇒ 0 entrée** (pas de repas vide).
- `src/screens/Bouffe.jsx` : 4ᵉ sous-vue **Recettes** (segmented control `Composer | Journal | Bibliothèque | Recettes`) — liste minimale **Rappeler** (1 tap, bandeau succès/avertissement, **pas de bascule** pour garder l'avertissement visible) + renommer + supprimer ; bouton **« Enregistrer comme recette »** dans Composer qui **conserve** les lignes (action annexe). `nameSnapshot` **fallback-only** (jamais affiché pour un ingrédient qui résout).
- Décision actée : **D19** (store additif + formule vivante + nameSnapshot fallback-only + append + édition lignes différée + ingrédients-seulement). Voir DECISIONS.md.

**Vérifs** : `tests/recipes.test.mjs` ✅ (R0 resolveRecipe pur **nom courant ≠ snapshot** ; R1 saveRecipe = références sans macros + validation ; R2 nominal **macros figées D1** + rappel ×2 append + **formule vivante** rappel-après-renommage ; R3 1 ligne morte sautée ; **R4 toutes mortes → 0 entrée** ; R5 rename/delete) · `migration.test.mjs` **S8** ✅ (base v4 réelle → bump v5 → **données préservées**, `recipes` vide, 0 backup wipe) · suites migration/weight/metabolic/tickers/expenditure/intake/nutrition **restent vertes** (222 PASS, 0 FAIL, 8 suites node) · smoke Playwright **10/10** ✅ — **recettes nominal** (poulet 200+riz 150 → recette → rappeler → journal 240+195 figés → reload persiste) + **dégradé** (riz supprimé → ligne sautée + avertissement, seul le poulet logué) ; 8 smokes antérieurs verts · `npm run lint`/`build` ✅. **Commit `8c45ae6` (poussé en ligne).**

### Filtre-recherche dans le picker du Composer (inter-phases, session du 10/06/2026)
- `src/lib/nutrition.js` : helper pur `filterIngredients(ingredients, { q })` (sous-chaîne, casse ignorée, trim ; q vide ⇒ liste inchangée) — **prédicat unique** de filtre par nom, partagé Composer + Bibliothèque.
- `src/screens/Bouffe.jsx` : champ **« Filtrer les ingrédients »** au-dessus du `<select>` (inchangé, même `aria-label="Choisir un ingrédient"`) ; options issues de la liste filtrée ; `effectivePick` **dérivé** (pas de state miroir) → jamais d'`<option>` orpheline. Bibliothèque refactorée vers `filterIngredients` (source unique du prédicat). Pas de combobox custom, pas de fuzzy, pas de filtre catégorie dans le Composer.
- **Smokes verts par construction** : filtre vide ⇒ les 58 options → les `selectOption('Choisir un ingrédient')` existants inchangés.

**Vérifs** : `tests/nutrition.test.mjs` bloc **F** ✅ (q vide/absent, sous-chaîne, casse, trim, no-match) · smoke Playwright **« composer : filtrer »** ✅ (filtre vide montre le riz → taper « poul » → riz disparaît, poulet reste → `selectOption` → 240 kcal) ; 10 smokes antérieurs verts · `npm run lint`/`build`/`test` ✅. **Commit `9f14939` (poussé en ligne).**

### Chantier D20 — réconciliation consommé : le journal prime (session du 10/06/2026)
- **DÉCISION D20** (tranche le report explicite de D17) : `effectiveConsumed` passe de `manualTotal ?? journalSum` à **`entryCount > 0 ? journalSum : manualTotal`** — le **journal est source de vérité dès ≥1 entrée**, le total manuel (`dailyIntake`) n'est qu'un **fallback** pour les jours sans aucune entrée. Le bug « le Jour ne se met pas à jour après un repas » était l'ancienne précédence D17, **pas un bug de code**.
- `src/lib/intake.js` : seam unique mis à jour (garde `entryCount > 0` au seul endroit, **aucune autre expression de précédence**). **Verrou nullish recadré** : ne s'applique plus qu'au cas fallback (0 entrée) ; avec des entrées, le manuel (0 compris) est ignoré.
- `src/screens/Jour.jsx` : appel du seam avec `entryCount` ; `consumedFromManual = entryCount === 0 && manualIntake != null` (→ macros P/C/L + sucres **s'allument depuis le journal** dès qu'il y a des entrées) ; **bandeau héro** « Total manuel (X kcal) — le journal prime » + tap **« Effacer le total manuel »** (réutilise `clearIntake`) quand un manuel résiduel coexiste avec des entrées. **`ConsumedRow` unifiée** (point D) : reçoit la valeur effective en prop, ne recalcule **aucune** précédence ; lecture seule « (repas) » quand le journal prime, édition du manuel seulement à 0 entrée → héro et Bilan **ne se contredisent plus**.
- **UI/logique only — AUCUN bump Dexie** (`DEXIE_VERSION` reste 5, `SCHEMA_VERSION` reste 2), `dailyIntake`/`backup.js` intouchés, **zéro risque migration**.

**Vérifs** : `tests/intake.test.mjs` migré vers B ✅ (flip « journal prime ≥1 entrée » + « manuel fallback à 0 entrée » + **verrou nullish recadré**) · smoke Playwright **D20** ✅ (journal injecté 600 + manuel 2100 → **héro ET Bilan montrent 600** « (repas) », bandeau « le journal prime », effacement du total manuel → reste sur le journal) ; **12/12 smokes** (les 11 antérieurs restent verts — smoke consommé-rapide à 0 entrée → fallback inchangé) · 8 suites node vertes · `npm run lint`/`build` ✅. **Commit `abb5a90` (poussé).**

### Phase 2 — Intelligence glucidique (lot 1, session du 10/06/2026)
- `src/lib/glycemic.js` (pur, testable node) : `carbsByGi` (ventilation des **grammes de glucides** du journal par `gi`, bucket défensif `unknown` si IG manquant), `glycemicShares` (parts en % + `highShare`), `evaluateGlycemicAlerts` (**seam unique des seuils**, calque D20). **RÈGLE D21** : les grammes `unknown` comptent au **dénominateur** (`totalCarb`) mais **jamais au numérateur haut-IG** (`highShare = high/totalCarb`) → un gramme non classé dilue, ne gonfle jamais.
- **2 règles d'alerte** (minimal, justifié) : **A** sucres simples `> targetSugarsSimple` (D15, borne stricte) ; **B** haut-IG un jour de repos (`!trained && totalCarb ≥ 50 g && highShare ≥ 0,50`). « Bas-IG insuffisant » **rejetée** (différée, D21).
- `src/lib/training.js` (calque `expenditure.js`/`intake.js`) : table dédiée **`trainingDays`** (`{ id, date, updatedAt }`, **présence = séance, absence = repos**, untoggle = delete). `loadTraining`/`setTraining`/`clearTraining`, upsert atomique rw.
- **Contrainte dure (table + export/import même tâche)** : `db.js` **`DEXIE_VERSION 5→6`** montée **ADDITIVE delta-only** (index unique `&date`) + `TABLES += 'trainingDays'` (D7). `SCHEMA_VERSION` gardé à **2**. `backup.js` intouché.
- `src/screens/Jour.jsx` : chip **« Séance aujourd'hui »** (toggle 1-tap, optimiste + persistance) ; carte **« Composition glucidique »** (barre 3 segments bas/modéré/haut + %, affichée dès ≥1 entrée) ; alertes A/B en pills. **`effectiveConsumed` (D20) non touché.**
- Décision actée : **D21** (analyse dérivée du journal + séance explicite `trainingDays` + 2 règles + réconciliation `trainingDays` vs `workouts` **DÉFÉRÉE** à l'import Strong). Voir DECISIONS.md.

**Vérifs** : `tests/glycemic.test.mjs` ✅ (bucketing ; parts somment à 100 ; **règle unknown dénominateur≠numérateur** ; A borne stricte 20/21 ; B bornes share 49/50 % + plancher 49/50 g + garde `trained` coupe B + unknown dilue → pas de B ; A+B cumulables) · `tests/training.test.mjs` ✅ (présence/absence, upsert idempotent 1 ligne, untoggle delete, clear no-op, autre date, double-write concurrent → 1 ligne) · `migration.test.mjs` **S9** ✅ (base v5 réelle → bump v6 → **données préservées**, `trainingDays` vide, 0 backup wipe) · 8 suites antérieures vertes (10 suites node) · smoke Playwright **13/13** ✅ — **intelligence glucidique** (journal IG mixte → compo 80 % haut-IG + 2 alertes jour de repos → toggle séance coupe B, A reste → reload persiste la séance, 1 ligne/date → retirer la séance ramène B) ; 12 smokes antérieurs verts · `npm run lint`/`build` ✅. **Commit `8bc8026` (poussé).**

### Phase 2 — Import CSV Strong (point 6, session du 10/06/2026)
- **Ground truth d'abord** : profilage du vrai export (`tests/fixtures/strong-export-reel.csv`, **committée**, 1008 lignes) — 28 séances (`Date` = identité, 1 nom + 1 durée/séance), **504 « Minuteur de repos »** à filtrer, 52 exos distincts (3 avec espaces traînants), cardio Cycling/Walking/Running/Rowing (19 séries), réps flottants `.0`, poids kg point (`.0`/`.5`), RPE/Notes vides partout, **1 séance étirements seule** (2026-01-04).
- `src/lib/strongImport.js` (parsing **PUR** + I/O mince) : mapping colonnes **FR+EN** (`detectColumns`, erreur `StrongImportError 'unknown-format'` si requis manquant) ; **filtre STRUCTUREL** (`isSetOrder` numérique → non-num **comptés par libellé**, jamais avalés) ; trim exos ; coercition `toInt`/`toNum` ; **date SAFARI-SAFE** (`strongDate` slice 10 + `strongStartedAt` parse **par composants**, `new Date(raw)` **INTERDIT** par commentaire) ; `classifyModality` cardio ; `parseStrongRows`/`parseStrongCsvText` → séances + rapport ; `importStrongText` (**transaction par séance**, dédup `strongKey` **skip-on-conflict**, validation en-têtes **AVANT tout write**) ; `loadWorkouts`/`loadSetsForWorkout`.
- `src/db.js` : **`DEXIE_VERSION 6→7`** montée **ADDITIVE** = ajout index **unique `&strongKey`** sur le store existant `workouts` (verrou d'idempotence ; Dexie fusionne les `.stores()`). `SCHEMA_VERSION` reste **2**. `workouts`/`sets` **déjà dans `TABLES`** → D7 satisfait, `backup.js` intouché.
- **Réconciliation D21 tranchée (option C)** : `effectiveTrained({ manualPresent, importedWorkouts })` (seam unique, `training.js`) = manuel OU séance importée **réelle** ; denylist `WARMUP_WORKOUT_NAMES` (étirements seuls exclus, normalisée trim+casse). Câblé dans `Jour.jsx` (charge `loadDayWorkouts`, alerte B sur `trainedEffective`). Toggle manuel = override prioritaire.
- `src/screens/Perf.jsx` (onglet **Perf**, ex-Placeholder, câblé `App.jsx`) : import CSV + **rapport** (ajoutées/déjà importées/séries/cardio/ignorées par libellé) + **erreur sans write** + **log consultable** (séances repliables → exos/séries, cardio = distance/durée brutes, muscu = poids×reps).
- Décision actée : **D22** (strongKey idempotence, bump v7 additif, date Safari-safe, filtre structurel, cardio capté brut, replace déféré) + **addendum D21 option C**. Voir DECISIONS.md.

**Vérifs** : `tests/strongImport.test.mjs` ✅ (fixture réelle : **28 séances / 504 séries**, 504 Minuteur par libellé, trim, coercition `.0`/`.5`, cardio 19, mapping FR/EN + format inconnu, **date Safari-safe par composants**, **idempotence double-import 0 doublon**, `effectiveTrained` option C) · `migration.test.mjs` **S10** ✅ (base v6 réelle → bump v7 → données préservées, workout v6 sans `strongKey` survit, **index unique présent + rejette un doublon**) · 10 suites node antérieures vertes (11 suites) · smoke Playwright **14/14** ✅ — **import Strong** (CSV réel → rapport 28/504/Minuteur → 28 workouts+504 sets en base → **ré-import 0 doublon** → reload persiste + détail) ; 13 smokes antérieurs verts · `npm run lint`/`build` ✅. **Commit : _en attente du GO_.**

_MAJ 10/06/2026 — Phase 0 + 1.0 (befd12a) + fix Jour (8bed676) + 1.1 poids (098bb88) + Tâche 2 profil/métabolique (de0dc89) + Tâche 3 tickers (6406954) + Tâche 4 bilan énergétique (8739e19 + harden ae947ae) + Tâche 4.5 consommé rapide (D17, 59eef78) + Tâche 5 Nutrition (D18, **a587528**) faits, validés. **PHASE 1 BOUCLÉE.** + **Fix socle PWA auto-update (a13fe83, poussé)** pour que la PWA iOS prenne enfin les déploiements. + **Recettes récurrentes (D19, 8c45ae6, poussé)** — store `recipes` additif v5, formule vivante, rappel 1 tap. Prochain = Phase 2 (intelligence glucidique)._

## En cours
- (rien) — **Phase 2 import CSV Strong (D22)** codé + vérifié (lint/build/11 suites node dont S10/14 smoke verts), **commit en attente du GO**.

## PROCHAINE ACTION CONCRÈTE
> **Phase 2 — Analyse de perf** (point 7 ROADMAP) : progressions / stagnations / régressions par exercice (le schéma D22 le permet via l'index `sets.[exercise+date]`), échauffement calculé, table exercice → variantes. **À part : boissons déférées** (~38 alcoolisées, table `drinks` prête, `sourceType:'drink'`) ; **replace-on-conflict** de l'import Strong (séance éditée dans Strong) déféré (D22). _Timing horaire des glucides autour de la séance : exige l'heure de séance — `startedAt` est désormais capté par l'import, porte ouverte._

## À faire — séquence (validation entre chaque)
1. ~~**1.0 Migration v2**~~ ✅ commitée (befd12a).
2. ~~**fix écran Jour blanc**~~ ✅ + smoke Playwright committé (8bed676).
3. ~~**1.1 Suivi du poids**~~ ✅ commitée (098bb88).
4. ~~**Tâche 2 Profil / moteur métabolique**~~ ✅ commitée (de0dc89).
5. ~~**Tâche 3 Tickers interactifs**~~ ✅ commitée (6406954).
6. ~~**Tâche 4 Bilan énergétique**~~ ✅ commitée (8739e19 + harden ae947ae).
7. ~~**Tâche 4.5 Consommé rapide**~~ ✅ commitée (59eef78).
8. ~~**Tâche 5 Nutrition**~~ ✅ (D18, commit en attente du GO) — **clôt la Phase 1**.
9. ~~**Phase 2 — intelligence glucidique (D21)**~~ ✅ (8bc8026, poussé) puis ~~**import CSV Strong (D22)**~~ ✅ (commit en attente). Reste : **analyse perf** (point 7). _+ boissons déférées (sous-tâche)._

## PROCHAIN GROS CHANTIER = NUTRITION (discu dédiée)
**Après** les tickers. À attaquer dans une **discussion neuve** :
- Bibliothèque d'**ingrédients bruts /100 g** (enrichissable).
- **Composition d'un plat par pesée** → `journalEntries` (macros figées en snapshot, D1).
- **Migration des ~38 boissons** (kcal + portions standard) — base à recréer (ancien projet perdu).

**Ne rien coder de nutrition ni de profil ici.**

## Notes / non testé
- Installation réelle sur iPhone + offline standalone **non testés sur device** (vérifié headless). À valider sur l'iPhone cible (via URL Netlify fixe).
- Octroi effectif de `storage.persist()` sur iOS Safari non garanti (dépend de l'OS).
- Migration v1→v2 testée en `fake-indexeddb` (node), **pas encore sur le vrai Safari iOS** — le device a une base v1 réelle ; la migration se déclenchera au prochain chargement de la version déployée.
