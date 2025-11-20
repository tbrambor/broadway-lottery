import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { writeFileSync } from "fs";
import { join } from "path";

// Load the stealth plugin
const stealth = stealthPlugin();
chromium.use(stealth);

interface ShowInfo {
  name: string;
  url: string;
  lotteryUrl?: string;
  num_tickets?: number;
}

/**
 * Discover Telecharge lottery shows from bwayrush.com
 */
async function discoverTelechargeShows(): Promise<ShowInfo[]> {
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

    console.log("🔍 Searching for Telecharge lottery shows...");

    // Find all show rows
    const showRows = await page.locator(".table-row.playing").all();

    const shows: ShowInfo[] = [];

    for (const row of showRows) {
      try {
        // Get show name
        const showNameElement = row.locator(".show-title a").first();
        const showName = await showNameElement.textContent();
        const showUrl = await showNameElement.getAttribute("href");

        if (!showName || !showUrl) {
          continue;
        }

        // Look for Telecharge lottery link in the lottery column
        const lotteryColumn = row.locator(".column-lottery");
        const lotteryLinks = await lotteryColumn.locator("a").all();

        for (const link of lotteryLinks) {
          const href = await link.getAttribute("href");
          
          // Check if it's a Telecharge lottery link
          if (href && href.includes("my.socialtoaster.com/st/lottery_select/?key=BROADWAY")) {
            // Get the price info to see if it's digital
            const discountInfo = await link.locator(".discount-info").textContent();
            
            if (discountInfo && discountInfo.toLowerCase().includes("digital")) {
              shows.push({
                name: showName.trim(),
                url: showUrl,
                lotteryUrl: href,
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
 * Main function to discover and save Telecharge shows
 */
async function main() {
  console.log("🎭 Discovering Telecharge lottery shows from bwayrush.com...\n");

  try {
    const shows = await discoverTelechargeShows();

    if (shows.length === 0) {
      console.log("⚠️  No Telecharge lottery shows found.");
      return;
    }

    console.log(`\n📊 Found ${shows.length} Telecharge lottery show(s):\n`);
    shows.forEach((show) => {
      console.log(`   - ${show.name}`);
      console.log(`     URL: ${show.url}`);
      console.log(`     Lottery: ${show.lotteryUrl}\n`);
    });

    // Save to JSON file
    const outputPath = join(__dirname, "../telecharge/showsToEnter.json");
    writeFileSync(outputPath, JSON.stringify(shows, null, 2), "utf-8");
    console.log(`✅ Saved ${shows.length} show(s) to ${outputPath}`);
    console.log("\n💡 You can now edit the file to:");
    console.log("   - Remove shows you don't want to enter");
    console.log("   - Adjust num_tickets for each show");
    console.log("   - Update URLs if needed");
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { discoverTelechargeShows };

