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

## En cours
- (rien)

## À faire — prochaine action concrète
- **Phase 1.1 — Nutrition** : créer la bibliothèque d'ingrédients bruts (seed de départ) + écran de saisie d'un plat par pesée (g) → calcul auto kcal/macros, écriture dans `journalEntries` (snapshot). Penser à mettre à jour l'écran Jour pour refléter les entrées du jour (déjà branché en lecture).

## Notes / non testé
- Installation réelle sur iPhone + comportement hors-ligne en standalone **non testés sur device** (vérifié uniquement en Chromium headless). À valider sur l'iPhone cible.
- Octroi effectif de `storage.persist()` sur iOS Safari non garanti (dépend de l'OS).
