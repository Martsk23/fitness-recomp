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
