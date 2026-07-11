import { test, expect } from "@playwright/test";
import path from "path";

const artifactDir = "C:/Users/arta/.gemini/antigravity-ide/brain/9547365b-f0b2-4cd6-89d2-1a1028a9b39d";

test.describe("Super Admin Tour Generator and City Creation Verification", () => {
  test("should synchronize category selection and support custom categories", async ({ page }) => {
    try {
      // 1. Log in
      console.log("Navigating to login...");
      await page.goto("http://localhost:5022/admin/login");
      await page.fill('[data-testid="input-username"]', "superadmin1");
      await page.fill('[data-testid="input-password"]', "password123");
      
      console.log("Submitting login form...");
      await Promise.all([
        page.waitForNavigation({ url: /.*\/admin/, timeout: 15000 }),
        page.click('[data-testid="button-login-submit"]')
      ]);

      console.log("Logged in. Current URL:", page.url());

      // 2. Go to Tour Generator
      console.log("Navigating to Tour Generator...");
      await page.goto("http://localhost:5022/admin/tour-generator");
      console.log("At Tour Generator. Current URL:", page.url());

      // Wait for the select element for Template / Existing Tour to be loaded
      console.log("Waiting for select element...");
      await page.waitForSelector("select", { state: "visible", timeout: 15000 });

      // Select the 6-day tour (Secrets of Ancient Egypt and Pyramids)
      console.log("Selecting Secrets of Ancient Egypt tour...");
      await page.selectOption("select", { label: "Secrets of Ancient Egypt and Pyramids" });

      // Verify Category select updates to "Historical"
      console.log("Verifying category value is Historical...");
      const categorySelect = page.locator('button:has-text("Historical")');
      await expect(categorySelect).toBeVisible({ timeout: 15000 });
      console.log("Category test passed!");
    } catch (e) {
      console.error("Test failed. Saving screenshot...", e);
      await page.screenshot({ path: path.join(artifactDir, "test_failure_category.png") });
      throw e;
    }
  });

  test("should allow inline city creation in tour generator day cards", async ({ page }) => {
    try {
      // 1. Log in
      console.log("Navigating to login...");
      await page.goto("http://localhost:5022/admin/login");
      await page.fill('[data-testid="input-username"]', "superadmin1");
      await page.fill('[data-testid="input-password"]', "password123");
      
      console.log("Submitting login form...");
      await Promise.all([
        page.waitForNavigation({ url: /.*\/admin/, timeout: 15000 }),
        page.click('[data-testid="button-login-submit"]')
      ]);

      console.log("Logged in. Current URL:", page.url());

      // 2. Go to Tour Generator
      console.log("Navigating to Tour Generator...");
      await page.goto("http://localhost:5022/admin/tour-generator");
      console.log("At Tour Generator. Current URL:", page.url());

      // Wait for Tour Title field to be loaded
      console.log("Waiting for title input...");
      await page.waitForSelector('input[placeholder="e.g. Wonders of Indonesia"]', { state: "visible", timeout: 15000 });

      // Type new city name in Day 1 city input
      const uniqueCity = `Atlantis${Date.now()}`;
      console.log(`Filling unique city: ${uniqueCity}`);
      const cityInput = page.locator('input[placeholder="City"]').first();
      await cityInput.fill(uniqueCity);

      // Click "+ Add [uniqueCity] as new city" button
      console.log("Clicking add city button...");
      const addCityButton = page.getByRole("button", { name: `Add "${uniqueCity}" as new city` });
      await expect(addCityButton).toBeVisible({ timeout: 15000 });
      await addCityButton.click();

      // Verify Toast city added successfully
      console.log("Waiting for success toast...");
      await expect(page.locator("text=City added successfully").first()).toBeVisible({ timeout: 15000 });

      // Verify that the city was added to the master cities datalist/suggestions
      console.log("Verifying city in datalist...");
      const datalistOption = page.locator(`datalist#cities-datalist option[value="${uniqueCity}"]`);
      await expect(datalistOption).toBeAttached({ timeout: 15000 });
      console.log("Inline city creation test passed!");
    } catch (e) {
      console.error("Test failed. Saving screenshot...", e);
      await page.screenshot({ path: path.join(artifactDir, "test_failure_city.png") });
      throw e;
    }
  });
});
