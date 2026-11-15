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
  assert(await start.isEnabled());
  assert.equal(await page.getByLabel("我已了解闪光风险").count(), 0);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.locator("#frequency").inputValue(), "15");
  assert.equal(await page.getByTestId("strobe-output").count(), 0);
  assert(await page.getByText("系统已开启减少动态效果").isVisible());
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  for (const [width,height] of [[320,568],[390,844],[1280,900]]) {
    await page.setViewportSize({width,height});
    for (const y of [0,200,10000]) {
      await page.evaluate(y => scrollTo(0,y),y);
      assert(await start.evaluate(el => {const r=el.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && r.height>=44;}));
      assert(await page.getByTestId("action-dock").evaluate(el => getComputedStyle(el).position === "fixed" && el.getBoundingClientRect().bottom === innerHeight));
      assert(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth));
    }
    assert(await page.locator('main').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom)>document.querySelector('[data-testid="action-dock"]').getBoundingClientRect().height));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior="auto"; scrollTo(0,0); });
  await page.waitForTimeout(150);
  await mkdir("verification", { recursive: true });
  await page.screenshot({
    path: "verification/mobile-idle.png",
    fullPage: false,
  });
  const input = page.locator("#frequency");
  for (const width of [390,1280]) {
  await page.setViewportSize({width,height:900});
  assert.equal(await page.locator('input[type="range"]').count(),0);
  for (const draft of ["0.1", "12.3", "999", "999.0"]) {
    await input.fill(draft);
    for (const mode of [/后置手电筒/, /屏幕闪光/]) {
      await page.getByRole("button", {name:mode}).click();
      assert.equal(await input.inputValue(),draft);
      assert.equal(await input.getAttribute("aria-invalid"),"false");
    }
    await start.click();
    await page.getByRole("button",{name:"立即停止"}).click();
    assert.equal(await input.inputValue(),draft);
  }
  assert.equal(await input.getAttribute("type"),"number");
  await input.fill("12"); await input.focus();
  await page.keyboard.type("abcEe+-");
  assert.equal(await input.inputValue(),"12");
  for (const text of ["abc","1e2","-1","12.34","Infinity"]) {
    const prevented = await input.evaluate((el,text) => { const dt=new DataTransfer(); dt.setData('text',text); return !el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); },text);
    assert(prevented); assert.equal(await input.inputValue(),"12");
  }
  await input.fill(""); await page.keyboard.type("12.3"); assert.equal(await input.inputValue(),"12.3");
  await input.fill(""); await page.keyboard.type("12."); await start.click(); await page.getByRole("button",{name:"立即停止"}).click();
  for (const draft of ["", "0", "1000", "0.01"]) {
    await input.fill(draft); await start.click();
    assert.equal(await page.getByTestId("strobe-output").count(),0);
    assert.equal(await input.getAttribute("aria-invalid"),"true");
    assert(await page.locator("#frequency-error").isVisible());
  }
  // Bypass the UI as an extension/script might: start must validate the live DOM, never a stale React draft.
  await input.fill("15");
  await input.evaluate(el => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'1e2'); });
  await start.click(); assert.equal(await page.getByTestId("strobe-output").count(),0);
  for (const hz of [12,20,30,45,60,70]) {
    await page.getByRole("button",{name:hz+" Hz",exact:true}).click();
    await page.getByRole("button",{name:/后置手电筒/}).click();
    assert.equal(await input.inputValue(),String(hz));
    assert.equal(await page.getByRole("button",{name:hz+" Hz",exact:true}).getAttribute("aria-pressed"),"true");
    await page.getByRole("button",{name:/屏幕闪光/}).click();
    assert.equal(await input.inputValue(),String(hz));
  }
  assert.equal(await input.getAttribute("min"),"0.1");
  assert.equal(await input.getAttribute("max"),"999");
  assert.equal(await input.getAttribute("step"),"0.1");
  assert.equal(await input.getAttribute("inputmode"),"decimal");
  }
  await page.setViewportSize({width:390,height:844});
  await start.click();
  await page.getByRole("button", { name: "立即停止" }).waitFor();
  const stop = page.getByRole("button", { name: "立即停止" });
  await page.setViewportSize({ width: 320, height: 568 });
  assert(await stop.isVisible());
  assert(await stop.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.height >= 44 && r.height <= 48 && r.width >= 44 && r.width <= 140 && document.activeElement === el;
  }));
  assert.equal(await page.getByTestId("strobe-output").evaluate(el => getComputedStyle(el).position), "fixed");
  for (const [width, height] of [[320,568],[390,844],[1280,900]]) {
    await page.setViewportSize({ width, height });
    assert(await page.getByTestId("strobe-output").evaluate(el => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.x === 0 && r.y === 0 && r.width === innerWidth && r.height === innerHeight && style.padding === "0px" && el.children.length === 1;
    }), "edge-to-edge output at " + width);
    assert.equal(await page.getByRole("region", {name:"频闪设置"}).count(), 0);
    assert.equal(await page.getByRole("banner").count(), 0);
    assert.equal(await page.getByText("系统已开启减少动态效果").isVisible(), false);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:"verification/mobile-active-black.png"});
  await page.keyboard.press("Escape");
  await page.getByTestId("strobe-output").waitFor({ state: "detached" });
  await start.click();
  await page.getByRole("button", { name: "立即停止" }).focus();
  await page.keyboard.press("Enter");
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
  assert.equal(await page.getByTestId("strobe-output").count(), 0);
  await start.click();
  await page.getByTestId("strobe-output").click({position:{x:1,y:1}});
  await page.getByTestId("strobe-output").waitFor({state:"detached"});
  await start.click();
  await page.getByRole("button", {name:"立即停止"}).click();
  assert.equal(await page.getByTestId("strobe-output").count(), 0);
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "verification/desktop-idle.png",
    fullPage: true,
  });
  // Pending camera permission remains cancellable; a late stream cannot restart output.
  await page.evaluate(() => {
    window.__resolveCamera = null;
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.__resolveCamera = resolve; });
  });
  await page.getByRole("button", {name:"后置手电筒",exact:true}).click();
  await start.click();
  const cancel = page.getByRole("button", {name:"取消并停止",exact:true});
  await cancel.waitFor(); assert(await cancel.isVisible()); await cancel.click();
  await page.evaluate(() => { window.__resolveCamera({getVideoTracks:()=>[],getTracks:()=>[]}); });
  assert.equal(await page.getByTestId("strobe-output").count(),0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: no consent gate or autoplay, immersive edge-to-edge output, hidden settings/header/warnings, compact accessible stop, tap anywhere, keyboard Enter, 15Hz default, all high presets, shared decimal input, invalid drafts blocked, no slider, exact mode preservation, reduced motion, mobile overflow, Escape, stop button, pagehide, visibility hidden; no page errors. Idle and black-only active screenshots; visual flashing suppressed.",
  );
} finally {
  await browser?.close();
  await server.close();
}
