import { execSync } from "child_process";
import { expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

export function supabaseStatus(): Record<string, string> {
  return JSON.parse(execSync("supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
}

export async function makePdf(lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  lines.forEach((line, index) => page.drawText(line, { x: 40, y: 790 - index * 18, size: 11, font }));
  return Buffer.from(await pdf.save());
}

export const PASSWORD = "Str0ng-test-pass!";

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
}

export async function signUp(page: Page, email: string, role: "Candidate" | "Recruiter") {
  await page.goto("/signup");
  await page.getByRole("radio", { name: new RegExp(role) }).check();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(role === "Recruiter" ? /\/hr$/ : /\/dashboard$/);
}

export async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** No page in the design system should ever scroll sideways. */
export async function expectNoHorizontalOverflow(page: Page) {
  const report = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = Array.from(document.querySelectorAll("body *"))
      .filter((node) => {
        // Content inside a scrolling container, such as a wide table, is meant to overflow it.
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          const { overflowX } = getComputedStyle(parent);
          if (overflowX === "auto" || overflowX === "scroll") return false;
        }
        return node.getBoundingClientRect().right > width + 1;
      })
      .slice(0, 6)
      .map((node) => `${node.tagName.toLowerCase()}.${String(node.getAttribute("class") || "").slice(0, 40)}`);
    return { overflow: document.documentElement.scrollWidth - width, offenders };
  });
  expect(report.overflow, `Elements past the right edge: ${report.offenders.join(", ")}`).toBeLessThanOrEqual(1);
}
