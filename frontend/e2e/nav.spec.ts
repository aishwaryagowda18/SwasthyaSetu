import { expect, test } from "@playwright/test";

// Menu links to sections of the Home page must scroll there, from any page.
const main = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main" });

test("How it Works and Reviewed Schemes scroll to their sections", async ({ page }) => {
  await page.goto("/");
  await main(page).getByRole("link", { name: "Reviewed Schemes" }).click();
  await expect(page.locator("#schemes")).toBeInViewport();
  await main(page).getByRole("link", { name: "How it Works" }).click();
  await expect(page.locator("#how-it-works")).toBeInViewport();

  // From another page: opens Home and scrolls to the section.
  await page.goto("/catalogue");
  await main(page).getByRole("link", { name: "Reviewed Schemes" }).click();
  await expect(page).toHaveURL(/\/#schemes$/);
  await expect(page.locator("#schemes")).toBeInViewport();

  // Clicking the same link again after scrolling away still scrolls back.
  await page.evaluate(() => window.scrollTo(0, 0));
  await main(page).getByRole("link", { name: "Reviewed Schemes" }).click();
  await expect(page.locator("#schemes")).toBeInViewport();
});
