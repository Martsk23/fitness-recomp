# DECISIONS — Fitness Recomp

Choix d'architecture et leur justification. Append-only.

## D1 — Macros figées (snapshot) dans `journalEntries`
Les valeurs kcal/protéines/glucides/sucres/lipides sont **copiées au moment de la saisie**, pas recalculées à la volée depuis l'ingrédient.
**Pourquoi** : éditer ou supprimer un ingrédient ne doit pas réécrire l'historique des journées passées. L'intégrité du suivi prime sur la normalisation.

## D2 — Boissons dans le même journal via `sourceType`
`journalEntries.sourceType ∈ {ingredient, drink}` + `sourceId`. Un verre compte directement dans les kcal/sucres du jour.
**Pourquoi** : un seul chemin d'agrégation pour le bilan du jour ; évite une table de log parallèle et une double logique. Alternative (table séparée) rejetée comme plus complexe.

## D3 — Tickers : état keyé par date
`tickerStates` = une ligne par (ticker, jour). **L'absence de ligne pour aujourd'hui = valeur 0.**
**Pourquoi** : reset journalier automatique à minuit **sans tâche planifiée ni cron** — robuste hors-ligne, cohérent avec le 100 % local.

## D4 — IDs auto-incrément numériques (pas d'UUID)
**Pourquoi** : mono-utilisateur, mono-appareil. Suffisant ; l'import en mode `replace` réécrit l'ensemble, pas de collision multi-device à gérer au V1.

## D5 — IG à 3 niveaux (`low/mid/high`)
Le prompt disait « bas/haut » mais la maquette affiche « IG bas/modéré ». Retenu **3 niveaux**.
**Pourquoi** : reflète l'intention réelle de l'intelligence glucidique (modéré ≠ haut autour des entraînements).

## D6 — Import = remplacement intégral (replace), pas fusion
`importBundle` fait `clear()` + `bulkPut` par table, avec garde de `schemaVersion`.
**Pourquoi** : c'est une **restauration de sauvegarde**, sémantique attendue au V1. La fusion (merge) introduirait des conflits d'id non triviaux pour aucun bénéfice mono-appareil.

## D7 — `TABLES` source unique de l'export/import
Le tableau `TABLES` dans `src/db.js` pilote export, import et comptage.
**Pourquoi** : applique mécaniquement la contrainte dure « toute donnée dans l'export ». Ajouter une table sans l'ajouter à `TABLES` = trou de sauvegarde silencieux → règle inscrite dans CLAUDE.md.

## D8 — Tailwind v4 via `@tailwindcss/vite` (pas de tailwind.config.js)
**Pourquoi** : v4 est config-less par défaut, scan automatique. Les tokens couleur de la charte vivent dans `src/ui.js` (objet `C`) et en styles inline, pas dans un thème Tailwind — la maquette était déjà construite ainsi.

## D9 — Emplacement repo : `~/projects/fitness-recomp` (WSL natif)
**Pourquoi** : I/O npm/vite nettement plus rapides qu'en `/mnt/c`. Accès Windows si besoin via `\\wsl$`.

---
_Cadrage « local-first + sync futur » (Tâche 1.0). On reste 100 % local / hors-ligne / zéro backend aujourd'hui ; on rend seulement le schéma compatible avec un sync multi-appareils futur (voie C), pendant que la base est quasi vide. Le sync n'est PAS construit._

