import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: join(rootDir, ".env.e2e") });
config({ path: join(rootDir, ".env.e2e.example") });

const gmPassword = process.env.GM_PASSWORD ?? "e2e-gm";
const playerPassword = process.env.PLAYER_PASSWORD ?? "e2e-player";
const authSecret = process.env.AUTH_SECRET ?? "e2e-secret";
const clientUrl = process.env.E2E_CLIENT_URL ?? "http://localhost:5173";
const clientPort = new URL(clientUrl).port || "5173";
const apiPort = process.env.PORT ?? "3001";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: clientUrl,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
          : {}),
      },
    },
  ],

  webServer: {
    command: `npm run build -w @gaem/shared && concurrently -n server,client -c blue,green "npm run dev -w @gaem/server" "npm run dev -w @gaem/client -- --port ${clientPort} --strictPort"`,
    cwd: rootDir,
    url: clientUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      GM_PASSWORD: gmPassword,
      PLAYER_PASSWORD: playerPassword,
      AUTH_SECRET: authSecret,
      PORT: apiPort,
    },
  },
});
