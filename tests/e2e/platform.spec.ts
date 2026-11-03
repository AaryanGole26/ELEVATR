import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, makePdf, PASSWORD, signIn, signUp, supabaseStatus, uniqueEmail } from "./helpers";

const JD = "We are hiring a backend engineer with Python, SQL, Docker and AWS experience to build REST services.";
const STRONG_RESUME = ["Asha Rao", "asha@example.test", "Backend engineer: Python, SQL, Docker, AWS, REST services at Acme."];
const WEAK_RESUME = ["Sam Lee", "Pastry chef with ten years of experience in French baking and menu planning."];
const WRITTEN_RESUME = ["Noor Ali", "Engineer skilled in Python, SQL, Docker, AWS and REST APIs."];
const BOGUS_UUID = "00000000-0000-4000-8000-000000000000";

const screenshotsDir = "test-results/screens";

type Shared = {
  hrEmail: string;
  candidateEmail: string;
  weakEmail: string;
  writtenEmail: string;
  pipelineId: string;
  interviewLink: string;
  interviewId: string;
  token: string;
  writtenLink: string;
};
const shared = {} as Shared;

test.describe.configure({ mode: "serial" });

async function openAs(browser: Browser, email: string, next?: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ permissions: ["camera", "microphone"] });
  const page = await context.newPage();
  await signIn(page, email, next);
  return { context, page };
}

test("anonymous callers are refused by every protected route", async ({ request }) => {
  const refused: Array<[string, string]> = [
    ["GET", "/api/applications"],
    ["POST", "/api/applications"],
    ["GET", "/api/opportunities"],
    ["GET", `/api/opportunities/${BOGUS_UUID}`],
    ["GET", "/api/pipelines"],
    ["POST", "/api/pipelines"],
    ["GET", `/api/pipelines/${BOGUS_UUID}`],
    ["POST", `/api/pipelines/${BOGUS_UUID}/notify`],
    ["POST", `/api/pipelines/${BOGUS_UUID}/finalize`],
    ["POST", `/api/pipelines/${BOGUS_UUID}/batch`],
    ["GET", "/api/stats"],
    ["GET", `/api/applications/${BOGUS_UUID}`],
    ["GET", "/api/applications/review"],
    ["POST", "/api/applications/finalize"],
    ["GET", `/api/resumes/${BOGUS_UUID}`],
    ["DELETE", `/api/resumes/${BOGUS_UUID}`],
    ["POST", "/api/interviews"],
    ["GET", `/api/interviews/${BOGUS_UUID}/details`],
    ["GET", `/api/interviews/${BOGUS_UUID}/report`],
    ["POST", `/api/interviews/${BOGUS_UUID}/reprocess`],
    ["POST", "/api/screening"],
    ["POST", "/api/upload/resume"],
    ["POST", "/api/parse/resume"],
    ["POST", "/api/chat"]
  ];
  for (const [method, url] of refused) {
    const response = await request.fetch(url, { method, data: method === "GET" || method === "DELETE" ? undefined : {} });
    expect([401, 403], `${method} ${url} returned ${response.status()}`).toContain(response.status());
  }
});

test("the removed debug route is gone and security headers are set", async ({ request }) => {
  expect((await request.get(`/api/interviews/${BOGUS_UUID}/debug`)).status()).toBe(404);
  const headers = (await request.get("/")).headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("browser bundles contain no server secrets", async ({ page }) => {
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (response.url().includes("/_next/static/") && response.url().endsWith(".js")) {
      bodies.push(await response.text().catch(() => ""));
    }
  });
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  expect(bodies.length).toBeGreaterThan(0);
  const all = bodies.join("\n");
  expect(all).not.toContain(supabaseStatus().SERVICE_ROLE_KEY);
  expect(all).not.toContain("api.groq.com");
  expect(all).not.toContain("elevatr_local_auth");
});

test("login never redirects to another site", async ({ page }) => {
  const email = uniqueEmail("redirect");
  await signUp(page, email, "Candidate");
  await page.context().clearCookies();
  await page.goto("/login?next=" + encodeURIComponent("//evil.example/steal"));
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/localhost:3000\/dashboard/);
});

