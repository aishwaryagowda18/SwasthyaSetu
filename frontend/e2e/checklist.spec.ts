import { expect, test } from "@playwright/test";

// Interactive document checklist (test plan C1-C4) against the real backend.

test("scheme checklist: official documents, ticking, nothing stored, no upload", async ({ page }) => {
  await page.goto("/schemes/nikshay-poshan-yojana");
  const list = page.getByRole("region", { name: "Documents needed" });
  // C1: exactly the official documents, each with its source.
  await expect(list.getByRole("checkbox")).toHaveCount(2);
  await expect(list.getByText(/page 1, 4\. Benefit/)).toBeVisible();
  await expect(list.getByRole("status")).toHaveText("0 of 2 documents ready");
  // C2: ticking updates progress and the still-needed list.
  await list.getByRole("checkbox", { name: /Bank account details/ }).check();
  await expect(list.getByRole("status")).toHaveText("1 of 2 documents ready");
  await expect(list.getByLabel("Checklist summary")).toContainText("parent's or guardian's bank account details");
  await page.screenshot({ path: "test-results/09-checklist.png", fullPage: true });
  // C3: no upload option.
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  // C4: nothing stored; a reload clears the ticks.
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Documents needed" }).getByRole("status")).toHaveText("0 of 2 documents ready");
});

test("combined checklist from results", async ({ page }) => {
  await page.goto("/questionnaire");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "See Results" }).click();
  await page.getByRole("button", { name: "Yes" }).click(); // TB: yes
  await page.getByRole("button", { name: /Build my document checklist/ }).click();
  await expect(page.getByRole("heading", { name: "My Document Checklist" })).toBeVisible();
  await expect(page.getByText(/Documents for:/)).toContainText("Ni-kshay Poshan Yojana");
  const list = page.getByRole("region", { name: "Documents to prepare" });
  await expect(list.getByText(/Needed for Ni-kshay Poshan Yojana/).first()).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.screenshot({ path: "test-results/10-combined-checklist.png", fullPage: true });
  // Chosen schemes live in app memory only: a reload forgets them.
  await page.reload();
  await expect(page.getByText("No schemes selected yet.")).toBeVisible();
});

test("questionnaire answers are kept in app memory only, not in the tab history", async ({ page }) => {
  await page.goto("/questionnaire");
  await page.getByPlaceholder("Enter your age").fill("45");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "See Results" }).click();
  await expect(page.getByRole("heading", { name: "Your Results" })).toBeVisible();
  const historyState = await page.evaluate(() => JSON.stringify(history.state));
  expect(historyState).not.toContain("profile");
  expect(historyState).not.toContain("45");
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  // A reload clears the answers and returns to the questionnaire.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tell us about yourself" })).toBeVisible();
});

test("printing shows only the checklist and disclaimer, in light colours", async ({ page }) => {
  await page.goto("/schemes/nikshay-poshan-yojana");
  await page.getByRole("region", { name: "Documents needed" }).getByRole("checkbox").first().check();
  await page.emulateMedia({ media: "print" });
  const list = page.getByRole("region", { name: "Documents needed" });
  await expect(list).toBeVisible();
  await expect(list.getByText("Ni-kshay Poshan Yojana (Nutritional Support to TB Patients)")).toBeVisible(); // print heading
  await expect(page.getByText(/This is not an official government service/).last()).toBeVisible();
  for (const name of ["Who can apply", "Benefits", "How to apply", "Official sources"]) {
    await expect(page.getByRole("heading", { name })).toBeHidden();
  }
  await expect(page.getByRole("button", { name: /Print checklist/ })).toBeHidden();
  const bg = await list.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(255, 255, 255)"); // light (white) background on paper
  await page.screenshot({ path: "test-results/11-print-checklist.png", fullPage: true });
});
