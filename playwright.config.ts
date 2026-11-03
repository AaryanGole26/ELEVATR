import { execSync } from "child_process";
import path from "path";
import { defineConfig } from "@playwright/test";

/**
 * Runs the whole platform against a throwaway local Supabase (`supabase start`, then
 * `npm run test:e2e`). Process environment variables take priority over .env.local, so nothing
 * here can reach a real database, and email is disabled so no real messages can be sent.
 */
const status: Record<string, string> = JSON.parse(execSync("supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const root = __dirname;
const python = path.join(root, "venv", "Scripts", "python.exe");

const useRealAi = process.env.E2E_REAL_AI === "true";

export const testEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: status.DB_URL,
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_VIDEO_INTERVIEW_URL: "http://127.0.0.1:5001",
  NEXT_PUBLIC_CLIENT_SIDE_FRONTEND_URL: "http://localhost:8080",
  INTERVIEW_SERVICE_SECRET: "e2e-test-secret",
  INTERVIEW_ALLOWED_ORIGINS: "http://localhost:3000",
  GMAIL_USER: "",
  GMAIL_APP_PASSWORD: "",
  GROQ_API_KEY: "",
  ...(useRealAi ? {} : { GOOGLE_API_KEY: "", GEMINI_API_KEY: "" }),
  E2E_TEST_MODE: "true"
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"]
    }
  },
  webServer: [
    {
      command: "npx next build && npx next start -p 3000",
      url: "http://localhost:3000",
      timeout: 300_000,
      reuseExistingServer: false,
      env: { ...testEnv, NODE_ENV: "production" }
    },
    {
      command: `"${python}" app.py`,
      cwd: path.join(root, "ai-video-interviewer"),
      url: "http://127.0.0.1:5001/health",
      timeout: 120_000,
      reuseExistingServer: false,
      env: testEnv
    },
    {
      command: `"${python}" main.py`,
      cwd: path.join(root, "Client Side", "backend"),
      url: "http://127.0.0.1:8000/",
      timeout: 240_000,
      reuseExistingServer: false,
      env: testEnv
    },
    {
      command: "npx vite --port 8080 --strictPort",
      cwd: path.join(root, "Client Side", "ai-skill-analyzer-main"),
      url: "http://localhost:8080",
      timeout: 120_000,
      reuseExistingServer: false,
      env: { VITE_BACKEND_URL: "http://127.0.0.1:8000", VITE_MAIN_APP_URL: "http://localhost:3000" }
    }
  ]
});
