import { test } from "@playwright/test";
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { getUserInfo } from "../src/get-user-info";
import { broadwayDirect } from "../src/broadway-direct";

// Load the stealth plugin and use defaults (all tricks to hide playwright usage)
// Note: playwright-extra is compatible with most puppeteer-extra plugins
const stealth = stealthPlugin();

// Add the plugin to Playwright (any number of plugins can be added)
chromium.use(stealth);

const urls = [
  "https://lottery.broadwaydirect.com/show/aladdin/",
  "https://lottery.broadwaydirect.com/show/beetlejuice-ny/",
  "https://lottery.broadwaydirect.com/show/death-becomes-her-ny/",
  "https://lottery.broadwaydirect.com/show/mj-ny/",
  "https://lottery.broadwaydirect.com/show/six-ny/",
  "https://lottery.broadwaydirect.com/show/st-nyc/",
  "https://lottery.broadwaydirect.com/show/the-lion-king/",
  "https://lottery.broadwaydirect.com/show/wicked/",
];

urls.forEach((url) => {
  test(`Sign up at ${url}`, async () => {
    const userInfo = getUserInfo(process.env);
    // Use headless mode in CI environment
    const browser = await chromium.launch({
      headless: process.env.CI ? true : false,
    });
    await broadwayDirect({ browser, userInfo, url });
  });
});
