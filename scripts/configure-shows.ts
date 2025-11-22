import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import * as readline from "readline";

interface TelechargeShowConfig {
  name: string;
  url?: string;
  lotteryUrl?: string;
  num_tickets?: number;
}

interface BroadwayDirectShowConfig {
  name: string;
  url: string;
  enabled?: boolean;
}

interface LuckySeatShowConfig {
  name: string;
  num_tickets?: number;
}

type LotteryType = "telecharge" | "broadway-direct" | "luckyseat" | "all";

/**
 * Create readline interface
 */
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a question and return the answer
 */
function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

/**
 * Load Telecharge shows from JSON file
 */
function loadTelechargeShows(): TelechargeShowConfig[] {
  const showsPath = join(__dirname, "../telecharge/showsToEnter.json");
  try {
    if (!existsSync(showsPath)) {
      return [];
    }
    const data = JSON.parse(readFileSync(showsPath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`❌ Error loading Telecharge shows: ${error}`);
    return [];
  }
}

/**
 * Load Broadway Direct shows from JSON file
 */
function loadBroadwayDirectShows(): BroadwayDirectShowConfig[] {
  const showsPath = join(__dirname, "../broadway-direct/showsToEnter.json");
  try {
    if (!existsSync(showsPath)) {
      return [];
    }
    const data = JSON.parse(readFileSync(showsPath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`❌ Error loading Broadway Direct shows: ${error}`);
    return [];
  }
}

/**
 * Load Lucky Seat shows from JSON file
 */
function loadLuckySeatShows(): LuckySeatShowConfig[] {
  const showsPath = join(__dirname, "../luckyseat/showsToEnter.json");
  try {
    if (!existsSync(showsPath)) {
      return [];
    }
    const data = JSON.parse(readFileSync(showsPath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`❌ Error loading Lucky Seat shows: ${error}`);
    return [];
  }
}

/**
 * Save Telecharge shows to JSON file
 */
function saveTelechargeShows(shows: TelechargeShowConfig[]): void {
  const showsPath = join(__dirname, "../telecharge/showsToEnter.json");
  writeFileSync(showsPath, JSON.stringify(shows, null, 2) + "\n", "utf-8");
  console.log(`✅ Saved Telecharge configuration to ${showsPath}`);
}

/**
 * Save Broadway Direct shows to JSON file
 */
function saveBroadwayDirectShows(shows: BroadwayDirectShowConfig[]): void {
  const showsPath = join(__dirname, "../broadway-direct/showsToEnter.json");
  writeFileSync(showsPath, JSON.stringify(shows, null, 2) + "\n", "utf-8");
  console.log(`✅ Saved Broadway Direct configuration to ${showsPath}`);
}

/**
 * Save Lucky Seat shows to JSON file
 */
function saveLuckySeatShows(shows: LuckySeatShowConfig[]): void {
  const showsPath = join(__dirname, "../luckyseat/showsToEnter.json");
  writeFileSync(showsPath, JSON.stringify(shows, null, 2) + "\n", "utf-8");
  console.log(`✅ Saved Lucky Seat configuration to ${showsPath}`);
}

/**
 * Configure Telecharge shows
 */
async function configureTelechargeShows(
  rl: readline.Interface
): Promise<TelechargeShowConfig[]> {
  const shows = loadTelechargeShows();

  if (shows.length === 0) {
    console.log(
      "\n⚠️  No Telecharge shows found. Run 'make discover-telecharge' first."
    );
    return [];
  }

  console.log("\n🎭 Telecharge Lottery Show Configuration\n");
  console.log("Configure which shows to enter by setting num_tickets:");
  console.log("  - 0 = Skip this show (don't enter lottery)");
  console.log("  - 1 = Enter lottery for 1 ticket");
  console.log("  - 2 = Enter lottery for 2 tickets\n");

  const updatedShows: TelechargeShowConfig[] = [];

  for (let i = 0; i < shows.length; i++) {
    const show = shows[i];
    const currentTickets = show.num_tickets ?? 2;
    const status =
      currentTickets > 0
        ? `✓ (${currentTickets} ticket${currentTickets > 1 ? "s" : ""})`
        : "✗ (disabled)";

    console.log(`\n[${i + 1}/${shows.length}] ${show.name} - ${status}`);
    const answer = await question(
      rl,
      "Enter number of tickets (0 to skip, 1, 2, or press Enter to keep current): "
    );

    let numTickets: number;
    if (answer.trim() === "") {
      numTickets = currentTickets;
      console.log(`   Keeping current: ${numTickets} ticket(s)`);
    } else {
      const parsed = parseInt(answer.trim(), 10);
      if (isNaN(parsed) || parsed < 0 || parsed > 2) {
        console.log(
          `   ⚠️  Invalid input, keeping current: ${currentTickets} ticket(s)`
        );
        numTickets = currentTickets;
      } else {
        numTickets = parsed;
        console.log(`   ✓ Set to: ${numTickets} ticket(s)`);
      }
    }

    updatedShows.push({
      ...show,
      num_tickets: numTickets,
    });
  }

  // Show summary
  const enabled = updatedShows.filter((s) => (s.num_tickets || 0) > 0).length;
  const disabled = updatedShows.filter((s) => (s.num_tickets || 0) === 0)
    .length;

  console.log("\n📊 Telecharge Summary:");
  console.log(`   Total shows: ${updatedShows.length}`);
  console.log(`   Enabled: ${enabled}`);
  console.log(`   Disabled: ${disabled}\n`);

  return updatedShows;
}

/**
 * Configure Broadway Direct shows
 */
async function configureBroadwayDirectShows(
  rl: readline.Interface
): Promise<BroadwayDirectShowConfig[]> {
  const shows = loadBroadwayDirectShows();

  if (shows.length === 0) {
    console.log(
      "\n⚠️  No Broadway Direct shows found. Check broadway-direct/showsToEnter.json"
    );
    return [];
  }

  console.log("\n🎭 Broadway Direct Lottery Show Configuration\n");
  console.log("Configure which shows to enter:");
  console.log("  - y/yes = Enter this show's lottery");
  console.log("  - n/no = Skip this show (don't enter lottery)");
  console.log("  - Enter = Keep current setting\n");

  const updatedShows: BroadwayDirectShowConfig[] = [];

  for (let i = 0; i < shows.length; i++) {
    const show = shows[i];
    const currentEnabled = show.enabled !== false; // Default to true
    const status = currentEnabled ? "✓ (enabled)" : "✗ (disabled)";

    console.log(`\n[${i + 1}/${shows.length}] ${show.name} - ${status}`);
    const answer = await question(
      rl,
      "Enter this show? (y/n, or press Enter to keep current): "
    );

    let enabled: boolean;
    const answerLower = answer.trim().toLowerCase();
    if (answerLower === "") {
      enabled = currentEnabled;
      console.log(`   Keeping current: ${enabled ? "enabled" : "disabled"}`);
    } else if (answerLower === "y" || answerLower === "yes") {
      enabled = true;
      console.log(`   ✓ Enabled`);
    } else if (answerLower === "n" || answerLower === "no") {
      enabled = false;
      console.log(`   ✗ Disabled`);
    } else {
      console.log(
        `   ⚠️  Invalid input, keeping current: ${currentEnabled ? "enabled" : "disabled"}`
      );
      enabled = currentEnabled;
    }

    updatedShows.push({
      ...show,
      enabled: enabled,
    });
  }

  // Show summary
  const enabled = updatedShows.filter((s) => s.enabled !== false).length;
  const disabled = updatedShows.filter((s) => s.enabled === false).length;

  console.log("\n📊 Broadway Direct Summary:");
  console.log(`   Total shows: ${updatedShows.length}`);
  console.log(`   Enabled: ${enabled}`);
  console.log(`   Disabled: ${disabled}\n`);

  return updatedShows;
}

/**
 * Configure Lucky Seat shows
 */
async function configureLuckySeatShows(
  rl: readline.Interface
): Promise<LuckySeatShowConfig[]> {
  const shows = loadLuckySeatShows();

  if (shows.length === 0) {
    console.log(
      "\n⚠️  No Lucky Seat shows found. Check luckyseat/showsToEnter.json"
    );
    return [];
  }

  console.log("\n🎭 Lucky Seat Lottery Show Configuration\n");
  console.log("Configure which shows to enter by setting num_tickets:");
  console.log("  - 0 = Skip this show (don't enter lottery)");
  console.log("  - 1 = Enter lottery for 1 ticket");
  console.log("  - 2 = Enter lottery for 2 tickets\n");

  const updatedShows: LuckySeatShowConfig[] = [];

  for (let i = 0; i < shows.length; i++) {
    const show = shows[i];
    const currentTickets = show.num_tickets ?? 2;
    const status =
      currentTickets > 0
        ? `✓ (${currentTickets} ticket${currentTickets > 1 ? "s" : ""})`
        : "✗ (disabled)";

    console.log(`\n[${i + 1}/${shows.length}] ${show.name} - ${status}`);
    const answer = await question(
      rl,
      "Enter number of tickets (0 to skip, 1, 2, or press Enter to keep current): "
    );

    let numTickets: number;
    if (answer.trim() === "") {
      numTickets = currentTickets;
      console.log(`   Keeping current: ${numTickets} ticket(s)`);
    } else {
      const parsed = parseInt(answer.trim(), 10);
      if (isNaN(parsed) || parsed < 0 || parsed > 2) {
        console.log(
          `   ⚠️  Invalid input, keeping current: ${currentTickets} ticket(s)`
        );
        numTickets = currentTickets;
      } else {
        numTickets = parsed;
        console.log(`   ✓ Set to: ${numTickets} ticket(s)`);
      }
    }

    updatedShows.push({
      ...show,
      num_tickets: numTickets,
    });
  }

  // Show summary
  const enabled = updatedShows.filter((s) => (s.num_tickets || 0) > 0).length;
  const disabled = updatedShows.filter((s) => (s.num_tickets || 0) === 0)
    .length;

  console.log("\n📊 Lucky Seat Summary:");
  console.log(`   Total shows: ${updatedShows.length}`);
  console.log(`   Enabled: ${enabled}`);
  console.log(`   Disabled: ${disabled}\n`);

  return updatedShows;
}

/**
 * Ask which lottery to configure
 */
async function askLotteryType(
  rl: readline.Interface
): Promise<LotteryType> {
  console.log("\n🎭 Lottery Configuration Tool\n");
  console.log("Which lottery would you like to configure?");
  console.log("  1. Telecharge");
  console.log("  2. Broadway Direct");
  console.log("  3. Lucky Seat");
  console.log("  4. All\n");

  while (true) {
    const answer = await question(rl, "Enter choice (1, 2, 3, or 4): ");
    const choice = answer.trim();

    if (choice === "1") {
      return "telecharge";
    } else if (choice === "2") {
      return "broadway-direct";
    } else if (choice === "3") {
      return "luckyseat";
    } else if (choice === "4") {
      return "all";
    } else {
      console.log("   ⚠️  Invalid choice. Please enter 1, 2, 3, or 4.");
    }
  }
}

/**
 * Ask for confirmation to save
 */
async function askConfirmSave(
  rl: readline.Interface,
  lotteryType: string
): Promise<boolean> {
  const answer = await question(
    rl,
    `Save changes for ${lotteryType}? (y/n): `
  );
  return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
}

/**
 * Main interactive configuration function
 */
async function configureShows(): Promise<void> {
  const rl = createReadline();

  try {
    // Ask which lottery to configure
    const lotteryType = await askLotteryType(rl);

    let telechargeShows: TelechargeShowConfig[] = [];
    let broadwayDirectShows: BroadwayDirectShowConfig[] = [];
    let luckySeatShows: LuckySeatShowConfig[] = [];

    // Configure based on selection
    if (lotteryType === "telecharge" || lotteryType === "all") {
      telechargeShows = await configureTelechargeShows(rl);
    }

    if (lotteryType === "broadway-direct" || lotteryType === "all") {
      broadwayDirectShows = await configureBroadwayDirectShows(rl);
    }

    if (lotteryType === "luckyseat" || lotteryType === "all") {
      luckySeatShows = await configureLuckySeatShows(rl);
    }

    // Confirm and save
    if (lotteryType === "telecharge" || lotteryType === "all") {
      if (telechargeShows.length > 0) {
        const confirm = await askConfirmSave(rl, "Telecharge");
        if (confirm) {
          saveTelechargeShows(telechargeShows);
        } else {
          console.log("\n❌ Telecharge changes cancelled.");
        }
      }
    }

    if (lotteryType === "broadway-direct" || lotteryType === "all") {
      if (broadwayDirectShows.length > 0) {
        const confirm = await askConfirmSave(rl, "Broadway Direct");
        if (confirm) {
          saveBroadwayDirectShows(broadwayDirectShows);
        } else {
          console.log("\n❌ Broadway Direct changes cancelled.");
        }
      }
    }

    if (lotteryType === "luckyseat" || lotteryType === "all") {
      if (luckySeatShows.length > 0) {
        const confirm = await askConfirmSave(rl, "Lucky Seat");
        if (confirm) {
          saveLuckySeatShows(luckySeatShows);
        } else {
          console.log("\n❌ Lucky Seat changes cancelled.");
        }
      }
    }

    console.log("\n✅ Configuration complete!");
  } finally {
    rl.close();
  }
}

// Run if called directly
if (require.main === module) {
  configureShows().catch((error) => {
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  });
}

export { configureShows };