test("HR creates a pipeline in the UI", async ({ page }) => {
  shared.hrEmail = uniqueEmail("hr");
  await signUp(page, shared.hrEmail, "Recruiter");

  await page.getByRole("button", { name: "New pipeline" }).click();
  await page.getByLabel("Job title").fill("Backend Engineer");
  await page.getByLabel("Job description").fill(JD);
  await page.getByLabel("Tags (comma-separated)").fill("python, backend");
  await page.getByLabel("Minimum match score").fill("50");
  await page.getByRole("dialog").getByRole("button", { name: "Create pipeline" }).click();

  const card = page.getByRole("link", { name: /Backend Engineer/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/hr\/pipeline\//);
  shared.pipelineId = page.url().split("/").pop() as string;
  await expect(page.getByRole("heading", { name: "Backend Engineer" })).toBeVisible();
  await page.screenshot({ path: `${screenshotsDir}/hr-pipeline-empty.png`, fullPage: true });
});

test("a strong candidate sees the role and applies with a PDF", async ({ page }) => {
  shared.candidateEmail = uniqueEmail("strong");
  await signUp(page, shared.candidateEmail, "Candidate");

  const role = page.locator("article", { hasText: "Backend Engineer" });
  await expect(role.getByRole("link", { name: "Apply" })).toBeVisible();
  await role.getByRole("link", { name: "Apply" }).click();

  await expect(page.getByRole("heading", { name: "Backend Engineer" })).toBeVisible();
  await page.screenshot({ path: `${screenshotsDir}/apply.png`, fullPage: true });
  await page.getByLabel("Upload your resume as a PDF").setInputFiles({
    name: "asha.pdf",
    mimeType: "application/pdf",
    buffer: await makePdf(STRONG_RESUME)
  });
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: "Application submitted" })).toBeVisible();

  await page.getByRole("button", { name: "Go to dashboard" }).click();
  const application = page.locator("article", { hasText: "Backend Engineer" }).first();
  await expect(application.getByText("shortlisted")).toBeVisible();
  await expect(application).toContainText("Match score 100/100");
});

