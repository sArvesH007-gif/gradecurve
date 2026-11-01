import { expect, test } from "@playwright/test";

test("Oracle faculty UI creates and safely deletes students and courses, and writes assessments, marks, and attendance", async ({
  page,
}) => {
  test.skip(
    !process.env.ORACLE_USER ||
      !process.env.ORACLE_PASSWORD ||
      !process.env.ORACLE_CONNECT_STRING ||
      !process.env.DEMO_PASSWORD,
    "Local Oracle environment is not configured.",
  );

  await page.goto("/login?role=teacher");
  await page.getByLabel("Email address").fill("dr.sharma@gradecurve.demo");
  await page.getByLabel("Password").fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto("/teacher/oracle");
  await expect(
    page.getByRole("heading", { name: "Oracle faculty workspace" }),
  ).toBeVisible();
  await expect(page.getByText("CSE1004", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("24BCE0001", { exact: true }).first()).toBeVisible();

  const code = `E2E${Date.now().toString().slice(-7)}`;
  await page.getByLabel("Course code").fill(code);
  await page.getByLabel("Course name").fill("Oracle UI CRUD fixture");
  await page.getByLabel("Faculty slot").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Insert course" }).click();
  await expect(page.getByRole("status")).toContainText("Oracle course created.");

  const assessmentForm = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Insert an assessment" }) });
  await assessmentForm.locator('select[name="courseId"]').selectOption({
    label: `${code} · Oracle UI CRUD fixture`,
  });
  await assessmentForm.locator('input[name="name"]').fill("LAB1");
  await assessmentForm.locator('input[name="maxScore"]').fill("10");
  await assessmentForm.locator('input[name="weight"]').fill("0.1");
  await assessmentForm.getByRole("button", { name: "Insert assessment" }).click();
  await expect(page.getByRole("status")).toContainText("Oracle assessment created.");

  const markForm = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Insert or update a mark" }) });
  await markForm.locator('select[name="studentId"]').selectOption({ index: 1 });
  await markForm.locator('select[name="assessmentId"]').selectOption({
    label: "CSE1004 · CAT1 (max 50)",
  });
  await markForm.locator('input[name="score"]').fill("37.2");
  await markForm.getByRole("button", { name: "Save mark" }).click();
  await expect(page.getByRole("status")).toContainText("Oracle mark saved.");
  await expect(
    page.getByRole("row").filter({ hasText: "24BCE0001" }).filter({ hasText: "CAT1" }),
  ).toContainText("37.2");

  const attendanceForm = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Insert or update attendance" }) });
  await attendanceForm.locator('select[name="studentId"]').selectOption({ index: 1 });
  await attendanceForm.locator('select[name="courseId"]').selectOption({
    label: "CSE1004 · Network Essentials",
  });
  await attendanceForm.locator('input[name="attendanceDate"]').fill("2026-08-01");
  await attendanceForm.locator('select[name="present"]').selectOption("0");
  await attendanceForm.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByRole("status")).toContainText("Oracle attendance saved.");

  const courseRow = page.getByRole("row").filter({ hasText: code });
  page.once("dialog", (dialog) => dialog.accept());
  await courseRow.getByRole("button", { name: "Delete empty" }).click();
  await expect(page.getByRole("status")).toContainText("Unused Oracle course deleted.");
  await expect(page.getByRole("row").filter({ hasText: code })).toHaveCount(0);

  const registrationNo = `E2E${Date.now().toString().slice(-7)}`;
  const studentForm = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Insert a student" }) });
  await studentForm.getByLabel("Registration number").fill(registrationNo);
  await studentForm.getByLabel("Student name").fill("Oracle UI Student CRUD Fixture");
  await studentForm.getByLabel("Initial password").fill("e2e-initial-password-2026");
  await studentForm.locator('select[name="courseId"]').selectOption({ label: "CSE1004 · Network Essentials" });
  await studentForm.locator('select[name="slotId"]').selectOption({ index: 1 });
  await studentForm.getByRole("button", { name: "Insert student" }).click();
  await expect(page.getByRole("status")).toContainText("Oracle student created.");
  const studentRow = page.getByRole("row").filter({ hasText: registrationNo });
  await expect(studentRow).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await studentRow.getByRole("button", { name: "Delete empty" }).click();
  await expect(page.getByRole("status")).toContainText("Empty Oracle student record deleted.");
  await expect(page.getByRole("row").filter({ hasText: registrationNo })).toHaveCount(0);
});
