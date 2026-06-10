# CLAUDE.md — Fitness Recomp (PWA locale)

> Auto-chargé à chaque session. Contraintes dures, conventions, modèle de données.

## Contexte
App **personnelle** de suivi fitness orientée **recomposition corporelle**. Dev sur PC (WSL), cible **iPhone**. **PWA installable, hors-ligne, 100 % locale** — pas de serveur, pas de compte, mono-utilisateur.

## Contraintes dures (non négociables)
- PWA installable iOS + hors-ligne complet. **Jamais** de natif / Swift / Xcode / HealthKit / Apple Fitness en direct.
- Stockage **IndexedDB via Dexie.js**. **Jamais** `localStorage` pour les données métier.
- **100 % local**, pas de backend au V1, aucune donnée ne quitte l'appareil.
- **Toute donnée doit être incluse dans l'export JSON.** Nouvelle table/entité → mise à jour de `TABLES` (src/db.js) ET export/import (src/lib/backup.js) **dans la même tâche**.
- **Mobile-first**, écran iPhone, saisie quotidienne en ≤ 2 s.
- Objectif transversal : recomp → macros stricts, **sucres simples < 20 g/jour**, timing glucidique.
- **Pas de push notifications au V1** (nécessite un serveur). Rappels = in-app uniquement.

## Stack
React 19 + Vite 8 + `vite-plugin-pwa`, Tailwind v4 (`@tailwindcss/vite`), **Dexie.js 4** (IndexedDB), Recharts (graphes), PapaParse (import CSV Strong), lucide-react (icônes).

## Méthode de travail
- **Tranches verticales** : une feature finie et utilisable avant la suivante.
- **Un commit git par feature**, message clair.
- Docs maintenues dans `/docs/` : ce fichier, `ROADMAP.md`, `PROGRESS.md`, `DECISIONS.md`.
- **Fin de session → mettre à jour `PROGRESS.md`.**

## Modèle de données (Dexie v1 — `src/db.js`)
Conventions : id auto-incrément (`++id`) ; dates jour en `'YYYY-MM-DD'` (string, fuseau local) ; timestamps en epoch ms quand l'heure compte. Notation = champs **indexés**.

| Table | Index Dexie | Champs (objet stocké) |
|---|---|---|
| `ingredients` | `++id, name, category` | name, kcal100, protein100, carb100, sugarsSimple100 (⊂ carb100), gi (`low/mid/high`), fat100, category, isCustom, createdAt |
| `journalEntries` | `++id, date, [date+sourceType], sourceId` | date, sourceType (`ingredient/drink`), sourceId, nameSnapshot, grams, **kcal/protein/carb/sugarsSimple/fat (snapshot figé)**, gi, createdAt |
| `weightLogs` | `++id, date, datetime` | date, datetime (epoch ms), weightKg, note |
| `workouts` | `++id, date` | date, name, source (`manual/strong-import`), createdAt |
| `sets` | `++id, workoutId, exercise, [exercise+date]` | workoutId, exercise, setIndex, reps, weightKg, date |
| `tickerConfigs` | `++id, order` | label, type (`counter/checkbox`), target, icon, order, active |
| `tickerStates` | `++id, [tickerId+date], date` | tickerId, date, value (count ou 0/1) — **absence de ligne = 0 ⇒ reset journalier** |
| `drinks` | `++id, name, category` | name, category, portionLabel, portionMl, **kcal/protein/carb/sugarsSimple/fat (PAR PORTION, kcal PORTÉ jamais recalculé — D25)**, gi (`low/mid/high`), alcoholG (porteur kcal, 7 kcal/g), isCustom, createdAt |
| `settings` | `++id` | **singleton id=1** : targetKcal/Protein/Carb/Fat/SugarsSimple, preferences, updatedAt |

Décisions de design : voir `DECISIONS.md`.

## Arborescence
```
src/
  db.js            Dexie + TABLES (source unique pour export/import)
  seed.js          amorçage premier lancement (settings + tickers)
  ui.js            tokens couleur C{}, num, todayKey, formatFrDate
  main.jsx         boot : open db → seed → persist → render
  App.jsx          shell (header, tab bar, routing par onglet)
  lib/
    storage.js     navigator.storage.persist() + estimate()
    backup.js      exportAll/downloadBackup/importBundle/tableCounts
  screens/
    Jour.jsx       tableau de bord (lecture seule en Phase 0)
    Data.jsx       export / import / persistance / contenu base
```

## À NE PAS faire (sans demande explicite)
- Plats préparés industriels / base Picard (~90 % maison).
- HealthKit / Apple Fitness direct. Dépenses = saisie manuelle ; Strong = import CSV.
- Push notifications au V1.
- `localStorage` pour les données métier.
- Ajouter une table sans mettre à jour `TABLES` + export/import.
