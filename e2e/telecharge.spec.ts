import { test } from "@playwright/test";
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { readFileSync } from "fs";
import { join } from "path";
import { getUserInfo, getTelechargeLogin } from "../src/get-user-info";
import { telecharge } from "../src/telecharge";

// Load the stealth plugin
const stealth = stealthPlugin();
chromium.use(stealth);

interface ShowConfig {
  name: string;
  url: string;
  num_tickets?: number;
}

// Load shows from JSON file
function loadShows(): ShowConfig[] {
  try {
    const showsPath = join(__dirname, "../telecharge/showsToEnter.json");
    const showsData = JSON.parse(readFileSync(showsPath, "utf-8"));
    if (!Array.isArray(showsData)) {
      console.error("❌ showsToEnter.json must contain a JSON array");
      return [];
    }
    return showsData;
  } catch (error) {
    console.error(`❌ Error loading shows: ${error}`);
    return [];
  }
}

// Filter shows based on SHOWS environment variable
function filterShows(shows: ShowConfig[]): ShowConfig[] {
  const showsFilter = process.env.SHOWS;
  if (!showsFilter) {
    return shows;
  }

  const filterTerms = showsFilter.split(",").map((term) => term.trim().toLowerCase());

  return shows.filter((show) => {
    const showName = show.name.toLowerCase();
    const urlLower = show.url.toLowerCase();

    return filterTerms.some((term) => {
      return showName.includes(term) || urlLower.includes(term);
    });
  });
}

const allShows = loadShows();
const shows = filterShows(allShows);

if (shows.length === 0) {
  console.warn("⚠️  No shows to enter. Check telecharge/showsToEnter.json");
  if (allShows.length > 0) {
    console.warn("Available shows:");
    allShows.forEach((show) => {
      console.warn(`   - ${show.name} (${show.url})`);
    });
  }
}

shows.forEach((show) => {
  test(`Enter lottery for ${show.name}`, async ({}, testInfo) => {
    console.log(`\n🎭 Starting Telecharge lottery entry for: ${show.name}`);
    console.log(`   URL: ${show.url}`);

    const userInfo = getUserInfo(process.env);
    const login = getTelechargeLogin(process.env);
    const browser = await chromium.launch({
      headless: process.env.CI ? true : false,
    });

    try {
      const result = await telecharge({ browser, userInfo, login, url: show.url });

      if (result.success) {
        console.log(`✅ Successfully entered lottery for: ${show.name}`);
      } else if (result.reason === "closed") {
        console.log(`ℹ️  Lottery is closed for: ${show.name} - ${result.message}`);
      } else {
        console.log(`❌ Failed to enter lottery for: ${show.name} - ${result.message}`);
      }

      // Keep browser open for a bit to see the result (unless in CI or KEEP_BROWSER_OPEN is not set)
      if (!process.env.CI && !process.env.KEEP_BROWSER_OPEN) {
        console.log("⏳ Keeping browser open for 5 seconds to view results...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else if (process.env.KEEP_BROWSER_OPEN === "true") {
        console.log("🔍 Browser will stay open. Press Ctrl+C to close.");
        // Keep browser open indefinitely
        await new Promise(() => {});
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  });
});