test("applications are validated and a second application is refused", async ({ browser }) => {
  const { context, page } = await openAs(browser, shared.candidateEmail);
  const duplicate = await page.request.post("/api/applications", { multipart: { pipeline_id: shared.pipelineId, resume: { name: "a.pdf", mimeType: "application/pdf", buffer: await makePdf(STRONG_RESUME) } } });
  expect(duplicate.status()).toBe(409);
  await context.close();

  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await signUp(freshPage, uniqueEmail("badfile"), "Candidate");
  const notPdf = await freshPage.request.post("/api/applications", { multipart: { pipeline_id: shared.pipelineId, resume: { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not a pdf at all") } } });
  expect(notPdf.status()).toBe(400);
  await fresh.close();
});

test("a weak candidate is screened, and a non-technical role can still match", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  shared.weakEmail = uniqueEmail("weak");
  await signUp(page, shared.weakEmail, "Candidate");
  const response = await page.request.post("/api/applications", { multipart: { pipeline_id: shared.pipelineId, resume: { name: "sam.pdf", mimeType: "application/pdf", buffer: await makePdf(WEAK_RESUME) } } });
  expect(response.status()).toBe(201);
  expect((await response.json()).data.status).toBe("screened");
  await context.close();

  const hr = await openAs(browser, shared.hrEmail);
  const created = await hr.page.request.post("/api/pipelines", {
    data: { job_title: "Pastry Chef", jd_text: "Seeking a pastry chef skilled in French baking, menu planning and kitchen management.", tags: [], threshold: 40 }
  });
  expect(created.status()).toBe(201);
  const chefPipeline = (await created.json()).data.pipeline;
  await hr.context.close();

  const candidate = await openAs(browser, shared.weakEmail);
  const applied = await candidate.page.request.post("/api/applications", { multipart: { pipeline_id: chefPipeline.id, resume: { name: "sam.pdf", mimeType: "application/pdf", buffer: await makePdf(WEAK_RESUME) } } });
  const body = await applied.json();
  expect(applied.status()).toBe(201);
  expect(body.data.status, "a relevant non-technical resume should not score 0").toBe("shortlisted");
  await candidate.context.close();

  const hrAgain = await openAs(browser, shared.hrEmail);
  const closed = await hrAgain.page.request.patch(`/api/pipelines/${chefPipeline.id}`, {
    data: { job_title: "Pastry Chef", jd_text: "Seeking a pastry chef skilled in French baking, menu planning and kitchen management.", tags: [], threshold: 40, is_active: false }
  });
  expect(closed.status()).toBe(200);
  expect((await closed.json()).data.pipeline.is_active).toBe(false);
  await hrAgain.context.close();
});

test("a closed position refuses new applicants and leaves the list", async ({ browser }) => {
  const hr = await openAs(browser, shared.hrEmail);
  const list = (await (await hr.page.request.get("/api/pipelines")).json()).data.pipelines;
  const chef = list.find((pipeline: { title: string }) => pipeline.title === "Pastry Chef");
  expect(chef.is_active).toBe(false);
  await hr.context.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  await signUp(page, uniqueEmail("late"), "Candidate");
  const opportunities = (await (await page.request.get("/api/opportunities")).json()).data.opportunities;
  expect(opportunities.map((o: { id: string }) => o.id)).not.toContain(chef.id);
  const refused = await page.request.post("/api/applications", { multipart: { pipeline_id: chef.id, resume: { name: "a.pdf", mimeType: "application/pdf", buffer: await makePdf(WEAK_RESUME) } } });
  expect(refused.status()).toBe(403);
  await context.close();
});

test("HR batch-uploads a resume and notifies candidates", async ({ browser }) => {
  const writtenContext = await browser.newContext();
  const writtenPage = await writtenContext.newPage();
  shared.writtenEmail = uniqueEmail("written");
  await signUp(writtenPage, shared.writtenEmail, "Candidate");
  const applied = await writtenPage.request.post("/api/applications", { multipart: { pipeline_id: shared.pipelineId, resume: { name: "noor.pdf", mimeType: "application/pdf", buffer: await makePdf(WRITTEN_RESUME) } } });
  expect(applied.status()).toBe(201);
  await writtenContext.close();

  const { context, page } = await openAs(browser, shared.hrEmail, `/hr/pipeline/${shared.pipelineId}`);
  await expect(page.getByRole("heading", { name: "Candidates", exact: true, level: 2 })).toBeVisible();

  const batchEmail = uniqueEmail("batch");
  await page.getByLabel("Upload PDF resumes").setInputFiles({
    name: "batch.pdf",
    mimeType: "application/pdf",
    buffer: await makePdf(["Batch Person", batchEmail, "Python SQL Docker AWS REST engineer."])
  });
  await page.getByRole("button", { name: "Upload and screen" }).click();
  await expect(page.getByText(/Processed 1 of 1/)).toBeVisible();
  await expect(page.getByRole("cell", { name: batchEmail })).toBeVisible();

  await page.getByRole("button", { name: "Notify candidates" }).click();
  await expect(page.getByText(/Email isn.t configured/)).toBeVisible();
  const links = await page.getByTestId("unsent-links").innerText();
  const lines = links.split("\n").map((line) => line.trim()).filter(Boolean);
  shared.interviewLink = lines[lines.indexOf(shared.candidateEmail) + 1];
  shared.writtenLink = lines[lines.indexOf(shared.writtenEmail) + 1];
  expect(shared.interviewLink).toContain("/video-interview/");
  expect(shared.writtenLink).toContain("/video-interview/");

  const url = new URL(shared.interviewLink);
  shared.interviewId = url.pathname.split("/").pop() as string;
  shared.token = url.searchParams.get("token") as string;
  expect(shared.token).toMatch(/^[0-9a-f]{64}$/);

  const data = (await (await page.request.get(`/api/pipelines/${shared.pipelineId}`)).json()).data;
  const byEmail = (email: string) => data.applications.find((app: { email: string }) => app.email === email);
  expect(byEmail(shared.candidateEmail).status).toBe("interview");
  expect(byEmail(shared.weakEmail).status).toBe("rejected");
  // The batch candidate now has an account linked by email, created without an emailed password.
  expect(byEmail(batchEmail).candidate_id).toBeTruthy();
  expect(byEmail(batchEmail).status).toBe("interview");

  await page.screenshot({ path: `${screenshotsDir}/hr-pipeline.png`, fullPage: true });
  await context.close();
});

test("interview endpoints reject missing, wrong and forged credentials", async ({ request }) => {
  const id = shared.interviewId;
  expect((await request.get(`/api/interviews/${id}/public`)).status()).toBe(404);
  expect((await request.get(`/api/interviews/${id}/public?token=wrong`)).status()).toBe(404);

  const good = await request.get(`/api/interviews/${id}/public?token=${shared.token}`);
  expect(good.status()).toBe(200);
  const raw = await good.text();
  const body = JSON.parse(raw);
  expect(body.data.state).toBe("ready");
  // Only display fields: no token, resume, email or job description.
  expect(raw).not.toContain(shared.token);
  expect(raw).not.toContain(shared.candidateEmail);
  expect(raw).not.toContain("Acme");

  for (const data of [
    { transcript: "A forged transcript that is long enough." },
    { callback_token: "wrong", transcript: "A forged transcript that is long enough." }
  ]) {
    const forged = await request.post(`/api/interviews/${id}/result`, { data });
    expect([400, 404]).toContain(forged.status());
  }
  expect((await request.post(`/api/interviews/${id}/launch`, { data: { token: "wrong" } })).status()).toBe(404);

  const direct = await request.post("http://127.0.0.1:5001/handoff-context", {
    data: { job_desc: "x", callback_url: "http://attacker.example/steal" }
  });
  expect(direct.status()).toBe(401);
});

test("the public key cannot bypass the API", async () => {
  const status = supabaseStatus();
  const anon = createClient(status.API_URL, status.ANON_KEY);

  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email: shared.candidateEmail, password: PASSWORD });
  expect(signInError).toBeNull();
  const userId = session.user!.id;

  // Self-promotion to HR: RLS silently updates no rows.
  await anon.from("users").update({ role: "hr" }).eq("id", userId);
  const { data: me } = await anon.from("users").select("role").eq("id", userId).single();
  expect(me!.role).toBe("candidate");

  // Writing an application directly, with a chosen score.
  const { data: ownResume } = await anon.from("resumes").select("id").eq("user_id", userId).limit(1).single();
  const { error: appError } = await anon.from("applications").insert({ pipeline_id: shared.pipelineId, candidate_id: userId, resume_id: ownResume!.id, score: 100, status: "selected" });
  expect(appError).not.toBeNull();
  const { error: resumeError } = await anon.from("resumes").insert({ user_id: userId, content: "forged resume content" });
  expect(resumeError).not.toBeNull();

  // Reading one's own HR evaluation, or anything in the private buckets.
  const { data: interviews } = await anon.from("interviews").select("id, result_json");
  expect(interviews).toEqual([]);
  const { data: others } = await anon.from("pipelines").select("id");
  expect(others).toEqual([]);
  const { data: buckets } = await createClient(status.API_URL, status.SERVICE_ROLE_KEY).storage.listBuckets();
  expect(buckets!.filter((bucket) => bucket.public)).toEqual([]);
});

test("a candidate completes the proctored video interview", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["camera", "microphone"] });
  const page = await context.newPage();
  await page.goto(shared.interviewLink);
  await expect(page.getByRole("heading", { name: "Your AI video interview" })).toBeVisible();
  await page.screenshot({ path: `${screenshotsDir}/video-interview-launch.png`, fullPage: true });

  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Start interview" }).click()]);
  await tab.waitForLoadState("domcontentloaded");
  await expect(tab).toHaveURL(/127\.0\.0\.1:5001\/\?context_id=/);
  await tab.waitForFunction(() => "ELEVATR_HANDOFF" in window);

  // The context in the page must not contain the private handoff fields.
  const handoff = await tab.evaluate(() => JSON.stringify((window as unknown as { ELEVATR_HANDOFF: unknown }).ELEVATR_HANDOFF));
  expect(handoff).not.toContain(shared.token);
  expect(handoff).not.toContain("callback");
  expect(handoff).not.toContain("Acme");

  const start = tab.getByRole("button", { name: "Start interview" });
  await expect(start).toBeEnabled();
  await tab.screenshot({ path: `${screenshotsDir}/interview-setup.png`, fullPage: true });
  await start.click();

  await expect(tab.locator(".ai-message").first()).toBeVisible({ timeout: 60_000 });
  await expect(tab.locator("#questionCounter")).toHaveText(/Question 1 of 8/);

  await tab.getByRole("button", { name: "Type instead" }).click();
  for (let question = 1; question <= 8; question += 1) {
    await tab.locator("#typedAnswer").fill(`In project ${question}, I built Python services with SQL and Docker, and owned the deployment on AWS. <img src=x onerror="window.__xss=1">`);
    await tab.getByRole("button", { name: "Send answer" }).click();
    if (question < 8) {
      await expect(tab.locator("#questionCounter")).toHaveText(new RegExp(`Question ${question + 1} of 8`), { timeout: 60_000 });
    }
    if (question === 2) await tab.screenshot({ path: `${screenshotsDir}/interview-live.png`, fullPage: true });
    if (question === 1) {
      // Answers are shown as text, so markup in an answer can't run in the page.
      await expect(tab.locator(".user-message").first()).toContainText("<img src=x");
      expect(await tab.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    }
  }

  await expect(tab.getByRole("heading", { name: "Interview complete" })).toBeVisible({ timeout: 150_000 });

  // The original page notices the result on its own.
  await expect(page.getByRole("heading", { name: "Interview complete" })).toBeVisible({ timeout: 30_000 });

  // The link can't be used again.
  const again = await context.request.post(`/api/interviews/${shared.interviewId}/result`, { data: { callback_token: shared.token, transcript: "A second submission that should be refused." } });
  expect(again.status()).toBe(409);
  const relaunch = await context.request.post(`/api/interviews/${shared.interviewId}/launch`, { data: { token: shared.token } });
  expect(relaunch.status()).toBe(410);
  await context.close();
});

