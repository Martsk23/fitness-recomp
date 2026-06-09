import { test, expect } from '@playwright/test'

// Ces tests montent le VRAI React dans un VRAI IndexedDB sur l'app buildée.
// migration.test.mjs tourne en node (fake-indexeddb) sans monter de composant
// → il n'avait pas pu voir le bug settings.get(1) (écran Jour blanc). Ce smoke
// couvre cette classe de bug + le flux onboarding et la persistance.

// Profil M 30/180/80, modéré, recomp → objectif calorique attendu = 2483 kcal
// (valeur vérifiée dans tests/metabolic.test.mjs).
async function completeOnboarding(page) {
  await expect(page.getByText('configure ton profil')).toBeVisible()
  await page.getByLabel('Âge').fill('30')
  await page.getByLabel('Taille en centimètres').fill('180')
  await page.getByLabel('Poids en kilogrammes').fill('80')
  await page.getByLabel("Niveau d'activité").selectOption('moderate')
  await page.getByLabel('Objectif').selectOption('recomp')
  await page.getByRole('button', { name: 'Commencer' }).click()
}

test('onboarding au 1er lancement → Jour avec cibles CALCULÉES → profil persisté après reload', async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await completeOnboarding(page)

  // Jour se monte (non null) avec les cibles calculées par le moteur (pas seedées).
  await expect(page.getByText("Restant aujourd'hui")).toBeVisible()
  await expect(page.getByText('objectif 2483')).toBeVisible()

  // Persistance profil : reload → pas de ré-onboarding, Jour direct, mêmes cibles.
  await page.reload()
  await expect(page.getByText("Restant aujourd'hui")).toBeVisible()
  await expect(page.getByText('objectif 2483')).toBeVisible()

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})

test('une pesée saisie est persistée et relue après reload', async ({ page }) => {
  await page.goto('/')
  await completeOnboarding(page)

  // Onglet Poids → saisie (virgule décimale, comme au clavier FR) → enregistrer.
  await page.getByRole('button', { name: 'Poids' }).click()
  await page.getByLabel('Poids en kilogrammes').fill('77,7')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('77,7 kg').first()).toBeVisible()

  // Persistance réelle : reload complet (IndexedDB), retour sur l'onglet Poids.
  await page.reload()
  await page.getByRole('button', { name: 'Poids' }).click()
  await expect(page.getByText('77,7 kg').first()).toBeVisible()

  // Et le dashboard Jour reflète la pesée du jour.
  await page.getByRole('button', { name: 'Jour' }).click()
  await expect(page.getByText('Pesée enregistrée')).toBeVisible()
})
