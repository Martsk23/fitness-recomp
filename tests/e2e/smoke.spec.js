import { test, expect } from '@playwright/test'

// Ces tests montent le VRAI React dans un VRAI IndexedDB sur l'app buildée.
// migration.test.mjs tourne en node (fake-indexeddb) et ne monte aucun composant
// → il ne pouvait PAS voir que Jour lisait settings.get(1) alors que le seed écrit
// la clé 'singleton' (D10-bis). Résultat : settings undefined → `return null` →
// écran Jour blanc sur l'appareil. Ce smoke-ci attrape exactement cette classe de bug.

test("l'écran Jour se monte (ne rend pas null) après seed", async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')

  // Le héro ne s'affiche QUE si settings a été lu (sinon Jour renvoie null).
  await expect(page.getByText("Restant aujourd'hui")).toBeVisible()
  // Et la cible kcal seedée doit transparaître dans le dashboard.
  await expect(page.getByText('objectif 2100')).toBeVisible()

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})