test("a candidate can use the written interview, and it can't self-score", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(shared.writtenLink);
  await page.getByRole("link", { name: "Answer in writing instead" }).click();
  await expect(page.getByRole("heading", { name: "Written interview" })).toBeVisible();
  await page.screenshot({ path: `${screenshotsDir}/written-interview.png`, fullPage: true });
  await page.getByLabel("Your response").fill("I have built REST services in Python with SQL and deployed them with Docker on AWS for five years.");
  await page.getByRole("button", { name: "Submit interview" }).click();
  await expect(page.getByRole("heading", { name: "Interview complete" })).toBeVisible({ timeout: 90_000 });
  await context.close();
});

test("HR reviews evaluations and reports are access-controlled", async ({ browser }) => {
  const hr = await openAs(browser, shared.hrEmail, `/hr/pipeline/${shared.pipelineId}`);
  const row = hr.page.getByRole("row", { name: new RegExp(shared.candidateEmail) });
  await expect(row.getByText("interviewed")).toBeVisible();
  await row.getByRole("button", { name: "AI Eval" }).click();
  const dialog = hr.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("I built Python services").first()).toBeVisible();
  await hr.page.screenshot({ path: `${screenshotsDir}/evaluation-modal.png` });

  const details = (await (await hr.page.request.get(`/api/interviews/${shared.interviewId}/details`)).json()).data.evaluation;
  expect(details.submission_type).toBe("video");
  expect(details.max_questions).toBe(8);
  if (process.env.E2E_REAL_AI === "true") {
    expect(details.evaluation_status).toBe("complete");
    expect(typeof details.overall_score).toBe("number");
    expect(Object.keys(details.kpis)).toHaveLength(5);
  } else {
    // With no AI available the interview is saved without inventing a score.
    expect(details.overall_score).toBeNull();
    expect(details.evaluation_status).toBe("failed");
    const retry = await hr.page.request.post(`/api/interviews/${shared.interviewId}/reprocess`);
    expect(retry.status()).toBe(200);
    expect((await retry.json()).data.evaluation_status).toBe("failed");
  }

  const hrReport = await hr.page.request.get(`/api/interviews/${shared.interviewId}/report?audience=hr`);
  expect(hrReport.status()).toBe(200);
  expect(hrReport.headers()["content-type"]).toContain("application/pdf");
  await dialog.getByRole("button", { name: "Close" }).click();

  const candidate = await openAs(browser, shared.candidateEmail);
  const ownReport = await candidate.page.request.get(`/api/interviews/${shared.interviewId}/report?audience=candidate`);
  expect(ownReport.status()).toBe(200);
  expect((await ownReport.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await candidate.page.request.get(`/api/interviews/${shared.interviewId}/report?audience=hr`)).status()).toBe(404);
  expect((await candidate.page.request.get(`/api/pipelines/${shared.pipelineId}`)).status()).toBe(403);
  await candidate.context.close();

  const other = await openAs(browser, shared.weakEmail);
  expect((await other.page.request.get(`/api/interviews/${shared.interviewId}/report?audience=candidate`)).status()).toBe(404);
  await other.context.close();

  const rivalContext = await browser.newContext();
  const rivalPage = await rivalContext.newPage();
  await signUp(rivalPage, uniqueEmail("rival"), "Recruiter");
  expect((await rivalPage.request.get(`/api/pipelines/${shared.pipelineId}`)).status()).toBe(404);
  expect((await rivalPage.request.get(`/api/interviews/${shared.interviewId}/details`)).status()).toBe(404);
  expect((await rivalPage.request.get(`/api/interviews/${shared.interviewId}/report?audience=hr`)).status()).toBe(404);
  expect((await rivalPage.request.post(`/api/pipelines/${shared.pipelineId}/notify`, { data: {} })).status()).toBe(404);
  await rivalContext.close();

  // Finalize a candidate through the UI.
  await hr.page.getByLabel(`Select ${shared.candidateEmail}`).check();
  await hr.page.getByRole("button", { name: "Select candidates" }).click();
  await hr.page.getByRole("button", { name: "Select and notify" }).click();
  await expect(row.getByText("selected", { exact: true })).toBeVisible();

  // Notifying again must not re-invite someone who has finished.
  const renotify = (await (await hr.page.request.post(`/api/pipelines/${shared.pipelineId}/notify`, { data: {} })).json()).data;
  expect(renotify.sent_to.map((item: { email: string }) => item.email)).not.toContain(shared.candidateEmail);

  await hr.page.goto("/hr");
  await hr.page.getByRole("button", { name: /All candidate records/ }).click();
  await expect(hr.page.getByRole("row", { name: new RegExp(shared.candidateEmail) })).toBeVisible();
  await hr.page.screenshot({ path: `${screenshotsDir}/hr-dashboard.png`, fullPage: true });
  await hr.context.close();

  const final = await openAs(browser, shared.candidateEmail);
  await final.page.goto("/dashboard");
  const application = final.page.locator("article", { hasText: "Backend Engineer" }).first();
  await expect(application.getByText("selected", { exact: true })).toBeVisible();
  await expect(application.getByRole("link", { name: "My report" })).toBeVisible();
  await expect(application.getByRole("link", { name: "Take interview" })).toHaveCount(0);
  await final.page.screenshot({ path: `${screenshotsDir}/candidate-dashboard.png`, fullPage: true });
  await final.context.close();
});

