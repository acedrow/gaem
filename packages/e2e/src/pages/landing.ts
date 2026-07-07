import type { Page } from "@playwright/test";

import { E2E_ENV } from "../env.js";

export async function loginAsGm(page: Page, password = E2E_ENV.gmPassword): Promise<void> {
  await page.goto("/");
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Join as GM" }).click();
  await page.waitForURL("**/game");
}

export async function loginAsPlayer(
  page: Page,
  profileName: string,
  password = E2E_ENV.playerPassword,
): Promise<void> {
  await page.goto("/");
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Join as Player" }).click();
  await page.getByRole("button", { name: profileName }).click();
  await page.getByRole("button", { name: "Join game as player" }).click();
  await page.waitForURL("**/game");
}
