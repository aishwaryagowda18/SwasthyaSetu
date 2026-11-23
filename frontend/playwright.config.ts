import { defineConfig } from "@playwright/test";
import path from "node:path";

// End-to-end tests run the real FastAPI backend and the Vite frontend together.
// The backend uses a throwaway copy of the data and test admin accounts (see e2e/prepare_backend.py),
// so tests never change the real data/ folder or real accounts.
const python = process.platform === "win32" ? ".venv\\Scripts\\python" : ".venv/bin/python";
const e2eDir = path.resolve(process.cwd(), "test-results", "e2e-backend"); // run from frontend/

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  workers: 1, // admin tests change the throwaway data, so run in order
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.env.PW_CHANNEL ?? "msedge", // uses the installed Microsoft Edge
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `${python} ../frontend/e2e/prepare_backend.py && ${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
      cwd: "../backend",
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: false,
      env: {
        SCHEMESAATHI_DATA_DIR: path.join(e2eDir, "data"),
        SCHEMESAATHI_ADMIN_USERS: path.join(e2eDir, "users.json"),
        SCHEMESAATHI_AUDIT_LOG: path.join(e2eDir, "audit.jsonl"),
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
    },
  ],
});
