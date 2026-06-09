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

**Vérifs** : smoke **rouge sur le code buggé → vert après fix** (preuve qu'il attrape la classe de bug) · `npm run lint` ✅ · `npm test` ✅ · `npm run build` ✅. **Commit `9a0c3be`.**

### Tâche 1.1 — Suivi du poids (session du 09/06/2026)
- `src/lib/weight.js` (logique pure, testable node) : `movingAverage` trailing **7 derniers points** (caveat commenté : fenêtre = points, pas jours → sauts de pesée bruitent la tendance ; calendaire **reporté**), `trend` (down/up/flat + delta), `shouldWeighNow` (matin < 12h ET pas encore pesé).
- `src/screens/Poids.jsx` (+ onglet câblé dans `App.jsx`) : saisie kg (virgule/point) + date/heure (défaut = maintenant) → `weightLogs` via `newRow()` (UUID + `updatedAt`), `date = todayKey(datetime)` ; courbe Recharts (points bruts + moyenne glissante) + historique.
- `Jour.jsx` : encart pesée du jour + tendance, sinon CTA « bon moment pour te peser » le matin, sinon rappel discret.
- **Schéma inchangé** : `weightLogs` déjà en v2 et déjà dans `TABLES` → export/import couvre la pesée sans modif.
- Décision design actée : **D14** (moyenne glissante trailing N points, voir DECISIONS.md).

**Vérifs** : `tests/weight.test.mjs` ✅ (moyenne glissante sur séries connues, valeurs exactes ; tendance ; heuristique — branché dans `npm test`) · smoke Playwright **persistance pesée** ✅ (saisie `77,7` → reload → relue + Jour reflète la pesée) · `npm run lint` ✅ · `npm run build` ✅ · `npm test` migration **reste vert**. **Commit `f0556fb`.**

### Tâche 2 — Profil / moteur de calcul métabolique (session du 09/06/2026)
- `src/lib/metabolic.js` (moteur pur, testable node) : BMR **Mifflin-St Jeor** (défaut) / **Katch-McArdle** (si %MG saisi), **5 multiplicateurs** TDEE (1.2→1.9), cibles par objectif (**recomp = TDEE×0,90, prot 2,0 g/kg, lip 0,8 g/kg, glucides = reste, sucres <20 acté**), IMC, **garde-fous codés en dur** (plancher kcal ♂1500/♀1200, déficit plafonné −20 %, prot ≥1,6 g/kg, lip ≥0,6 g/kg, glucides jamais négatifs).
- `src/screens/Profil.jsx` : onboarding (profil vide au boot) + édition dans Données ; **poids = dernier `weightLogs` sinon saisie qui crée la 1ʳᵉ pesée** ; aperçu live des cibles ; écrit `settings` (profil + cibles + `targetsSource:'computed'`) via `touch()`.
- `App.jsx` : gate onboarding au boot si profil incomplet (cadre `Shell` partagé). `Data.jsx` : section Profil & cibles + recalcul. `Jour.jsx` : fallback propre (pas de `NaN`) si cibles non calculées.
- `seed.js` : **dé-seed** des cibles en dur (`profile:null`, `targetsSource:'fallback'`, sucres 20 conservés).
- **Schéma inchangé** (`DEXIE_VERSION`/`SCHEMA_VERSION` = 2) : champs `settings` non indexés, additifs, rétro-compatibles ; export couvre via `TABLES` (lignes complètes). Calibrage TDEE empirique **différé** (seam centralisé dans `metabolic.js`).
- Décisions actées : **D15** (politique cibles recomp + garde-fous). Voir DECISIONS.md.

**Vérifs** : `tests/metabolic.test.mjs` ✅ (BMR valeurs connues, multiplicateurs, cibles recomp 2483/160/317/64, **garde-fous qui bloquent** + invariant balayage) · smoke Playwright ✅ (onboarding → cibles calculées 2483 → reload profil persisté) · `tests/migration.test.mjs` assertion reseed adaptée au dé-seed ✅ · `npm run lint`/`build`/`test` ✅. **Commit `c754429`.**

### Tâche 3 — Tickers interactifs (session du 09/06/2026)
- `src/lib/tickers.js` (logique extraite, testable node) : `nextValue` (counter `inc`/`dec` borné à 0 / checkbox `toggle`), `clampCounter`, `loadActiveConfigs` (triés par `order`), `loadStates(date)` (map tickerId→valeur, **absence ⇒ 0**), `setValue` (**upsert** sur la clé `(tickerId, date)` : `newRow()` à la 1ʳᵉ écriture du jour, `touch()` ensuite → jamais de doublon ; ligne à 0 conservée plutôt que supprimée — 0 explicite ≡ absence).
- `src/screens/Jour.jsx` : section **« Routine du jour »** — compteurs (eau) avec − / + (bornage 0, − désactivé à 0, ajout demandé), cases (compléments) en toggle ; progression par ticker (`5 / 8`) + compteur de complétion (`3 / 4`) ; maj **optimiste** puis persistance.
- **Schéma inchangé** : `tickerStates` déjà en v2 et dans `TABLES` → export/import couvre sans modif `db.js`. Pas de nouvelle décision (D3/D10/D11 appliquées).
- **Tickers figés** (les 4 seedés) : ajout/retrait/cible/ordre par l'utilisateur **différé** → tranche future au ROADMAP.

**Vérifs** : `tests/tickers.test.mjs` ✅ (nextValue/clamp purs ; upsert sans doublon ; **« autre date repart à 0 »** prouvé en base) — branché dans `npm test` (migration/weight/metabolic **restent verts**) · smoke Playwright ✅ (0 → +3 → −1 → clamp 0 → 2 + Créatine cochée → **reload : état du jour conservé** ; injection d'une ligne d'hier qui ne remonte pas aujourd'hui) · `npm run lint`/`build` ✅. **Commit `738582e`.**

### Tâche 4 — Bilan énergétique (session du 09/06/2026)
- `src/lib/expenditure.js` (nouveau, testable node) : table dédiée **`dailyExpenditure`** (`{ id, date, kcal, updatedAt }`, **1 ligne par date, absence = non saisi**) ; `loadExpenditure`/`setExpenditure`/`clearExpenditure` (upsert **atomique** en transaction rw) + `energyBalance` pur (consommé − dépensé, **calculé jamais stocké**).
- `src/screens/Jour.jsx` : encart **« Bilan énergétique »** — saisie rapide de la **dépense TOTALE du jour** (1 nombre, pas de HealthKit) ; consommé **honnête** tant que la nutrition n'est pas suivie (« non suivi pour l'instant » / « en attente des repas ») ; bilan signé (déficit lime / surplus rose).
- **Contrainte dure (table + export/import même tâche)** : `db.js` **`DEXIE_VERSION 2→3`** montée **ADDITIVE** (nouveau store, index **unique `&date`**) + ajout à `TABLES` ; `backup.js` `replace` vide TOUTES les tables (restauration intégrale atomique). **`SCHEMA_VERSION` gardé à 2** (table additive = rétro-compat import).
- **Garde-fou anti-perte de données** : `migrate.js` — wipe legacy réservé aux bases **pré-UUID** (`verno < FIRST_UUID_DEXIE_VERSION`) ; une base v2 réelle **n'est jamais wipée** (upgrade additif Dexie).
- Décision actée : **D16** (versioning additif + corollaires : SCHEMA_VERSION découplé, import atomique, dépense en table dédiée). Voir DECISIONS.md.

**Vérifs** : `tests/expenditure.test.mjs` ✅ (energyBalance ; upsert/absence/clear ; **double-write concurrent → 1 ligne**) · `migration.test.mjs` **S5** ✅ (base v2 réelle → bump v3 → **données préservées**, store vide, 0 backup wipe) + **S6** ✅ (tolérance import : bundle v2 sans la table + table inconnue → pas de throw → justifie SCHEMA_VERSION=2) · smoke Playwright **bilan** ✅ (repas injecté 600 + dépense 2500 → **−1900**, persistance reload, **1 ligne keyée par date**) · suites migration/weight/metabolic/tickers **restent vertes** · `npm run lint`/`build` ✅. **Commits `f59d3cc` (feat) + `6d174bc` (harden, review).**

_MAJ 09/06/2026 — Phase 0 + 1.0 (939dd7f) + fix Jour (9a0c3be) + 1.1 poids (f0556fb) + Tâche 2 profil/métabolique (c754429) + Tâche 3 tickers (738582e) + **Tâche 4 bilan énergétique (f59d3cc + harden 6d174bc)** faits, validés, commités. **Quotidien utilisable bouclé ; reste la Nutrition (gros chantier, discussion dédiée) pour clore la Phase 1.**_

## En cours
- (rien) — Tâche 4 close ; reste la Nutrition (gros chantier dédié) pour clore la Phase 1.

## PROCHAINE ACTION CONCRÈTE
> **NUTRITION** (gros chantier, à attaquer en **discussion dédiée** — voir section dédiée plus bas). Bibliothèque d'ingrédients bruts /100 g + composition d'un plat par pesée → `journalEntries` (macros figées, D1) + migration des ~38 boissons. **Une fois la nutrition là, le côté « consommé » du bilan (Tâche 4) s'allume seul** (déjà câblé sur `journalEntries`). **Ne rien coder de nutrition hors de cette discussion dédiée.**

## À faire — séquence (validation entre chaque)
1. ~~**1.0 Migration v2**~~ ✅ commitée (939dd7f).
2. ~~**fix écran Jour blanc**~~ ✅ + smoke Playwright committé (9a0c3be).
3. ~~**1.1 Suivi du poids**~~ ✅ commitée (f0556fb).
4. ~~**Tâche 2 Profil / moteur métabolique**~~ ✅ commitée (c754429).
5. ~~**Tâche 3 Tickers interactifs**~~ ✅ commitée (738582e).
6. ~~**Tâche 4 Bilan énergétique**~~ ✅ commitée (f59d3cc + harden 6d174bc).
7. **Nutrition** — _prochaine action_ ci-dessus. **Discussion dédiée — clôt la Phase 1.**

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
