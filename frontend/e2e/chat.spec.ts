import { expect, test } from "@playwright/test";

// Chatbot (database answers: the e2e backend runs with SCHEMESAATHI_DISABLE_AI=1, so no paid API calls)
// and the unverified "All Schemes" catalogue.

test("assistant suggests relevant central and Karnataka schemes with benefits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Ask SchemeSathi/ }).click();
  const dialog = page.getByRole("dialog", { name: "SchemeSathi assistant" });
  await dialog.getByLabel("Your question").fill("I am pregnant and live in Karnataka, which schemes can help me?");
  await dialog.getByRole("button", { name: "Send" }).click();
  const list = dialog.getByRole("list", { name: "Suggested schemes" });
  await expect(list).toBeVisible();
  await expect(list.getByText(/Matru Vandana|Maternity/).first()).toBeVisible();
  await expect(list.getByText("Unverified").first()).toBeVisible();
  await expect(list.getByText("Who can apply").first()).toBeVisible();
  await expect(list).not.toContainText("Skill Upgradation"); // place words alone don't count as a match
  await page.screenshot({ path: "test-results/12-chat.png" });
  // Follow-up: documents for the schemes just shown, straight from the database.
  await dialog.getByRole("button", { name: "What documents are needed?" }).click();
  await expect(dialog.getByText(/About the schemes from my previous reply/)).toBeVisible();
  await expect(dialog.getByRole("list", { name: "Suggested schemes" }).last().getByText("Documents needed").first()).toBeVisible();
  await page.screenshot({ path: "test-results/12b-chat-documents.png" });
  // Opening a suggestion goes to its unverified catalogue page, with the warning.
  await list.getByRole("link").first().click();
  await expect(page.getByRole("note", { name: "Unverified information" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test("assistant shows the verified scheme first for a TB question", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Ask SchemeSathi/ }).click();
  const dialog = page.getByRole("dialog", { name: "SchemeSathi assistant" });
  await dialog.getByLabel("Your question").fill("What support is there for TB patients? my number is 9876543210");
  await dialog.getByRole("button", { name: "Send" }).click();
  const first = dialog.getByRole("list", { name: "Suggested schemes" }).getByRole("listitem").first();
  await expect(first).toContainText("Verified");
  await expect(first).toContainText("Ni-kshay Poshan Yojana");
  await expect(dialog.getByText(/removed a number or email/)).toBeVisible();
});

test("All Schemes lists only central and Karnataka schemes, marked unverified", async ({ page }) => {
  await page.goto("/catalogue");
  await expect(page.getByRole("note", { name: "Unverified information" })).toBeVisible();
  await expect(page.getByText(/central and Karnataka schemes/)).toBeVisible();
  await page.getByRole("tab", { name: "Karnataka" }).click();
  await expect(page.getByRole("status")).toContainText("39 schemes found");
  const badges = page.locator("li .badge").filter({ hasText: /^(Karnataka|Central|central|state)$/ });
  expect(await badges.count()).toBeGreaterThan(0);
  await page.getByPlaceholder(/Search central and Karnataka schemes/).fill("maternity");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/13-all-schemes.png", fullPage: true });
});
