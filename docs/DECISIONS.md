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
