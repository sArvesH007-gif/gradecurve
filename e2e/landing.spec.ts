import { expect, test } from "@playwright/test";
import { createSessionToken } from "../lib/auth/session-token";

if (!process.env.AUTH_SECRET)
  throw new Error("Playwright must set a temporary AUTH_SECRET for e2e tests.");

test("landing page introduces relative grading and student/faculty workspaces", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /know where you stand/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /student login/i }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /teacher login/i }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      /official grades remain determined by institutional policy/i,
    ),
  ).toBeVisible();
});

test("student and faculty sign-in pages show the correct identifier", async ({
  page,
}) => {
  await page.goto("/login?role=student");
  await expect(
    page.getByRole("heading", { name: "Student sign in" }),
  ).toBeVisible();
  await expect(page.getByLabel("Registration number")).toBeVisible();
  await page.goto("/login?role=teacher");
  await expect(
    page.getByRole("heading", { name: "Faculty sign in" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("anonymous and tampered sessions cannot enter protected routes", async ({
  page,
}) => {
  await page.goto("/student");
  await expect(page).toHaveURL(/\/login\?role=student/);
  await page.context().addCookies([
    {
      name: "gc_session",
      value: "tampered.payload",
      url: "http://127.0.0.1:3000",
    },
  ]);
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/login\?role=teacher/);
});

test("signed student and faculty sessions stay separated by role", async ({
  page,
}) => {
  const studentToken = createSessionToken({
    id: "student-id",
    username: "24BCE0001",
    name: "Demo Student",
    role: "STUDENT",
  });
  await page
    .context()
    .addCookies([
      { name: "gc_session", value: studentToken, url: "http://127.0.0.1:3000" },
    ]);
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/login\?role=student&error=role/);

  const teacherToken = createSessionToken({
    id: "teacher-id",
    username: "teacher@gradecurve.demo",
    name: "Demo Teacher",
    role: "TEACHER",
  });
  await page.context().clearCookies();
  await page
    .context()
    .addCookies([
      { name: "gc_session", value: teacherToken, url: "http://127.0.0.1:3000" },
    ]);
  await page.goto("/student");
  await expect(page).toHaveURL(/\/login\?role=teacher&error=role/);
});

test("sign-out clears the session cookie", async ({ page }) => {
  const token = createSessionToken({
    id: "student-id",
    username: "24BCE0001",
    name: "Demo Student",
    role: "STUDENT",
  });
  await page
    .context()
    .addCookies([
      { name: "gc_session", value: token, url: "http://127.0.0.1:3000" },
    ]);
  await page.goto("/");
  const response = await page.request.post("/api/logout", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  await expect
    .poll(async () =>
      (await page.context().cookies()).some(
        ({ name }) => name === "gc_session",
      ),
    )
    .toBe(false);
});