## D10 — Clés primaires en UUID (`crypto.randomUUID()`) sur toutes les tables
PK = `id` string UUID, assigné par l'app à l'insert (plus d'auto-incrément `++id`).
**Pourquoi** : éviter les collisions d'ID au merge multi-appareils quand le sync arrivera ; bonus immédiat → supprime tout remapping d'ID à l'import. `crypto.randomUUID()` exige un secure context (OK en HTTPS / localhost). Tombstones / soft-delete : **différés** à la phase sync.

### D10-bis — `settings` : clé sentinelle fixe `'singleton'` (pas un UUID aléatoire)
**Pourquoi** : `settings` est un singleton ; une clé connue et stable permet un `db.settings.get('singleton')` déterministe. Satisfait « PK string » sans casser la lecture.

### D10-ter — FK orpheline (chemin import) : drop + log + comptage
Une ligne référençante dont le parent est introuvable (après remap) est **supprimée**, loggée, et le total est remonté à l'UI.
**Pourquoi** : un pointeur mort est pire qu'une absence ; mieux vaut une perte visible (comptée) qu'une FK cassée silencieuse.

## D11 — Champ `updatedAt` (epoch ms) sur chaque enregistrement
Estampillé à chaque write applicatif via les helpers `newRow()` / `touch()` (`src/db.js`) — **pas** via un hook Dexie global.
**Pourquoi** : socle d'un merge « last-write-wins » futur. Le choix « helper, pas hook » est délibéré : **l'import doit préserver l'`updatedAt` du fichier** (un hook global le réécrirait à `now` au `bulkPut`, détruisant l'horodatage source nécessaire au merge).

## D12 — Champ `loggedAt` sur `journalEntries`
Heure réelle du repas (epoch ms), défaut = `createdAt`, éditable plus tard.
**Pourquoi** : nécessaire à l'intelligence glucidique (timing) et au chat repas à venir ; gratuit à ajouter à vide maintenant, vraie migration plus tard.

## D13 — Migration v1→v2 LIVE = WIPE + RESEED (pas de transform destructif)
Au boot, si une base v1 (PK auto-incrément) est détectée : **backup durable automatique** (IndexedDB séparée `fitnessRecompBackups`) **avant** tout delete → `Dexie.delete` → `db.open()` recrée une base v2 propre → reseed.
**Pourquoi** : (1) Dexie interdit le changement de PK en place (`UpgradeError: Not yet support for changing primary key`) → il faut recréer le store ; (2) mes données live = seed + tests, **jetables** ; le backup couvre le risque. Détection via **ouverture dynamique** Dexie (`probe.verno`), pas via un schéma v1 déclaré (ne lève pas de VersionError fiable). `transformV1toV2()` (remap FK parents→enfants) existe et est testé mais sert **uniquement à l'import de backups v1**, jamais en destructif sur la base live.

## D14 — Moyenne glissante du poids = trailing sur N **points** (pas N jours calendaires)
`movingAverage(values, window=7)` (`src/lib/weight.js`) moyenne les `window` dernières pesées **enregistrées**, indépendamment des dates.
**Pourquoi** : simple, déterministe, testable (valeurs exactes en unit test), suffisant tant que la pesée est ~quotidienne. **Caveat assumé** : si des pesées sont sautées, ces N points couvrent plus de jours réels → tendance bruitée / en retard. Le lissage par **fenêtre calendaire** (7 jours réels, interpolation des trous) est **volontairement reporté** — à revisiter quand l'usage réel le justifiera, pas avant. Inscrit aussi en commentaire dans le code.

## D15 — Politique de cibles recomp + garde-fous métaboliques (codés en dur)
Le moteur `src/lib/metabolic.js` calcule les budgets de toute l'app depuis le profil. Valeurs actées :
- **BMR** : Mifflin-St Jeor par défaut ; Katch-McArdle **uniquement si %MG saisi** (sinon indisponible, faute de LBM fiable).
- **TDEE** : 5 multiplicateurs d'activité — 1,2 / 1,375 / 1,55 / 1,725 / 1,9.
- **Recomp (objectif soigné)** : calories = **TDEE × 0,90** (léger déficit) ; **protéines 2,0 g/kg** (hautes, préservation/gain musculaire) ; **lipides 0,8 g/kg** ; **glucides = reste** des calories ; sucres simples **< 20 g/j** (déjà acté). Perte (×0,80 / 2,2 g/kg) et prise (×1,10 / 1,8 g/kg) prévues mais non soignées.
- **Garde-fous (jamais franchis, quel que soit le profil)** : plancher calorique absolu **♂ 1500 / ♀ 1200 kcal** ; **déficit plafonné à −20 %** (jamais sous TDEE×0,80) ; **plancher protéines 1,6 g/kg** ; **plancher lipides 0,6 g/kg** ; **glucides jamais négatifs** (si prot+lip plancher dépassent le budget, on remonte les kcal).

