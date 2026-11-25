import { expect, test } from "@playwright/test";

// Kannada interface and chatbot, against the real backend (database answers, no paid API).

test("Kannada interface, last-checked dates and a Kannada chatbot conversation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Change language to Kannada" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ನೀವು ಅರ್ಹರಾಗಬಹುದಾದ ಆರೋಗ್ಯ ಯೋಜನೆಗಳನ್ನು ಹುಡುಕಿ");
  await expect(page.locator("html")).toHaveAttribute("lang", "kn");

  // Reviewed scheme cards show when their sources were last checked.
  const card = page.getByRole("article", { name: /Ni-kshay Poshan Yojana/ });
  await expect(card).toContainText("ಮೂಲಗಳನ್ನು ಕೊನೆಯದಾಗಿ ಪರಿಶೀಲಿಸಿದ್ದು");
  await page.screenshot({ path: "test-results/14-kannada-home.png" });

  await page.getByRole("button", { name: /SchemeSathi ಯನ್ನು ಕೇಳಿ/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ನಿಮ್ಮ ಪ್ರಶ್ನೆ").fill("ಕ್ಷಯರೋಗಿಗಳಿಗೆ ಯಾವ ನೆರವು ಇದೆ?");
  await dialog.getByRole("button", { name: "ಕಳುಹಿಸಿ" }).click();
  const first = dialog.getByRole("list", { name: "ಸೂಚಿಸಿದ ಯೋಜನೆಗಳು" }).getByRole("listitem").first();
  await expect(first).toContainText("Ni-kshay Poshan Yojana");
  await expect(first).toContainText("ಪ್ರಯೋಜನಗಳು");
  await dialog.getByRole("button", { name: "ಯಾವ ದಾಖಲೆಗಳು ಬೇಕು?" }).click();
  await expect(dialog.getByText(/ನನ್ನ ಹಿಂದಿನ ಉತ್ತರದಲ್ಲಿನ ಯೋಜನೆಗಳ ಬಗ್ಗೆ/)).toBeVisible();
  await page.screenshot({ path: "test-results/15-kannada-chat.png" });

  // Switching back to English keeps working, and nothing is stored in the browser.
  await dialog.getByRole("button", { name: "ಸಹಾಯಕವನ್ನು ಮುಚ್ಚಿ" }).click();
  await page.getByRole("button", { name: /ಇಂಗ್ಲಿಷ್‌ಗೆ ಬದಲಿಸಿ/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find Health Schemes You May Be Eligible For");
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test("All Schemes shows how old the unverified data is", async ({ page }) => {
  await page.goto("/catalogue");
  await expect(page.getByText("Data as of January 2025.")).toBeVisible();
  await expect(page.getByText("Listed around January 2025 · not checked").first()).toBeVisible();
});
