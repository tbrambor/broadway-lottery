import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

// Load the stealth plugin
const stealth = stealthPlugin();
chromium.use(stealth);

interface ShowInfo {
  name: string;
  num_tickets?: number;
}

/**
 * Discover Lucky Seat lottery shows from bwayrush.com
 */
async function discoverLuckySeatShows(): Promise<ShowInfo[]> {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();
    
    console.log("🌐 Loading bwayrush.com...");
    await page.goto("https://bwayrush.com/", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // Wait for the content to load (it's a Svelte app)
    await page.waitForSelector(".table-row", { timeout: 30000 });
    await page.waitForTimeout(2000); // Give it a moment to fully render

    console.log("🔍 Searching for Lucky Seat lottery shows...");

    // Find all show rows
    const showRows = await page.locator(".table-row.playing").all();

    const shows: ShowInfo[] = [];

    for (const row of showRows) {
      try {
        // Get show name
        const showNameElement = row.locator(".show-title a").first();
        const showName = await showNameElement.textContent();

        if (!showName) {
          continue;
        }

        // Look for Lucky Seat lottery link in the lottery column
        const lotteryColumn = row.locator(".column-lottery");
        const lotteryLinks = await lotteryColumn.locator("a").all();

        for (const link of lotteryLinks) {
          const href = await link.getAttribute("href");
          
          // Check if it's a Lucky Seat lottery link
          if (href && href.includes("luckyseat.com")) {
            // Get the price info
            const discountInfo = await link.locator(".discount-info").textContent();
            
            // Lucky Seat shows are typically marked as "Digital" or similar
            if (discountInfo && discountInfo.toLowerCase().includes("digital")) {
              shows.push({
                name: showName.trim(),
                num_tickets: 2, // Default
              });
              console.log(`✅ Found: ${showName.trim()}`);
              break; // Only add once per show
            }
          }
        }
      } catch (error) {
        // Skip this row if there's an error
        continue;
      }
    }

    return shows;
  } finally {
    await browser.close();
  }
}

/**
 * Load existing shows configuration to preserve user preferences
 */
function loadExistingShows(): Map<string, ShowInfo> {
  const showsPath = join(__dirname, "../luckyseat/showsToEnter.json");
  const existingShows = new Map<string, ShowInfo>();

  if (existsSync(showsPath)) {
    try {
      const existingData = JSON.parse(readFileSync(showsPath, "utf-8"));
      if (Array.isArray(existingData)) {
        existingData.forEach((show: ShowInfo) => {
          existingShows.set(show.name, show);
        });
      }
    } catch (error) {
      // If file is invalid, start fresh
      console.log("⚠️  Could not load existing shows, starting fresh");
    }
  }

  return existingShows;
}

/**
 * Merge discovered shows with existing user preferences
 */
function mergeShows(discovered: ShowInfo[], existing: Map<string, ShowInfo>): ShowInfo[] {
  return discovered.map((show) => {
    const existingShow = existing.get(show.name);
    if (existingShow) {
      // Preserve user's num_tickets preference (including 0 to skip)
      return {
        ...show,
        num_tickets: existingShow.num_tickets !== undefined ? existingShow.num_tickets : 2,
      };
    }
    // New show - default to 2 tickets (user can change to 0 to skip)
    return {
      ...show,
      num_tickets: 2,
    };
  });
}

/**
 * Main function to discover and save Lucky Seat shows
 */
async function main() {
  console.log("🎭 Discovering Lucky Seat lottery shows from bwayrush.com...\n");

  try {
    // Load existing shows to preserve user preferences
    const existingShows = loadExistingShows();
    const existingCount = existingShows.size;
    
    if (existingCount > 0) {
      console.log(`📋 Found ${existingCount} existing show(s) with user preferences\n`);
    }

    // Discover new shows
    const discoveredShows = await discoverLuckySeatShows();

    if (discoveredShows.length === 0) {
      console.log("⚠️  No Lucky Seat lottery shows found.");
      return;
    }

    // Merge with existing preferences
    const mergedShows = mergeShows(discoveredShows, existingShows);

    // Count shows by status
    const enabledCount = mergedShows.filter(s => (s.num_tickets || 0) > 0).length;
    const disabledCount = mergedShows.filter(s => (s.num_tickets || 0) === 0).length;
    const newCount = mergedShows.filter(s => !existingShows.has(s.name)).length;

    console.log(`\n📊 Summary:`);
    console.log(`   Total shows: ${mergedShows.length}`);
    console.log(`   Enabled (will enter): ${enabledCount}`);
    console.log(`   Disabled (num_tickets: 0): ${disabledCount}`);
    if (newCount > 0) {
      console.log(`   New shows: ${newCount}`);
    }
    console.log();

    // Show all shows with their status
    mergedShows.forEach((show) => {
      const status = (show.num_tickets || 0) > 0 ? "✓" : "✗ (disabled)";
      const isNew = !existingShows.has(show.name) ? " [NEW]" : "";
      console.log(`   ${status} ${show.name}${isNew}`);
    });
    console.log();

    // Save to JSON file
    const outputPath = join(__dirname, "../luckyseat/showsToEnter.json");
    writeFileSync(outputPath, JSON.stringify(mergedShows, null, 2), "utf-8");
    console.log(`✅ Saved ${mergedShows.length} show(s) to ${outputPath}`);
    console.log("\n💡 To control which shows to enter:");
    console.log("   - Set num_tickets to 0 to skip a show");
    console.log("   - Set num_tickets to 1 or 2 to enter that show");
    console.log("   - Your preferences are preserved when running discover-luckyseat again");
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { discoverLuckySeatShows };