**Pourquoi** : la recomp exige protéines hautes + énergie quasi maintenance ; les garde-fous empêchent toute cible dangereuse (sous-alimentation, lipides trop bas pour la santé hormonale) sur un profil extrême. **Codés en dur volontairement** (pas seulement affichés) : le moteur ne PEUT pas émettre une cible sous ces planchers — testé par balayage (`tests/metabolic.test.mjs`).
**Seam d'évolution** : tout passe par `computeTargets()` et le TDEE est stocké → un futur **calibrage empirique** (ajuster le TDEE selon l'évolution réelle du poids) s'insère à un seul endroit, sans refonte. Volontairement **différé**, porte laissée ouverte (cf. ROADMAP Tâche 2, point 11).

## D16 — Versioning Dexie additif à partir de v2 + wipe réservé aux bases pré-UUID

**INVARIANT DUR.** À partir de v2 (PK UUID), toute montée de `DEXIE_VERSION` est **ADDITIVE** : on ajoute un store ou un index via une nouvelle `db.version(n).stores(delta)` ne déclarant QUE le delta (Dexie conserve les stores antérieurs). Une telle montée ne déclenche **JAMAIS** le wipe legacy. Le wipe destructif (D13) reste réservé aux bases **PRÉ-UUID** (v1, PK auto-incrément), détecté par `verno < FIRST_UUID_DEXIE_VERSION` dans `migrateLegacyIfNeeded()`. Verrouillé par le test **S5** de `migration.test.mjs` (base v2 réelle sur disque → bump v3 → données préservées, nouveau store créé vide, aucun backup de wipe).

**Pourquoi** : le bump Tâche 4 (ajout de `dailyExpenditure`) avec l'ancienne détection (`verno < DEXIE_VERSION` ⇒ legacy) aurait wipé **toute base v2 du device** → perte des vraies données. La détection legacy doit cibler la **rupture de PK** (auto-incrément → UUID), pas « toute version inférieure à la courante ».

