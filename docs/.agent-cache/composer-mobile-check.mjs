import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

async function shot(name, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#composer-input");
  await page.waitForTimeout(400);
  const box = await page.locator('[data-slot="input-group"]').boundingBox();
  const form = await page.locator("form").boundingBox();
  const plus = await page.getByRole("button", { name: "Add" }).boundingBox();
  const send = await page.getByRole("button", { name: "Send" }).boundingBox();
  await page.screenshot({
    path: `docs/.agent-cache/${name}.png`,
    fullPage: false,
  });
  await page.close();
  return { name, viewport, box, form, plus, send };
}

const mobile = await shot("composer-mobile", { width: 390, height: 844 });
const desktop = await shot("composer-desktop", { width: 1280, height: 800 });
console.log(JSON.stringify({ mobile, desktop }, null, 2));
await browser.close();
