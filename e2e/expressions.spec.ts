import { expect, test } from "@playwright/test";

const KEY_EXPRESSIONS = ["happy", "curious", "surprised", "thinking", "excited", "sad", "confused", "winking", "sleeping", "celebrating"];

for (const expr of KEY_EXPRESSIONS) {
  test(`expression: ${expr}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/showcase?seed=1&freeze&expr=${expr}`);
    await expect(page.getByTestId("expression")).toHaveText(expr);
    // freeze holds the pose after 120 fixed-step frames
    await page.waitForTimeout(4000);
    const stage = page.locator("canvas").first();
    await expect(stage).toHaveScreenshot(`${expr}.png`);
  });
}

test("keyboard: Enter on the focused character opens the chat", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByRole("button", { name: /Nidus, your AI assistant/ });
  await btn.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Nidus" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
