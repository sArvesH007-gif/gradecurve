import { expect, test } from "@playwright/test";

test.describe("Oracle-backed sign in", () => {
  test.skip(
    !process.env.DEMO_PASSWORD ||
      !process.env.ORACLE_USER ||
      !process.env.ORACLE_PASSWORD ||
      !process.env.ORACLE_CONNECT_STRING,
    "Local Oracle demo credentials are not configured.",
  );

  test("student account signs in, loads Oracle academic data and signs out", async ({ page }) => {
    await page.goto("/login?role=student");
    await page.getByLabel("Registration number").fill("24BCE0001");
    await page.getByLabel("Password").fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole("heading", { name: "Graph study-partner suggestions" })).toBeVisible();
    await expect(page.getByText("Synthetic demo", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("faculty account signs in and loads Oracle roster and review data", async ({ page }) => {
    await page.goto("/login?role=teacher");
    await page.getByLabel("Email address").fill("dr.sharma@gradecurve.demo");
    await page.getByLabel("Password").fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole("heading", { name: "Batch mark entry" })).toBeVisible();
    await expect(page.getByRole("row", { name: /24BCE\d{4} Demo Student/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