test("resume tools: analyze, export and build through the API and UI", async ({ page, request }) => {
  const pdf = await makePdf(STRONG_RESUME);
  const api = "http://127.0.0.1:8000";

  const analyzed = await request.post(`${api}/analyze-resume`, {
    multipart: { file: { name: "r.pdf", mimeType: "application/pdf", buffer: pdf }, job_role: "Software Developer", job_description_text: JD },
    timeout: 120_000
  });
  expect(analyzed.status()).toBe(200);
  const { result } = await analyzed.json();
  expect(result.matched_skills.length).toBeGreaterThan(0);

  const exported = await request.post(`${api}/export-pdf`, { data: { result } });
  expect(exported.status()).toBe(200);
  expect((await exported.body()).subarray(0, 5).toString()).toBe("%PDF-");
  // Reports are built per request: there is no "last result" to fetch.
  expect((await request.get(`${api}/export-pdf`)).status()).toBe(405);

  expect((await request.post(`${api}/upload_resume_path`, { data: { file_path: "C:/Windows/win.ini" } })).status()).toBe(404);
  const internal = await request.post(`${api}/extract-job`, { data: { url: "http://169.254.169.254/latest/meta-data/" } });
  expect((await internal.json()).source).toBe("error");

  const uploaded = await request.post(`${api}/upload_resume`, { multipart: { file: { name: "r.pdf", mimeType: "application/pdf", buffer: pdf } } });
  expect(uploaded.status()).toBe(200);

  const html = await request.post(`${api}/generate_resume`, {
    data: { template: "classic_professional.tex", format: "html", data: { personalInfo: { name: "<script>alert(1)</script>", email: "a@example.test" }, summary: "Summary" } }
  });
  expect(html.status()).toBe(200);
  expect(await html.text()).not.toContain("<script>alert(1)</script>");

  const builtPdf = await request.post(`${api}/generate_resume`, {
    data: {
      template: "classic_professional.tex",
      format: "pdf",
      // LaTeX commands in user data must be treated as plain text.
      data: { personalInfo: { name: "Test Person", email: "a@example.test", linkedin: "https://x.test/}\\input{/etc/passwd}" }, summary: "\\input{/etc/passwd} summary" }
    },
    timeout: 130_000
  });
  expect(builtPdf.status()).toBe(200);
  expect((await builtPdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const traversal = await request.post(`${api}/generate_resume`, {
    data: { template: "../../../secret.tex", format: "pdf", data: { personalInfo: { name: "x" } } }
  });
  expect(traversal.status()).toBeLessThan(500);

  const cors = await request.fetch(`${api}/templates`, { headers: { Origin: "http://evil.example" } });
  expect(cors.headers()["access-control-allow-origin"]).toBeUndefined();

  await page.goto("/resume-tools");
  await expect(page.getByRole("link", { name: /Resume analyzer/ })).toHaveAttribute("href", /localhost:8080\/#\/upload/);
  await page.screenshot({ path: `${screenshotsDir}/resume-tools.png`, fullPage: true });

  await page.goto("http://localhost:8080/#/upload");
  await expect(page.getByRole("link", { name: "My dashboard" }).first()).toHaveAttribute("href", /localhost:3000\/dashboard/);
  await page.screenshot({ path: `${screenshotsDir}/vite-upload.png`, fullPage: true });
  await page.goto("http://localhost:8080/#/buildcv");
  await page.waitForLoadState("networkidle");
  await expect(page.getByPlaceholder("Name").first()).toBeVisible();
  await expect(page.getByPlaceholder(/Local file path/)).toHaveCount(0);
  await page.screenshot({ path: `${screenshotsDir}/vite-buildcv.png`, fullPage: true });
});

test("an account created by HR can set its password from the emailed link", async ({ page }) => {
  const status = supabaseStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY);
  const email = uniqueEmail("invited");
  const { error } = await admin.auth.admin.createUser({ email, password: "Unknown-random-1!", email_confirm: true, user_metadata: { role: "candidate" } });
  expect(error).toBeNull();
  // The same call and link format used by /api/pipelines/[id]/notify.
  const { data } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = data.properties!.hashed_token;

  await page.goto(`/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`);
  await page.getByLabel("New password").fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.screenshot({ path: `${screenshotsDir}/reset-password.png`, fullPage: true });
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login/);

  await signIn(page, email);
  await expect(page).toHaveURL(/\/dashboard/);

  // Links work once.
  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`);
  await expect(page.getByText(/invalid or has expired/)).toBeVisible();
});

test("pages render without sideways scrolling at phone and desktop widths", async ({ browser }) => {
  for (const [name, width, height] of [["phone", 375, 780], ["desktop", 1280, 860]] as const) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    for (const [label, path] of [["landing", "/"], ["login", "/login"], ["signup", "/signup"], ["forgot", "/forgot-password"], ["tools", "/resume-tools"], ["missing", "/does-not-exist"]]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: `${screenshotsDir}/${name}-${label}.png`, fullPage: true });
    }
    await signIn(page, shared.hrEmail, `/hr/pipeline/${shared.pipelineId}`);
    await expect(page.getByRole("heading", { name: "Backend Engineer" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${screenshotsDir}/${name}-hr-pipeline.png`, fullPage: true });
    await context.close();
  }
});