**Corollaires actés**
- `SCHEMA_VERSION` (format d'export JSON) est **DÉCOUPLÉ** de `DEXIE_VERSION` : il ne bouge qu'à une rupture de **format** d'export, pas à chaque ajout de store. Resté à **2** ici — ajouter une table est rétro-compatible à l'import (table absente d'un vieux bundle ⇒ reste vide). **Garde** : test **S6** (`migration.test.mjs`) prouve qu'un bundle v2 sans `dailyExpenditure` + une table inconnue s'importe sans throw → c'est la tolérance de l'importeur qui *autorise* à figer SCHEMA_VERSION, pas une simple affirmation.
- `replace` (import) = **restauration intégrale atomique** : une **seule** `db.transaction('rw', db.tables, …)` vide TOUTES les tables PUIS réinsère ce que le bundle contient. Rollback Dexie si un write jette (ex. violation `&date`) → **jamais de base à moitié wipée**. Raffine **D6** (qui ne vidait que les tables présentes). Une table absente du bundle finit vide, pas avec des résidus du device.
- Dépense énergétique du jour en **table dédiée** `dailyExpenditure` (1 ligne par date, `{ id, date, kcal, updatedAt }`, absence = non saisi). Pas dans `settings` (singleton). « 1 ligne/date » **verrouillé structurellement** : index **unique `&date`** + upsert atomique en transaction rw (`expenditure.js`) — prouvé par un test de double-write concurrent. Le bilan (consommé − dépensé) reste **calculé, jamais stocké**.

## D17 — Consommé total du jour en saisie rapide (`dailyIntake`) + réconciliation DÉFÉRÉE

Saisie rapide du **consommé TOTAL du jour** (1 nombre, **pas de macros**) en **table dédiée `dailyIntake`** (`{ id, date, kcal, updatedAt }`, **1 ligne/date, index unique `&date`, absence = non saisi, JAMAIS 0**). Symétrique de `dailyExpenditure` (D16). Bump **`DEXIE_VERSION 3→4` ADDITIF** (D16 s'applique tel quel : aucun wipe, store créé vide — verrouillé par le test **S7** de `migration.test.mjs`). `SCHEMA_VERSION` **reste 2** (table additive, rétro-compat import). Ajoutée à `TABLES` → export/import couvert (D7). UI : la ligne « Consommé » du Bilan devient éditable (calque exact de la ligne Dépense) ; saisie en 2 s après la séance.

**Réconciliation avec le futur journal nutrition = PROVISOIRE, pas un invariant.** Tant que la nutrition n'a pas de saisie, le consommé effectif passe par un **seam unique** `effectiveConsumed(manualTotal, journalSum)` (`src/lib/intake.js`) : **le total manuel prime** (`manualTotal ?? journalSum`). **Verrou nullish OBLIGATOIRE** : `0` est un total **réel** (il prime), seuls `null`/`undefined` retombent sur la somme du journal — `loadIntake(absent)` renvoie `null` (jamais `0`), effacer **supprime la ligne** (≠ set 0). La règle **définitive** (override vs somme+ajustement, voire **inputs mutuellement exclusifs par date**) sera **tranchée au chantier nutrition**. Le `??` n'existe **qu'à cet endroit** — aucune logique D17 ailleurs.

**Pourquoi** : besoin immédiat « après ma séance, entrer mes kcal du jour en 2 s » sans attendre le gros chantier nutrition. **Table dédiée** (pas un `journalEntry` spécial qui violerait D1/D2 `sourceType ∈ {ingredient, drink}`) → orthogonale au journal, **rien à arracher** quand la nutrition arrivera : le côté « consommé » basculera alors sur `journalEntries`, ce seam tranchant la cohabitation. Macros affichées **« non renseigné »** (pas `0`) quand le consommé vient du total manuel : honnête, pas de faux zéros sur les barres P/C/L ni sur les sucres.

## D18 — Nutrition : zéro bump Dexie + seed gardé par flag + ids slug + regram-from-snapshot + boissons déférées

Lot Nutrition (clôt la Phase 1) : bibliothèque d'ingrédients bruts /100 g + composition d'un plat par pesée → `journalEntries`. Choix actés :

- **ZÉRO bump Dexie** (`DEXIE_VERSION` reste **4**, `SCHEMA_VERSION` reste **2**). Les stores `ingredients`/`journalEntries`/`drinks` existent depuis v2 et leurs index (`name, category` / `date, [date+sourceType], sourceId` / `name, category`) suffisent pour la liste, la recherche, le filtre et le journal du jour. Les valeurs /100 g (`kcal100, protein100, carb100, sugarsSimple100 ⊂ carb100, fat100, gi, isCustom, createdAt`) et les snapshots de `journalEntries` sont des champs **NON INDEXÉS** → écriture libre, aucun `db.version()`. **D16/D17 ne s'appliquent pas** (ils encadrent l'ajout de *stores* ; ici aucun). `backup.js` **intouché** (les 3 tables sont déjà dans `TABLES`, D7) → contrainte dure « toute donnée dans l'export » déjà satisfaite. _Un bump n'aurait été requis que pour un NOUVEL index._

- **Seed bibliothèque gardé par un flag `settings.librarySeededV1`** — PAS par `settings.count()` (le device est déjà initialisé → le seed ne partirait jamais) NI par « table vide » (re-seed après un backup légitimement vide). Le flag vit **dans `settings`**, donc il **voyage avec l'export/import** : un backup pris après le seed porte `librarySeededV1:true` → ré-import = pas de re-seed même si l'utilisateur a vidé sa biblio. `seedLibraryIfNeeded()` (idempotent) tourne au boot après `seedIfEmpty()`.

- **Ids slug stables** pour les 58 ingrédients seedés (`riz-blanc-cuit`, …) plutôt que des UUID aléatoires. **Déterministes** → identiques sur tout device, pas de doublon au futur sync (meilleur que D10 pour de la **donnée de référence**, pas de la donnée utilisateur). Les ingrédients **custom** (créés par l'utilisateur) restent en UUID via `newRow()`. `createdAt` estampillé à l'insertion (`null` dans le fichier seed).

- **Regrammage = rescale du PROPRE snapshot de l'entrée, JAMAIS relecture de l'ingrédient** (`regramMacros`). Renforce **D1** : éditer le grammage d'un repas passé garde la densité nutritionnelle figée à la saisie, même si l'ingrédient source a changé ou été supprimé depuis (prouvé en test, ingrédient supprimé). Supprimer un ingrédient **ne cascade pas** sur l'historique.

- **3 nouvelles catégories** (`fruits`, `laitages`, `aromates`) gérées **dynamiquement** (`distinctCategories` : connues dans un ordre stable puis custom en alpha) — jamais codées en dur dans les filtres.

- **Boissons déférées** : la table `drinks` reste en place mais le lot ne seed ni n'expose les ~38 boissons (ancien projet perdu, pas de source fiable → pas de fabrication de données). `sourceType:'drink'` (D2) non utilisé ici. Recréation = sous-tâche dédiée.

**Pourquoi** : capter la nutrition par pesée (le besoin réel) sans toucher au schéma ni au backup, en respectant D1/D2/D5/D7/D10-D12. Le côté « consommé » du bilan (Tâche 4/4.5) s'allume **seul** dès que `journalEntries` se remplit (déjà câblé), sauf total manuel D17 qui prime. **L'intelligence glucidique reste en Phase 2** : ici on se contente de capter `sugarsSimple100` + `gi` dans le schéma. La règle définitive de réconciliation « consommé » (D17 provisoire) sera tranchée quand l'usage le justifiera.

## D19 — Recettes récurrentes : store `recipes` additif (v5) + formule de RÉFÉRENCES vivante (≠ snapshot) + nameSnapshot fallback-only

Recette réutilisable = composition mémorisée, rappelable en 1 tap dans le journal du jour. Choix actés :

- **Store dédié `recipes` (DEXIE_VERSION 4→5), `SCHEMA_VERSION` reste 2.** Montée **purement ADDITIVE**, pattern **delta-only** identique à v3/v4 : une ligne `db.version(DEXIE_VERSION).stores({ recipes: 'id, name' })` partageant la constante (Dexie **fusionne** les `.stores()` d'une même version — on ne redéclare PAS les 11 stores existants), **aucun callback upgrade**. D16 s'applique tel quel : un device v4 réel n'est **jamais wipé**, le store est créé vide, données préservées — **verrouillé par le test S8** de `migration.test.mjs` (porte dure avant tout déploiement device). `TABLES += 'recipes'` **dans le même commit** (D7, sinon trou de sauvegarde). `backup.js` intouché (piloté par `TABLES`). `SCHEMA_VERSION` figé à 2 = rétro-compat import (table absente d'un vieux bundle ⇒ vide, tolérance prouvée S6).

- **Une recette = formule de RÉFÉRENCES vivante, PAS un snapshot.** Stockée comme `lines: [{ sourceId, nameSnapshot, grams }]` — des références, **aucune macro figée dans la recette**. À chaque « Rappeler », `resolveRecipe` **re-résout** chaque `sourceId` contre la bibliothèque **courante** → nom + valeurs /100 g à jour. Le figeage **D1** n'arrive **qu'à l'application** au journal, via `saveMeal` (qui copie les macros calculées). Distinction nette : `journalEntries` = figé (D1) ; `recipes` = template vivant. Conséquence voulue : éditer un ingrédient (renommage, correction de macros) **se reflète** au prochain rappel, sans réécrire l'historique déjà journalisé.

- **`nameSnapshot` = FALLBACK D'AFFICHAGE UNIQUEMENT.** Tant que l'ingrédient résout, l'UI montre **toujours** le nom **courant** (un renommage n'affiche jamais un nom périmé). Le `nameSnapshot` n'est lu **que** lorsque la résolution échoue (ingrédient supprimé) : la ligne est **sautée** et remontée dans un avertissement « *… — supprimé, ignoré* ». Cas **toutes lignes mortes** → **aucune** `journalEntry` écrite (pas de repas vide). Prouvé par `recipes.test.mjs` (R3 une ligne morte, R4 toutes mortes) + smoke dégradé.

- **« Rappeler » = APPEND, jamais remplacement** (`applyRecipe` → `saveMeal` en `bulkAdd`). On reste sur la sous-vue Recettes avec un **bandeau de retour** (succès / avertissement) — pas de bascule vers Journal (sinon l'avertissement serait démonté).

- **Édition différée** : seul le **renommage** (`renameRecipe`) est supporté. Changer les lignes d'une recette = la **supprimer + re-save** depuis le Composer (`updateRecipe` complet volontairement non construit).

- **« Enregistrer comme recette » depuis le Composer = action annexe** : les lignes du Composer **RESTENT** en place après l'enregistrement (on peut vouloir aussi loguer ces lignes aujourd'hui). Distinct de « Enregistrer le repas » (qui vide + bascule Journal).

- **Écran** : sous-vue **Recettes** via le segmented control en haut de Bouffe (`Composer | Journal | Bibliothèque | Recettes`) — pas une section sous la Bibliothèque, pas une destination de la nav du bas. Réutilise le pattern de liste existant.

- **Recettes = INGRÉDIENTS seulement.** Boissons toujours déférées (D18) ; pas de cas boisson-dans-recette (`saveMeal` n'écrit que `sourceType:'ingredient'`).

**Pourquoi** : besoin réel « je remange souvent les mêmes plats, je veux les rappeler en 1 tap » sans dupliquer la saisie. La formule vivante (références) bat le snapshot figé pour un **template** : corriger un ingrédient profite à tous les rappels futurs. Le figeage reste là où il doit être — **dans le journal** (D1) — pas dans le template. Store additif orthogonal : rien à arracher, aucun invariant existant rouvert (D1/D2/D5/D7/D10-D12/D16/D18 tous respectés).

## D20 — Consommé : le JOURNAL est source de vérité dès ≥1 entrée ; le total manuel (`dailyIntake`) n'est qu'un FALLBACK (tranche le report de D17)

**Règle.** `effectiveConsumed` passe de `manualTotal ?? journalSum` (manuel prioritaire) à **journal prioritaire dès qu'il existe ≥1 entrée** : `entryCount > 0 ? journalSum : manualTotal`. Le total kcal saisi à la main (`dailyIntake`, D17) ne sert plus que les jours **sans aucune entrée de journal** (saisie rapide post-séance avant toute composition). Dès le 1ᵉʳ repas logué dans Bouffe, le journal prime et les macros P/C/L + sucres s'allument depuis le journal (fin des « — »).

**Pourquoi.** D17 avait explicitement **déféré** la règle de réconciliation (« override vs somme+ajustement, voire inputs mutuellement exclusifs par date — tranchée au chantier nutrition »). La nutrition est livrée (D18/D19) : le journal détaillé est désormais la donnée riche (macros, IG, sucres) ; le total manuel n'est qu'un raccourci dégradé. Faire primer le détail sur le raccourci est l'arbitrage cohérent. Le symptôme observé (« le tableau du Jour ne se met pas à jour après un repas logué ») était l'ancienne précédence D17, **pas un bug de code** (Jour relit bien `journalEntries` au remontage).

**Ce que ça NE rouvre PAS.** D17 tient sur tout le reste : table dédiée `dailyIntake` (≠ `journalEntry`, ne viole pas D1/D2), **1 ligne/date** index unique `&date`, **absence = non saisi** (`null`, jamais 0). Le **verrou nullish survit** mais ne s'applique plus qu'au **cas fallback (0 entrée)** : à 0 entrée, un total manuel de `0` reste un 0 réel ; avec des entrées, le manuel (0 compris) est ignoré. Le seam reste **unique** (`effectiveConsumed`) : le `??` est remplacé par la garde `entryCount > 0` **au même endroit** — aucune autre expression de précédence dans l'app (la ligne « Consommé » du Bilan reçoit la valeur effective en prop, elle ne la recalcule pas).

**Visibilité (anti-confusion).** Quand un total manuel existe pour le jour ET que le journal a des entrées (le manuel est donc ignoré), le héro Jour affiche « *Total manuel (X kcal) saisi — le journal prime* » + un tap « **Effacer le total manuel** » qui réutilise `clearIntake` (l'affordance d'effacement existante). Pas de switch, pas de mode, pas de nouvel état/flag.

**Périmètre.** **UI/logique seulement, AUCUN bump Dexie** (`DEXIE_VERSION` reste 5, `SCHEMA_VERSION` reste 2), `dailyIntake` et `backup.js` intouchés → **zéro risque migration**. Verrouillé par `intake.test.mjs` migré (flip « journal prime ≥1 entrée » + « manuel fallback à 0 entrée » + verrou nullish recadré) + smoke D20 (journal injecté 600 + manuel 2100 → héro & Bilan montrent 600, effacement du total manuel).

## D21 — Intelligence glucidique v1 (granularité JOUR) : analyse dérivée du journal + contexte séance explicite (`trainingDays`) + 2 règles d'alerte pures

Phase 2, 1ᵉʳ lot. **Tout est jour-level** : pas de timing horaire des glucides autour de la séance (différé — exige une heure de séance qu'on n'a pas ; le cahier des charges le prévoit, on ne le construit pas ici). Choix actés :

- **Analyse glucidique = ZÉRO nouvelle donnée.** La composition bas/modéré/haut IG se dérive du journal du jour : chaque `journalEntry` porte déjà `carb` (g) + `gi ∈ {low,mid,high}` FIGÉS à la saisie (D5/D18). `src/lib/glycemic.js` (pur) : `carbsByGi` (ventilation des grammes par IG), `glycemicShares` (parts en %), `evaluateGlycemicAlerts` (alertes). Rien n'est stocké — pur calcul, recalculé au montage du Jour.

- **Pondération = GRAMMES DE GLUCIDES par niveau d'IG.** L'IG qualifie le glucide → la composition se mesure en g de carb par bucket (une entrée ~0 g carb pèse ~0, auto-neutralisée). Les **sucres simples sont un axe SÉPARÉ** (règle A), jamais mélangés à la composition IG.

- **RÈGLE DÉNOMINATEUR / NUMÉRATEUR du résidu `unknown`** (arbitrage exigé). `gi` absent ou hors {low,mid,high} → bucket défensif `unknown` (D18 le copie toujours ; on ne crashe jamais sur une donnée legacy). Ses grammes comptent au **DÉNOMINATEUR** (`totalCarb` = glucide réel) mais **JAMAIS au numérateur haut-IG** : `highShare = high / totalCarb`. Un gramme non classé **dilue** la part haut-IG, il ne la gonfle jamais. Documenté dans `glycemic.js` + assertion dédiée (`glycemic.test.mjs` : high=40 / unknown=60 → highShare 0,4 → PAS d'alerte B).

- **Contexte « séance ce jour » = saisie EXPLICITE 1-tap, table dédiée `trainingDays`.** Pas d'inférence (l'import Strong est une phase ultérieure ; `dailyExpenditure` est un total journalier inexploitable pour inférer une séance). Bump **`DEXIE_VERSION 5→6` ADDITIF** (D16 s'applique tel quel, delta-only, aucun wipe — verrouillé par **S9** de `migration.test.mjs`). `SCHEMA_VERSION` **reste 2** (table additive, rétro-compat). `TABLES += 'trainingDays'` **même commit** (D7) ; `backup.js` intouché (piloté par `TABLES`). Ligne `{ id, date, updatedAt }`, index unique `&date` : **PRÉSENCE = séance, ABSENCE = repos** (calque D3/D17 — on ne stocke jamais `false`, **untoggle = suppression de la ligne**). `src/lib/training.js` calque `expenditure.js`/`intake.js` (upsert atomique rw).

- **Set d'alertes MINIMAL = 2 règles, chacune pure et testable** (seam unique `evaluateGlycemicAlerts`, calque `effectiveConsumed`/D20 — **aucune autre expression de seuil ailleurs dans l'app**) :
  - **A « sucres-high »** : `sugars > settings.targetSugarsSimple` (D15, défaut 20 g ; borne STRICTE → 20 ne déclenche pas, 21 oui).
  - **B « high-gi-rest »** : `!trained && totalCarb ≥ 50 g && highShare ≥ 0,50`. Le haut-IG se justifie **autour de la séance** ; sur un jour de **repos**, >50 % des glucides en haut-IG est le signal actionnable. Plancher **50 g** → ne crie pas sur une journée quasi sans glucides. Bornes (≥) prouvées en test.
  - **Rejet acté** de « bas-IG insuffisant » : le bas-IG n'est pas une cible à atteindre → règle bruyante et faiblement fondée. **Différée, pas oubliée** (réinscriptible si l'usage le justifie).

- **UI sur le Jour uniquement** : chip **« Séance aujourd'hui »** (toggle 1-tap, maj optimiste + persistance) ; carte **« Composition glucidique »** (barre 3 segments bas/modéré/haut + % ) affichée **dès ≥1 entrée** (à 0 entrée le détail macros est inconnu, cf. D20 `consumedFromManual`) ; alertes A/B en pills sous la carte. **Rien sur Bouffe** (pas de badge IG par ligne en v1 — hors périmètre acté). `effectiveConsumed` (D20) **NON touché**.

- **RÉCONCILIATION `trainingDays` vs `workouts` DÉFÉRÉE** (report explicite, loggé comme D17 l'avait été — pas un trou). Quand l'**import Strong** arrivera (Phase 2, point 6), une séance pourra venir de deux sources : le toggle manuel (`trainingDays`) OU une séance importée (`workouts`). La règle définitive — **probablement `trained = présence manuelle OU séance importée ce jour`** — sera tranchée **au chantier import Strong**, pas avant. En v1, `trained` = présence d'une ligne `trainingDays` uniquement.

**Pourquoi.** La nutrition livrée (D18/D19) capte déjà `gi` + `sugarsSimple` figés → l'analyse glucidique est **gratuite côté données**, il ne manquait que le calcul + l'affichage. Le seul invariant nécessaire est le **contexte séance** (règle B), capté par une saisie explicite honnête (absence = repos) plutôt qu'une inférence fragile. Table additive orthogonale : rien à arracher, aucune décision D1→D20 rouverte (D3/D5/D13/D16/D17/D18/D20 tous respectés). Verrouillé par `glycemic.test.mjs` (bucketing, parts, règle unknown, bornes A/B, garde `trained`), `training.test.mjs` (présence/absence, upsert idempotent, untoggle, concurrent → 1 ligne), `migration.test.mjs` **S9** (v5→v6 additif, données préservées), et un smoke (compo 80 % haut-IG + 2 alertes jour de repos → toggle séance coupe B → reload persiste).
