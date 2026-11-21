import { defineConfig } from "@playwright/test";

// End-to-end tests run the real FastAPI backend and the Vite frontend together.
const python = process.platform === "win32" ? ".venv\\Scripts\\python" : ".venv/bin/python";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.env.PW_CHANNEL ?? "msedge", // uses the installed Microsoft Edge
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
      cwd: "../backend",
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
    },
  ],
});
