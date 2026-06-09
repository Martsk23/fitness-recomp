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

_MAJ 09/06/2026 — Phase 0 + Tâche 1.0 commitées. 1.1 et 3 non commencées._

## En cours
- (rien) — Tâche 1.0 **validée + commitée**.

## PROCHAINE ACTION CONCRÈTE
> **Étape 2 = Tâche 1.1 Suivi du poids** : saisie kg + date/heure → `weightLogs`, courbe de tendance + moyenne glissante, encart « bon moment pour se peser », dashboard Jour = poids du jour + tendance.

## À faire — séquence (validation entre chaque)
1. ~~**1.0 Migration v2**~~ ✅ faite · validée · commitée.
2. **1.1 Suivi du poids** — _prochaine action_ ci-dessus. Pas commencée.
3. **3 Tickers interactifs** : cocher/incrémenter sur Jour → `tickerStates` keyé par date (reset auto minuit) ; progression visuelle. Pas commencée.

## Prochaine session (demain) = NUTRITION
Bibliothèque d'ingrédients bruts /100 g + composition de plat par pesée → `journalEntries` (snapshot) + base boissons. **Ne rien coder de nutrition ni de profil avant.**

## Notes / non testé
- Installation réelle sur iPhone + offline standalone **non testés sur device** (vérifié headless). À valider sur l'iPhone cible (via URL Netlify fixe).
- Octroi effectif de `storage.persist()` sur iOS Safari non garanti (dépend de l'OS).
- Migration v1→v2 testée en `fake-indexeddb` (node), **pas encore sur le vrai Safari iOS** — le device a une base v1 réelle ; la migration se déclenchera au prochain chargement de la version déployée.
