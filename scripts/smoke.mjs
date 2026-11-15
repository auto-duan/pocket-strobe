import { chromium } from "@playwright/test";
import { createServer } from "vite";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const server = await createServer({
  server: { host: "127.0.0.1", port: 4179, strictPort: true },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Prevent any real visual flash, even during interaction checks.
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = '[data-testid="strobe-output"]{background:#000!important}';
    document.addEventListener("DOMContentLoaded", () =>
      document.head.append(style),
    );
  });
  await page.goto("http://127.0.0.1:4179");
  const start = page.getByRole("button", { name: "开始频闪" });
  assert(await start.isDisabled());
  assert.equal(await page.locator("output").textContent(), "1.0");
  assert.equal(await page.getByTestId("strobe-output").count(), 0);
  assert(await page.getByText("系统已开启减少动态效果").isVisible());
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  for (const width of [320, 360, 390, 700, 701, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "overflow at " + width);
    const styles = await page.getByRole("region", { name: "频闪设置" }).evaluate(el => {
      const style = getComputedStyle(el);
      return { radius: style.borderRadius, background: style.backgroundColor, padding: style.paddingTop, columns: getComputedStyle(el.parentElement).gridTemplateColumns };
    });
    assert.equal(styles.radius, width <= 700 ? "21px" : "24px");
    assert.equal(styles.padding, width <= 700 ? "23px" : "28px");
    assert.equal(styles.background, "rgba(26, 33, 27, 0.85)");
    assert.equal(styles.columns.split(" ").length, width <= 700 ? 1 : 2);
    console.log("Tailwind computed styles", width, styles);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await mkdir("verification", { recursive: true });
  await page.screenshot({
    path: "verification/mobile-idle.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "5 Hz", exact: true }).click();
  assert.equal(await page.locator("output").textContent(), "5.0");
  await page.getByLabel("我已了解闪光风险").check();
  await start.click();
  await page.getByRole("button", { name: "立即停止" }).waitFor();
  const stop = page.getByRole("button", { name: "立即停止" });
  await page.setViewportSize({ width: 320, height: 568 });
  assert(await stop.isVisible());
  assert(await stop.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.height >= 88 && document.activeElement === el;
  }));
  assert.equal(await page.getByTestId("strobe-output").evaluate(el => getComputedStyle(el).position), "fixed");
  await page.keyboard.press("Escape");
  await page.getByTestId("strobe-output").waitFor({ state: "detached" });
  await start.click();
  await page.getByRole("button", { name: "立即停止" }).click();
  assert.equal(await page.getByTestId("strobe-output").count(), 0);
  await start.click();
  await page.getByRole("button", { name: "立即停止" }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.getByTestId("strobe-output").waitFor({ state: "detached" });
  await start.click();
  await page.getByRole("button", { name: "立即停止" }).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByTestId("strobe-output").waitFor({ state: "detached" });
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "verification/desktop-idle.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: consent gate, 1Hz default, preset, reduced motion, mobile overflow, Escape, stop button, pagehide, visibility hidden; no page errors. Screenshots idle only; visual flashing suppressed.",
  );
} finally {
  await browser?.close();
  await server.close();
}
