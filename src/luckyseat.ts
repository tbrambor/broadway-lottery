import type { Browser, Page } from "playwright";
import type { UserInfo, LotteryResult, TelechargeLogin } from "./types";
import { solveRecaptcha } from "./captchaSolver";

/**
 * Login to Lucky Seat
 */
async function loginToLuckySeat(
  page: Page,
  login: TelechargeLogin
): Promise<{ success: boolean; message?: string }> {
  try {
    console.log("🔐 Logging in to Lucky Seat...");

    // Navigate to the Lucky Seat login page
    // Use load instead of domcontentloaded to ensure all resources are loaded
    console.log("🌐 Navigating to login page...");
    await page.goto("https://www.luckyseat.com/account/login", {
      waitUntil: "load",
      timeout: 60000,
    });
    console.log("✅ Page loaded");

    // Wait for network to be idle (Angular app initialization)
    console.log("⏳ Waiting for network to idle...");
    try {
      await page.waitForLoadState("networkidle", { timeout: 30000 });
      console.log("✅ Network idle");
    } catch (e) {
      console.log("⚠️  Network didn't idle, continuing anyway...");
    }

    // Additional wait for Angular to initialize
    await page.waitForTimeout(3000);

    // Wait for the login form to be visible with multiple strategies
    console.log("🔍 Looking for login form...");
    try {
      // Try multiple selectors in case the page structure varies
      const emailSelectors = [
        'input[placeholder="Email"]',
        'input[type="email"]',
        'input[name="email"]',
        'input#email',
      ];
      
      let found = false;
      for (const selector of emailSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 10000, state: 'visible' });
          console.log(`✅ Login form loaded (found via: ${selector})`);
          found = true;
          break;
        } catch {
          console.log(`   Selector not found: ${selector}`);
        }
      }
      
      if (!found) {
        throw new Error("Could not find email input field with any selector");
      }
    } catch (error) {
      console.log("❌ Login form did not load in time");
      console.log(`   Current URL: ${page.url()}`);
      
      // Log page content for debugging
      const bodyText = await page.textContent('body').catch(() => 'Could not get body text');
      console.log(`   Page text preview: ${bodyText?.substring(0, 200)}...`);
      
      // Take a screenshot for debugging
      try {
        const screenshotPath = 'test-results/login-timeout-debug.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`   Screenshot saved to ${screenshotPath}`);
      } catch (screenshotError) {
        console.log(`   Could not save screenshot: ${screenshotError}`);
      }
      throw error;
    }

    // Fill in email field
    console.log("📧 Filling email field...");
    const emailField = page.locator('input[placeholder="Email"]').first();
    await emailField.fill(login.email);
    console.log("✅ Email filled");

    // Fill in password field
    console.log("🔑 Filling password field...");
    const passwordField = page.locator('input[placeholder="Password"]').first();
    await passwordField.fill(login.password);
    console.log("✅ Password filled");

    // Click the login button
    console.log("🖱️  Clicking login button...");
    // Try multiple selectors for the submit button
    const submitSelectors = [
      'input.c-btn.c-btn--large',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Sign In")',
      'button:has-text("Login")',
    ];

    let clicked = false;
    for (const selector of submitSelectors) {
      try {
        const button = page.locator(selector).first();
        const isVisible = await button.isVisible({ timeout: 2000 }).catch(() => false);
        if (isVisible) {
          await button.click();
          clicked = true;
          console.log(`✅ Clicked login button: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!clicked) {
      console.log("❌ Could not find login button");
      return { success: false, message: "Could not find login button" };
    }

    // Wait for login to process
    console.log("⏳ Waiting for login to process...");
    await page.waitForTimeout(3000);

    // Check if login was successful by looking for redirect or error messages
    const currentUrl = page.url();
    const pageText = (await page.textContent("body").catch(() => "")) || "";
    const lowerText = pageText.toLowerCase();

    // Check for error messages
    const hasError =
      lowerText.includes("invalid") ||
      lowerText.includes("incorrect") ||
      lowerText.includes("error") ||
      lowerText.includes("wrong password") ||
      lowerText.includes("wrong email") ||
      currentUrl.includes("/login");

    if (hasError) {
      console.log("❌ Login failed - check credentials");
      return {
        success: false,
        message: "Login failed - invalid credentials or error",
      };
    }

    // Check if we're redirected away from login page (successful login)
    if (!currentUrl.includes("/login")) {
      console.log("✅ Successfully logged in to Lucky Seat");
      console.log(`   Current URL: ${currentUrl}`);
      return { success: true };
    }

    // Additional success indicators
    const hasSuccess =
      lowerText.includes("welcome") ||
      lowerText.includes("dashboard") ||
      lowerText.includes("account") ||
      lowerText.includes("lottery");

    if (hasSuccess) {
      console.log("✅ Successfully logged in to Lucky Seat");
      return { success: true };
    }

    // If we can't determine, wait a bit more and check again
    await page.waitForTimeout(2000);
    const finalUrl = page.url();
    if (!finalUrl.includes("/login")) {
      console.log("✅ Login appears successful (redirected from login page)");
      return { success: true };
    }

    console.log("⚠️  Login status unclear");
    return {
      success: false,
      message: "Could not verify login success",
    };
  } catch (error) {
    console.log(`❌ Error during login: ${error}`);
    return {
      success: false,
      message: `Login error: ${error}`,
    };
  }
}

/**
 * Navigate to the lottery page and apply filters
 */
async function navigateToLotteryPage(
  page: Page
): Promise<{ success: boolean; message?: string }> {
  try {
    console.log("🔍 Navigating to lottery page...");

    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);

    // If not on home page, navigate there
    if (!currentUrl.includes("/home")) {
      await page.goto("https://www.luckyseat.com/home", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
      console.log("✅ Navigated to home page");
    }

    // Apply filters: New York City and Broadway category
    console.log("🔍 Applying filters: New York City + Broadway");

    // Wait for page to fully load
    await page.waitForTimeout(2000);

    // Select "New York City" from cities dropdown
    // The city filter is a standard select element with id='cities'
    const citySelector = page.locator("select#cities").first();
    const cityVisible = await citySelector.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (cityVisible) {
      await citySelector.selectOption("New York City");
      console.log("✅ Selected 'New York City' from Events in filter");
      await page.waitForTimeout(2000);
    } else {
      console.log("⚠️  Could not find city filter dropdown");
    }

    // Select "Broadway" from category dropdown
    // The category filter is a standard select element with id='category'
    const categorySelector = page.locator("select#category").first();
    const categoryVisible = await categorySelector.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (categoryVisible) {
      await categorySelector.selectOption("Broadway");
      console.log("✅ Selected 'Broadway' category");
      await page.waitForTimeout(2000);
    } else {
      console.log("⚠️  Could not find category filter dropdown");
    }

    // Wait for shows to load after filter application
    await page.waitForTimeout(2000);
    console.log("✅ Filters applied, shows should be loaded");

    return { success: true };
  } catch (error) {
    console.log(`❌ Error navigating to lottery page: ${error}`);
    return {
      success: false,
      message: `Navigation error: ${error}`,
    };
  }
}


/**
 * Helper function to determine if a time string is an evening show
 * Evening shows are considered 6:00 PM or later
 */
function isEveningShow(timeStr: string): boolean {
  // Parse time strings like "7:00 PM", "7:30 PM", "2:00 PM", etc.
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return false;

  const hour = parseInt(match[1]);
  const period = match[3].toUpperCase();

  // Convert to 24-hour format
  let hour24 = hour;
  if (period === "PM" && hour !== 12) {
    hour24 = hour + 12;
  } else if (period === "AM" && hour === 12) {
    hour24 = 0;
  }

  // Evening shows are 6:00 PM (18:00) or later
  return hour24 >= 18;
}

/**
 * Helper function to determine if a date is a weekend (Saturday or Sunday)
 */
function isWeekend(dateStr: string): boolean {
  // Parse date strings like "Tuesday, November 25, 2025"
  // We can use JavaScript's Date parser
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();
  // 0 = Sunday, 6 = Saturday
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Find and enter lotteries for enabled shows
 */
async function enterLotteries(
  page: Page,
  userInfo: UserInfo,
  shows: Array<{ name: string; num_tickets?: number }>
): Promise<{
  success: boolean;
  message: string;
  results: Array<{ show: string; success: boolean; message: string }>;
}> {
  try {
    console.log("🎭 Looking for available lotteries...");

    // Wait for lottery content to load
    await page.waitForTimeout(2000);

    const results: Array<{ show: string; success: boolean; message: string }> = [];

    // Get page text to check for lottery status
    const pageText = (await page.textContent("body").catch(() => "")) || "";
    const lowerText = pageText.toLowerCase();

    // Check if lotteries are closed
    const isClosed =
      lowerText.includes("no lotteries available") ||
      lowerText.includes("lottery closed") ||
      lowerText.includes("check back later") ||
      lowerText.includes("no drawings available");

    if (isClosed) {
      console.log("ℹ️  Lotteries are currently closed");
      return {
        success: false,
        message: "No lotteries available at this time",
        results: [],
      };
    }

    // Filter shows to only those with num_tickets > 0
    const enabledShows = shows.filter((show) => {
      const numTickets = show.num_tickets ?? parseInt(userInfo.numberOfTickets);
      return numTickets > 0;
    });

    if (enabledShows.length === 0) {
      console.log("ℹ️  No shows enabled for entry");
      return {
        success: true,
        message: "No shows enabled (all have num_tickets: 0)",
        results: [],
      };
    }

    console.log(`🎯 Will attempt to enter ${enabledShows.length} show(s)`);

    // Process each show
    for (const show of enabledShows) {
      try {
        console.log(`\n🎭 Processing show: ${show.name}`);

        // Find the show card on the page
        // Shows are in div.showBlockParent elements containing the show name and "New York"
        const showCard = page
          .locator("div.showBlockParent")
          .filter({ hasText: new RegExp(show.name, "i") })
          .filter({ hasText: /New York/i })
          .first();

        const showVisible = await showCard.isVisible({ timeout: 5000 }).catch(() => false);

        if (!showVisible) {
          console.log(`⚠️  Could not find show: ${show.name}`);
          results.push({
            show: show.name,
            success: false,
            message: "Show not found on lottery page",
          });
          continue;
        }

        // Click on the show card to navigate to its lottery page
        console.log(`🖱️  Clicking on ${show.name}...`);
        await showCard.click();
        await page.waitForTimeout(3000);

        // Now we should be on the show's lottery entry page
        console.log("📅 Selecting performances...");

          // Find all date sections (e.g., "Tuesday, November 25, 2025")
        // Use a more specific selector for the date text div
        const dateElements = await page.locator('div[class*="text-18"]').filter({ hasText: /^\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/ }).all();
        console.log(`   Found ${dateElements.length} date element(s)`);

        let selectedCount = 0;
        for (const dateElement of dateElements) {
          const dateText = await dateElement.textContent();
          if (!dateText) continue;

          const weekend = isWeekend(dateText);
          console.log(`   Checking date: ${dateText.trim()} (${weekend ? "weekend" : "weekday"})`);

          // Find the row containing this date
          // The date div is inside: div -> div -> div.border-b
          // We can look for the closest parent with border-b class
          const dateRow = dateElement.locator('xpath=ancestor::div[contains(@class, "border-b")]').first();
          
          // Check if we found the row
          const rowVisible = await dateRow.isVisible().catch(() => false);
          if (!rowVisible) {
            console.log("     ⚠️ Could not find date row container");
            continue;
          }

          // Find time labels (checkbox labels)
          const timeLabels = await dateRow.locator('label').all();
          console.log(`     Found ${timeLabels.length} time label(s)`);

          for (const label of timeLabels) {
            const labelText = await label.textContent();
            if (!labelText) continue;
            
            const timeStr = labelText.trim();
            console.log(`     Found time: "${timeStr}"`);

            // Check if we should select this time
            const shouldSelect = weekend || isEveningShow(timeStr);

            if (shouldSelect) {
              console.log(`     ✓ Selecting: ${timeStr}`);
              // Check if the checkbox is already checked
              const inputId = await label.getAttribute("for");
              if (inputId) {
                const isChecked = await page.locator(`#${inputId}`).isChecked().catch(() => false);
                if (!isChecked) {
                  await label.click();
                  selectedCount++;
                  await page.waitForTimeout(300);
                } else {
                  console.log(`       (Already selected)`);
                  selectedCount++;
                }
              } else {
                // Fallback if no for attribute
                await label.click();
                selectedCount++;
                await page.waitForTimeout(300);
              }
            } else {
              console.log(`     ⊗ Skipping: ${timeStr} (not evening)`);
            }
          }
        }

        if (selectedCount === 0) {
          console.log("⚠️  No performances selected");
          results.push({
            show: show.name,
            success: false,
            message: "No valid performances found",
          });
          // Go back to home page
          await page.goto("https://www.luckyseat.com/home", { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(2000);
          continue;
        }

        console.log(`✅ Selected ${selectedCount} performance(s)`);

        // Scroll down to find ticket selector
        await page.evaluate(() => window.scrollBy(0, 300));
        await page.waitForTimeout(1000);

        // Select number of tickets
        const numTickets = show.num_tickets ?? parseInt(userInfo.numberOfTickets);
        console.log(`🎫 Selecting ${numTickets} ticket(s)...`);

        // Find the ticket input
        const ticketInput = page.locator('.form-number input[type="number"]').first();
        
        // Get current value
        const currentValue = await ticketInput.inputValue().catch(() => "0");
        const currentNum = parseInt(currentValue || "0");

        console.log(`   Current tickets: ${currentNum}, target: ${numTickets}`);

        if (currentNum < numTickets) {
          // Click + button
          const plusButton = page.locator('.form-number-plus').first();
          const clicksNeeded = numTickets - currentNum;
          for (let i = 0; i < clicksNeeded; i++) {
            await plusButton.click();
            await page.waitForTimeout(300);
          }
        } else if (currentNum > numTickets) {
          // Click - button
          const minusButton = page.locator('.form-number-minus').first();
          const clicksNeeded = currentNum - numTickets;
          for (let i = 0; i < clicksNeeded; i++) {
            await minusButton.click();
            await page.waitForTimeout(300);
          }
        }

        console.log(`✅ Tickets set to ${numTickets}`);

        // Scroll to CAPTCHA
        await page.evaluate(() => window.scrollBy(0, 300));
        await page.waitForTimeout(1000);

        // --- Begin automated reCAPTCHA solving using 2Captcha ---
        console.log("🤖 Solving CAPTCHA via 2Captcha...");
        
        // First, click the reCAPTCHA checkbox to trigger the challenge
        console.log("   Clicking reCAPTCHA checkbox...");
        try {
          const captchaFrame = page.frameLocator('iframe[src*="recaptcha/api2/anchor"]').first();
          const checkbox = captchaFrame.locator('.recaptcha-checkbox-border').first();
          await checkbox.waitFor({ state: 'visible', timeout: 5000 });
          await checkbox.click();
          await page.waitForTimeout(2000);
          console.log("   ✓ Checkbox clicked");
        } catch (e) {
          console.log(`   ⚠️ Could not click checkbox: ${e}`);
        }
        
        // Retrieve site‑key from the reCAPTCHA iframe src URL
        let siteKey: string | null = null;
        try {
          const iframeSrc = await page.locator('iframe[src*="recaptcha/api2/anchor"]').first().getAttribute('src');
          if (iframeSrc) {
            const match = iframeSrc.match(/[?&]k=([^&]+)/);
            if (match) {
              siteKey = match[1];
              console.log(`   Found site-key: ${siteKey}`);
            }
          }
        } catch (e) {
          console.log(`   Error extracting site-key: ${e}`);
        }
        
        if (!siteKey) {
          console.log('⚠️  Could not locate reCAPTCHA site‑key');
          results.push({ show: show.name, success: false, message: 'CAPTCHA site‑key missing' });
          await page.goto('https://www.luckyseat.com/home', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          continue;
        }
        const apiKey = process.env.CAPTCHA_API_KEY;
        if (!apiKey) {
          console.log('⚠️  CAPTCHA_API_KEY not set in environment');
          results.push({ show: show.name, success: false, message: 'CAPTCHA API key missing' });
          await page.goto('https://www.luckyseat.com/home', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          continue;
        }
        try {
          const token = await solveRecaptcha(siteKey, page.url(), apiKey);
          // Inject token into the hidden response field
          await page.evaluate((t) => {
            const el = document.getElementById('g-recaptcha-response') as HTMLInputElement | null;
            if (el) {
              el.value = t;
            } else {
              const textarea = document.createElement('textarea');
              textarea.id = 'g-recaptcha-response';
              textarea.name = 'g-recaptcha-response';
              textarea.style.display = 'none';
              textarea.value = t;
              document.body.appendChild(textarea);
            }
          }, token);
          console.log('✅ CAPTCHA token obtained and injected');
        } catch (e) {
          console.log(`❌ Failed to solve CAPTCHA via 2Captcha: ${e}`);
          results.push({ show: show.name, success: false, message: '2Captcha solving failed' });
          await page.goto('https://www.luckyseat.com/home', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          continue;
        }
        // --- End automated reCAPTCHA solving ---

        // Check for cookie banner and dismiss it
        const cookieButton = page.locator('app-cookie-policy button').first();
        if (await cookieButton.isVisible().catch(() => false)) {
          console.log("🍪 Dismissing cookie banner...");
          await cookieButton.click({ force: true });
          await page.waitForTimeout(1000);
        }

        // Click Submit Entry button
        console.log("📮 Submitting entry...");
        const submitButton = page.locator('button:has-text("Submit Entry")').first();
        const submitVisible = await submitButton.isVisible({ timeout: 5000 }).catch(() => false);

        if (!submitVisible) {
          console.log("❌ Submit button not found");
          results.push({
            show: show.name,
            success: false,
            message: "Submit button not found",
          });
          // Go back to home page
          await page.goto("https://www.luckyseat.com/home", { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(2000);
          continue;
        }

        // Use force: true to bypass any overlays
        await submitButton.click({ force: true });
        await page.waitForTimeout(3000);

        // Check for confirmation modal (Review Your Selection)
        console.log("🔎 Checking for confirmation modal...");
        
        // The confirmation button is an <a> tag with class c-btn, not a <button>
        let confirmButton = page.locator('a.c-btn:has-text("Confirm")').first();
        let confirmVisible = await confirmButton.isVisible({ timeout: 5000 }).catch(() => false);
        
        if (!confirmVisible) {
          // Try looking for the modal itself
          const modal = page.locator('app-entry-review, [role="dialog"]').first();
          if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log("   Found modal, looking for confirm button...");
            confirmButton = modal.locator('a.c-btn').last(); // Last button is usually Confirm
            confirmVisible = await confirmButton.isVisible({ timeout: 1000 }).catch(() => false);
          }
        }
        
        if (confirmVisible) {
          console.log("✅ Confirmation modal found. Clicking Confirm & Submit...");
          await confirmButton.click({ force: true });
          await page.waitForTimeout(3000);
          console.log("✅ Confirmation button clicked");
        } else {
          console.log("ℹ️  No confirmation modal found (may have auto-submitted)");
        }

        // Check for success/error messages
        const confirmationText = (await page.textContent("body").catch(() => "")) || "";
        const confirmationLower = confirmationText.toLowerCase();

        if (
          confirmationLower.includes("success") ||
          confirmationLower.includes("submitted") ||
          confirmationLower.includes("good luck") ||
          confirmationLower.includes("entered")
        ) {
          console.log(`✅ Successfully entered lottery for ${show.name}`);
          results.push({
            show: show.name,
            success: true,
            message: "Successfully entered lottery",
          });
        } else if (
          confirmationLower.includes("error") ||
          confirmationLower.includes("failed") ||
          confirmationLower.includes("sorry")
        ) {
          console.log(`❌ Error entering lottery for ${show.name}`);
          results.push({
            show: show.name,
            success: false,
            message: "Error occurred during submission",
          });
        } else {
          console.log(`⚠️  Unclear submission status for ${show.name}`);
          results.push({
            show: show.name,
            success: true,
            message: "Submission completed (status unclear)",
          });
        }

        // Navigate back to home page for next show
        await page.goto("https://www.luckyseat.com/home", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);
      } catch (error) {
        console.log(`❌ Error processing ${show.name}: ${error}`);
        results.push({
          show: show.name,
          success: false,
          message: `Error: ${error}`,
        });

        // Try to recover by going back to home page
        try {
          await page.goto("https://www.luckyseat.com/home", { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(2000);
        } catch {
          // Ignore recovery errors
        }
      }
    }

    return {
      success: results.some(r => r.success),
      message: results.length > 0 ? `Processed ${results.length} show(s)` : "No shows processed",
      results,
    };
  } catch (error) {
    console.log(`❌ Error entering lotteries: ${error}`);
    return {
      success: false,
      message: `Error: ${error}`,
      results: [],
    };
  }
}

/**
 * Main function to enter Lucky Seat lottery
 */
export async function luckyseat({
  browser,
  userInfo,
  login,
  shows,
}: {
  browser: Browser;
  userInfo: UserInfo;
  login: TelechargeLogin;
  shows: Array<{ name: string; num_tickets?: number }>;
}): Promise<LotteryResult> {
  // Create a context with realistic browser settings to avoid bot detection
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });
  
  const page = await context.newPage();

  try {
    // Step 1: Login
    const loginResult = await loginToLuckySeat(page, login);
    if (!loginResult.success) {
      return {
        success: false,
        message: loginResult.message || "Failed to login to Lucky Seat",
        reason: "failed",
      };
    }

    // Step 2: Navigate to lottery page
    const navResult = await navigateToLotteryPage(page);
    if (!navResult.success) {
      return {
        success: false,
        message: navResult.message || "Could not navigate to lottery page",
        reason: "failed",
      };
    }

    // Step 3: Enter lotteries
    const entryResult = await enterLotteries(page, userInfo, shows);

    if (entryResult.results.length === 0) {
      return {
        success: false,
        message: entryResult.message,
        reason: "closed",
      };
    }

    const successCount = entryResult.results.filter((r) => r.success).length;
    const totalCount = entryResult.results.length;

    if (successCount === totalCount) {
      return {
        success: true,
        message: `Successfully entered ${successCount}/${totalCount} lotteries`,
        reason: "submitted",
      };
    } else if (successCount > 0) {
      return {
        success: true,
        message: `Entered ${successCount}/${totalCount} lotteries (some failed)`,
        reason: "submitted",
      };
    } else {
      return {
        success: false,
        message: entryResult.message,
        reason: "failed",
      };
    }
  } catch (error) {
    console.log(`❌ Error in Lucky Seat lottery: ${error}`);
    return {
      success: false,
      message: `Error: ${error}`,
      reason: "error",
    };
  } finally {
    await context.close();
  }
}
