import { expect, test } from "@playwright/test";

// Complete user journey against the real backend and real (published) scheme data.

test("discover, check eligibility, answer follow-up, view details", async ({ page }) => {
  // 1. Discovery: only reviewed schemes are listed; drafts are not.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Find Health Schemes/ })).toBeVisible();
  await expect(page.getByText("Ni-kshay Poshan Yojana (Nutritional Support to TB Patients)")).toBeVisible();
  await expect(page.getByText(/Ayushman Bharat Pradhan Mantri Jan Arogya Yojana/)).toHaveCount(0);
  await expect(page.getByText(/not an official government service/i)).toBeVisible();
  await expect(page.getByText(/sponsored|ad space/i)).toHaveCount(0);
  await expect(page.getByText(/% match/i)).toHaveCount(0);
  // Nikshay has no official application URL in its sources, so none is shown.
  const npyCard = page.getByRole("article", { name: /Ni-kshay Poshan Yojana/ });
  await expect(npyCard.getByText("Link not available")).toBeVisible();
  // Filter tabs: Nikshay is central; no Karnataka scheme is published yet.
  await page.getByRole("tab", { name: "Karnataka State" }).click();
  await expect(page.getByText("No schemes found.")).toBeVisible();
  await page.getByRole("tab", { name: "Central" }).click();
  await expect(npyCard).toBeVisible();
  await page.getByRole("tab", { name: "All" }).click();
  await page.screenshot({ path: "test-results/01-home.png", fullPage: true });

  // 2. Questionnaire (4 steps, all optional).
  await page.getByRole("link", { name: "Check Your Eligibility" }).click();
  await page.getByPlaceholder("Enter your age").fill("45");
  await page.getByLabel("Gender").selectOption("male");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("State / UT").selectOption("Karnataka");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByPlaceholder("e.g. 150000").fill("120000");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Occupation").selectOption("daily_wage_worker");
  await page.screenshot({ path: "test-results/02-questionnaire.png", fullPage: true });
  await page.getByRole("button", { name: "See Results" }).click();

  // 3. Results: TB question appears only because a scheme needs it.
  await expect(page.getByRole("heading", { name: "Your Results" })).toBeVisible();
  await expect(page.getByText("Needs more information")).toBeVisible();
  await expect(page.getByText(/diagnosed you with tuberculosis/i)).toBeVisible();
  await expect(page.getByText(/never stored/i)).toBeVisible();
  await page.screenshot({ path: "test-results/03-results-followup.png", fullPage: true });

  // 4. Answer the follow-up: result now lists the official checks to complete.
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByText(/registered on the NIKSHAY portal/)).toBeVisible();
  await expect(page.getByText(/diagnosed you with tuberculosis/i)).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Central" })).toBeVisible();
  await page.getByRole("tab", { name: "Karnataka State" }).click();
  await expect(page.getByText(/no reviewed schemes in this category/i)).toBeVisible();
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByRole("article", { name: /Ni-kshay/ }).getByText("Link not available")).toBeVisible();
  await page.screenshot({ path: "test-results/04-results-answered.png", fullPage: true });

  // 5. Scheme details with official sources.
  await page.getByRole("link", { name: /Benefits, documents and how to apply/ }).click();
  await expect(page.getByRole("heading", { name: /Ni-kshay Poshan Yojana/ })).toBeVisible();
  await expect(page.getByText(/Rs 1,000 per month/)).toBeVisible();
  await expect(page.getByText(/Rs 500 per month/)).toBeVisible();
  await expect(page.getByText(/awaiting official confirmation/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Nutritional Support to TB patients/ })).toHaveAttribute("href", /tbcindia\.mohfw\.gov\.in/);
  await page.screenshot({ path: "test-results/05-details.png", fullPage: true });

  // 6. Privacy: nothing about the user is kept in browser storage.
  const stored = await page.evaluate(() => localStorage.length + sessionStorage.length);
  expect(stored).toBe(0);
});

test("a draft scheme is not available", async ({ page }) => {
  await page.goto("/schemes/ab-pmjay");
  await expect(page.getByRole("alert")).toContainText(/not available/i);
});

test("tb answer 'No' shows not eligible with the reason", async ({ page }) => {
  await page.goto("/questionnaire");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "See Results" }).click();
  await page.getByRole("button", { name: "No" }).click();
  await expect(page.getByText("Not eligible")).toBeVisible();
  await expect(page.getByText(/Person with TB/)).toBeVisible();
});
