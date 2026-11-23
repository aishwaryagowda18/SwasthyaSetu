import { expect, test, type Page } from "@playwright/test";

// Admin journey on a throwaway copy of the data (see e2e/prepare_backend.py).
const PASSWORD = "e2e-test-password-123";

async function signIn(page: Page, username: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Scheme review" })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
}

test("editor submits, independent reviewer publishes, citizens then see the scheme", async ({ page }) => {
  // Before: AB-PMJAY is a draft and not public.
  await page.goto("/schemes/ab-pmjay");
  await expect(page.getByRole("alert")).toContainText(/not available/i);

  // Wrong password is rejected.
  await page.goto("/admin/login");
  await page.getByLabel("Username").fill("e2e_editor");
  await page.getByLabel("Password").fill("wrong-password-000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Wrong username or password");

  // Editor submits the draft for review; they cannot publish.
  await signIn(page, "e2e_editor");
  await page.getByRole("link", { name: /Ayushman Bharat Pradhan Mantri Jan Arogya Yojana/ }).click();
  await expect(page.getByText("“With this approval, all senior citizens", { exact: false })).toBeVisible(); // evidence quote
  await page.getByLabel("Comment").fill("Ready for review");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("status")).toContainText("Submitted for review.");
  await expect(page.getByRole("button", { name: "Verify and publish" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/06-admin-submitted.png", fullPage: true });
  await signOut(page);

  // Still not public while in review.
  await page.goto("/schemes/ab-pmjay");
  await expect(page.getByRole("alert")).toContainText(/not available/i);

  // Independent reviewer publishes after acknowledging open exceptions.
  await signIn(page, "e2e_reviewer");
  await page.getByRole("link", { name: /Ayushman Bharat Pradhan Mantri Jan Arogya Yojana/ }).click();
  const ack = page.getByRole("checkbox", { name: /open exception/ });
  await page.getByRole("button", { name: "Verify and publish" }).click();
  await expect(page.getByRole("alert")).toContainText("Cannot publish yet."); // exceptions not yet acknowledged
  await ack.check();
  await page.getByLabel("Comment").fill("Checked against PIB releases");
  await page.getByRole("button", { name: "Verify and publish" }).click();
  await expect(page.getByRole("status")).toContainText("Published");
  await page.screenshot({ path: "test-results/07-admin-published.png", fullPage: true });
  await signOut(page);

  // Citizens now see it, with the verified official apply link.
  await page.goto("/schemes/ab-pmjay");
  await expect(page.getByRole("heading", { name: /Ayushman Bharat Pradhan Mantri Jan Arogya Yojana/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Apply on Official Website/ })).toHaveAttribute("href", "https://beneficiary.nha.gov.in/");
  await page.screenshot({ path: "test-results/08-public-pmjay.png", fullPage: true });

  // The admin session was never stored in the browser.
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test("admin pages require sign-in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
});
