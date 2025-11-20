import type { Browser, Page } from "playwright";
import type { UserInfo, LotteryResult, TelechargeLogin } from "./types";

/**
 * Login to Telecharge
 * Returns the iframe context if successful
 */
async function loginToTelecharge(
  page: Page,
  login: TelechargeLogin
): Promise<{ success: boolean; iframe: any }> {
  try {
    console.log("🔐 Logging in to Telecharge...");

    // Navigate to the Telecharge rush/lottery page
    await page.goto("https://rush.telecharge.com/", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await handleCookieConsent(page);

    // Wait for the iframe to load (the actual content is in an iframe)
    console.log("🔍 Waiting for iframe to load...");
    const iframeSelector = 'iframe#st-window';
    
    // Wait for iframe element to exist
    await page.waitForSelector(iframeSelector, { timeout: 30000 });
    
    // Wait a bit for iframe to start loading
    await page.waitForTimeout(2000);

    // Get the iframe element and switch to it
    const iframeElement = await page.locator(iframeSelector).elementHandle();
    if (!iframeElement) {
      console.log("⚠️  Could not find iframe");
      return false;
    }

    const iframe = await iframeElement.contentFrame();
    if (!iframe) {
      console.log("⚠️  Could not access iframe content");
      return false;
    }

    console.log("✅ Iframe frame accessed, waiting for content to load...");
    
    // Wait for iframe content to load
    try {
      await iframe.waitForLoadState("networkidle", { timeout: 30000 });
    } catch {
      // If networkidle times out, try domcontentloaded
      await iframe.waitForLoadState("domcontentloaded", { timeout: 10000 });
    }
    
    await page.waitForTimeout(2000); // Additional wait for dynamic content
    console.log("✅ Iframe content loaded");

    // Click on "SIGN IN" link inside the iframe
    console.log("🔍 Looking for Sign In link in iframe...");
    const signInSelectors = [
      'a:has-text("Sign In")',
      'a#st_sign_in',
      'a[onclick*="st_campaign_login"]',
      'a:has-text("SIGN IN")',
    ];

    let signInClicked = false;
    for (const selector of signInSelectors) {
      try {
        const signInLink = iframe.locator(selector).first();
        const isVisible = await signInLink.isVisible({ timeout: 5000 }).catch(() => false);
        if (isVisible) {
          await signInLink.click();
          console.log("✅ Clicked Sign In link");
          signInClicked = true;
          // Wait for modal to appear
          await page.waitForTimeout(2000);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!signInClicked) {
      console.log("⚠️  Could not find Sign In link in iframe");
      return { success: false, iframe: null };
    }

    // Wait for login modal to be visible in the iframe
    console.log("🔍 Waiting for login modal...");
    const modalSelectors = [
      '#st_login_container',
      '#st_campaign_login_email',
      'input#login_email',
    ];

    let modalVisible = false;
    for (const selector of modalSelectors) {
      try {
        const modal = iframe.locator(selector).first();
        await modal.waitFor({ state: "visible", timeout: 5000 });
        modalVisible = true;
        break;
      } catch {
        continue;
      }
    }

    if (!modalVisible) {
      console.log("⚠️  Login modal did not appear");
      return { success: false, iframe: null };
    }

    await page.waitForTimeout(1000); // Give modal time to fully render

    // Find and fill email field in the modal (inside iframe)
    console.log("🔍 Looking for email field in iframe...");
    const emailField = iframe.locator('input#login_email').first();
    const emailVisible = await emailField.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!emailVisible) {
      console.log("⚠️  Could not find email field in login modal");
      return { success: false, iframe: null };
    }

    await emailField.fill(login.email);
    console.log("✅ Filled email field");

    // Find and fill password field (inside iframe)
    console.log("🔍 Looking for password field in iframe...");
    const passwordField = iframe.locator('input#password').first();
    const passwordVisible = await passwordField.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!passwordVisible) {
      console.log("⚠️  Could not find password field in login modal");
      return { success: false, iframe: null };
    }

    await passwordField.fill(login.password);
    console.log("✅ Filled password field");

    // Submit login form - the button has id='get-started-button' and onclick submits the form (inside iframe)
    console.log("🔍 Looking for login submit button in iframe...");
    const submitButton = iframe.locator('#get-started-button').first();
    const submitVisible = await submitButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!submitVisible) {
      console.log("⚠️  Could not find submit button in login modal");
      return { success: false, iframe: null };
    }

    await submitButton.click();
    console.log("✅ Clicked login button");
    
    // Wait for login to process
    await page.waitForTimeout(3000);
    await iframe.waitForLoadState("networkidle", { timeout: 30000 });

    // Check if login was successful (check iframe content)
    const pageText = (await iframe.textContent("body").catch(() => "")) || "";
    const lowerText = pageText.toLowerCase();

    const loginFailed =
      lowerText.includes("invalid") ||
      lowerText.includes("incorrect") ||
      lowerText.includes("error") ||
      lowerText.includes("try again") ||
      lowerText.includes("password") && lowerText.includes("wrong");

    if (loginFailed) {
      console.log("❌ Login failed - invalid credentials or error");
      return { success: false, iframe: null };
    }

    // Check for success indicators - modal should close and we should see account/dashboard content (check iframe)
    const modalStillOpen = await iframe.locator('#st_login_container').isVisible({ timeout: 2000 }).catch(() => false);
    
    if (modalStillOpen) {
      console.log("⚠️  Login modal still open - login may have failed");
      return { success: false, iframe: null };
    }

    // Check for success indicators
    const loginSuccess =
      !lowerText.includes("sign in") ||
      !lowerText.includes("login") ||
      lowerText.includes("welcome") ||
      lowerText.includes("account") ||
      lowerText.includes("dashboard") ||
      lowerText.includes("stats");

    if (loginSuccess) {
      console.log("✅ Successfully logged in to Telecharge");
      return { success: true, iframe };
    }

    // If we can't determine, assume success if modal closed
    console.log("✅ Login appears successful (modal closed)");
    return { success: true, iframe };
  } catch (error) {
    console.log(`❌ Error during login: ${error}`);
    return { success: false, iframe: null };
  }
}

/**
 * Handle cookie consent on Telecharge pages
 */
async function handleCookieConsent(page: Page): Promise<void> {
  console.log("🍪 Checking for cookie consent banners...");

  const acceptButtonSelectors = [
    'button:has-text("ACCEPT")',
    'button:has-text("Accept")',
    '[role="button"]:has-text("ACCEPT")',
    'a:has-text("ACCEPT")',
  ];

  for (const selector of acceptButtonSelectors) {
    try {
      const button = page.locator(selector).first();
      const isVisible = await button.isVisible({ timeout: 1000 }).catch(() => false);
      if (isVisible) {
        await button.click({ force: true, timeout: 2000 });
        console.log(`✅ Clicked cookie accept button`);
        await page.waitForTimeout(500);
        return;
      }
    } catch {
      continue;
    }
  }
}

/**
 * Check if lottery is open for a show
 */
async function checkLotteryStatus(page: Page): Promise<{ isOpen: boolean; lotteryUrl?: string }> {
  const pageText = (await page.textContent("body").catch(() => "")) || "";
  const lowerText = pageText.toLowerCase();

  // Check if lottery is closed - look for specific Telecharge closed message
  const isClosed =
    lowerText.includes("we're sorry! no drawings are available at this time") ||
    lowerText.includes("no drawings are available at this time") ||
    lowerText.includes("please check back at midnight for more drawings") ||
    lowerText.includes("lottery is closed") ||
    lowerText.includes("lottery has closed") ||
    lowerText.includes("no longer accepting entries") ||
    lowerText.includes("entries are closed") ||
    lowerText.includes("lottery closed");

  if (isClosed) {
    return { isOpen: false };
  }

  // Look for lottery entry links
  const lotterySelectors = [
    'a[href*="lottery"]',
    'a[href*="enter"]',
    'a:has-text("Enter Lottery")',
    'a:has-text("Lottery")',
    'button:has-text("Enter Lottery")',
  ];

  for (const selector of lotterySelectors) {
    try {
      const elements = await page.locator(selector).all();
      for (const element of elements) {
        const href = await element.getAttribute("href");
        const text = (await element.textContent())?.toLowerCase() || "";
        if (href && ("lottery" in href.toLowerCase() || "enter" in href.toLowerCase())) {
          if ("lottery" in text || "enter" in text) {
            // Resolve relative URLs
            const fullUrl = href.startsWith("http") ? href : new URL(href, page.url()).href;
            return { isOpen: true, lotteryUrl: fullUrl };
          }
        }
      }
    } catch {
      continue;
    }
  }

  // Check page text for open indicators
  const isOpen =
    lowerText.includes("enter lottery") ||
    lowerText.includes("lottery open") ||
    lowerText.includes("enter now");

  return { isOpen: isOpen && !isClosed };
}

/**
 * Fill in the lottery entry form
 */
async function fillLotteryForm(page: Page, userInfo: UserInfo): Promise<boolean> {
  try {
    // Wait for form to be ready
    await page.waitForLoadState("networkidle", { timeout: 30000 });

    // Try to find and fill form fields with multiple selector strategies
    const fieldMappings = [
      {
        name: "firstName",
        selectors: [
          'input[name="firstName"]',
          'input[name="first_name"]',
          'input[id*="firstName"]',
          'input[id*="first_name"]',
          'input[placeholder*="First"]',
        ],
        value: userInfo.firstName,
      },
      {
        name: "lastName",
        selectors: [
          'input[name="lastName"]',
          'input[name="last_name"]',
          'input[id*="lastName"]',
          'input[id*="last_name"]',
          'input[placeholder*="Last"]',
        ],
        value: userInfo.lastName,
      },
      {
        name: "email",
        selectors: [
          'input[name="email"]',
          'input[type="email"]',
          'input[id*="email"]',
          'input[placeholder*="email"]',
        ],
        value: userInfo.email,
      },
      {
        name: "zip",
        selectors: [
          'input[name="zip"]',
          'input[name="zipCode"]',
          'input[id*="zip"]',
          'input[placeholder*="zip"]',
        ],
        value: userInfo.zip,
      },
    ];

    // Fill text fields
    for (const field of fieldMappings) {
      let filled = false;
      for (const selector of field.selectors) {
        try {
          const element = page.locator(selector).first();
          const isVisible = await element.isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            await element.fill(field.value);
            filled = true;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!filled) {
        console.log(`⚠️  Could not find ${field.name} field`);
      }
    }

    // Fill number of tickets (select dropdown)
    const ticketSelectors = [
      'select[name="numTickets"]',
      'select[name="tickets"]',
      'select[id*="tickets"]',
    ];
    for (const selector of ticketSelectors) {
      try {
        const select = page.locator(selector).first();
        const isVisible = await select.isVisible({ timeout: 2000 }).catch(() => false);
        if (isVisible) {
          await select.selectOption(userInfo.numberOfTickets);
          break;
        }
      } catch {
        continue;
      }
    }

    // Fill date of birth
    const dob = userInfo.dateOfBirth;
    const dobSelectors = {
      month: [
        'select[name="dobMonth"]',
        'select[name="month"]',
        'select[id*="month"]',
      ],
      day: ['select[name="dobDay"]', 'select[name="day"]', 'select[id*="day"]'],
      year: ['select[name="dobYear"]', 'select[name="year"]', 'select[id*="year"]'],
    };

    for (const [part, selectors] of Object.entries(dobSelectors)) {
      const value = dob[part as keyof typeof dob];
      for (const selector of selectors) {
        try {
          const select = page.locator(selector).first();
          const isVisible = await select.isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            await select.selectOption(value);
            break;
          }
        } catch {
          continue;
        }
      }
    }

    return true;
  } catch (error) {
    console.log(`❌ Error filling form: ${error}`);
    return false;
  }
}

/**
 * Submit the lottery form
 */
async function submitForm(page: Page): Promise<boolean> {
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit")',
    'button:has-text("Enter")',
    'button:has-text("Submit Entry")',
    '.submit-button',
  ];

  for (const selector of submitSelectors) {
    try {
      const button = page.locator(selector).first();
      const isVisible = await button.isVisible({ timeout: 2000 }).catch(() => false);
      if (isVisible) {
        await button.click();
        await page.waitForTimeout(2000); // Wait for submission
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * Main function to enter Telecharge lottery for a show
 */
export async function telecharge({
  browser,
  userInfo,
  login,
  url,
}: {
  browser: Browser;
  userInfo: UserInfo;
  login: TelechargeLogin;
  url: string;
}): Promise<LotteryResult> {
  const page = await browser.newPage();

  try {
    // Login first - returns iframe context
    const loginResult = await loginToTelecharge(page, login);
    if (!loginResult.success) {
      return {
        success: false,
        message: "Failed to login to Telecharge",
        reason: "failed",
      };
    }

    const iframe = loginResult.iframe;
    if (!iframe) {
      return {
        success: false,
        message: "Could not access iframe after login",
        reason: "failed",
      };
    }

    // Wait for iframe to be ready after login
    await iframe.waitForLoadState("networkidle", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Look for "Enter the lottery" image/button in the iframe
    // The image is wrapped in a link: <a href="/st/lottery_select/?key=BROADWAY&source=iframe">
    // Image has class: st_block_slider_no_header
    console.log("🔍 Looking for 'Enter the lottery' button/image...");
    const enterLotterySelectors = [
      'a[href*="lottery_select"]',
      'a[href*="/st/lottery_select/"]',
      'a:has(img.st_block_slider_no_header)',
      'a:has(img[src*="20241029183713_BROADWAY_Mg4oAH2dfxW7SXP0.jpg"])',
      'a:has(img[src*="BROADWAY_Mg4oAH2dfxW7SXP0"])',
      'img.st_block_slider_no_header',
      'img[src*="20241029183713_BROADWAY_Mg4oAH2dfxW7SXP0.jpg"]',
      'img[src*="BROADWAY_Mg4oAH2dfxW7SXP0"]',
      'img[alt*="Enter the lottery"]',
      'img[alt*="Enter Lottery"]',
      'img[alt*="enter the lottery"]',
      'a:has(img[alt*="Enter the lottery"])',
      'a:has(img[alt*="Enter Lottery"])',
      'a:has-text("Enter the lottery")',
      'a:has-text("Enter Lottery")',
      'button:has-text("Enter the lottery")',
      'button:has-text("Enter Lottery")',
      '[alt*="Enter the lottery"]',
      '[alt*="Enter Lottery"]',
    ];

    let enterLotteryClicked = false;
    for (const selector of enterLotterySelectors) {
      try {
        const element = iframe.locator(selector).first();
        const isVisible = await element.isVisible({ timeout: 5000 }).catch(() => false);
        if (isVisible) {
          // If it's an image, try to find its parent link first
          const tagName = await element.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
          if (tagName === "img") {
            // Try to find parent link (the <a> tag wrapping the image)
            try {
              const parentLink = element.locator("xpath=ancestor::a[1]").first();
              const linkVisible = await parentLink.isVisible({ timeout: 1000 }).catch(() => false);
              if (linkVisible) {
                await parentLink.click();
                console.log("✅ Clicked 'Enter the lottery' link (parent of image)");
                enterLotteryClicked = true;
                await iframe.waitForTimeout(2000);
                break;
              }
            } catch {
              // If parent link not found, click the image itself
            }
            await element.click();
            console.log("✅ Clicked 'Enter the lottery' image");
          } else {
            await element.click();
            console.log("✅ Clicked 'Enter the lottery' button/link");
          }
          enterLotteryClicked = true;
          await iframe.waitForTimeout(2000);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!enterLotteryClicked) {
      console.log("⚠️  Could not find 'Enter the lottery' button/image, trying to navigate to show URL...");
      // If we can't find the button, try navigating to the show URL
      // But the show URL might be on a different domain, so we might need to navigate the main page
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      await handleCookieConsent(page);
    }

    // Check if lottery is open (check iframe if we're still in it, otherwise check main page)
    const checkPage = enterLotteryClicked ? iframe : page;
    const { isOpen, lotteryUrl } = await checkLotteryStatus(checkPage);

    if (!isOpen) {
      console.log("ℹ️  Lottery is closed or not available");
      return {
        success: false,
        message: "Lottery is closed or not available",
        reason: "closed",
      };
    }

    // Navigate to lottery entry page if we found a URL
    // If we clicked "Enter the lottery", we might already be on the form page
    if (lotteryUrl && !enterLotteryClicked) {
      console.log(`🔗 Navigating to lottery entry page: ${lotteryUrl}`);
      await page.goto(lotteryUrl, { waitUntil: "networkidle", timeout: 60000 });
      await handleCookieConsent(page);
    }

    // Wait a bit for form to appear (might be in iframe or main page)
    await page.waitForTimeout(2000);

    // Fill in the form (check iframe first, then main page)
    let formFilled = false;
    if (iframe) {
      formFilled = await fillLotteryForm(iframe, userInfo);
    }
    if (!formFilled) {
      formFilled = await fillLotteryForm(page, userInfo);
    }
    if (!formFilled) {
      return {
        success: false,
        message: "Could not fill lottery form",
        reason: "failed",
      };
    }

    // Submit the form (check iframe first, then main page)
    let submitted = false;
    if (iframe) {
      submitted = await submitForm(iframe);
    }
    if (!submitted) {
      submitted = await submitForm(page);
    }
    if (!submitted) {
      return {
        success: false,
        message: "Could not submit lottery form",
        reason: "failed",
      };
    }

    // Check for success indicators (check iframe first, then main page)
    await page.waitForTimeout(2000);
    let pageText = "";
    if (iframe) {
      pageText = (await iframe.textContent("body").catch(() => "")) || "";
    }
    if (!pageText) {
      pageText = (await page.textContent("body").catch(() => "")) || "";
    }
    const lowerText = pageText.toLowerCase();

    const hasSuccess =
      lowerText.includes("thank you") ||
      lowerText.includes("entry received") ||
      lowerText.includes("successfully entered") ||
      lowerText.includes("entry submitted");

    if (hasSuccess) {
      console.log("✅ Lottery entry submitted successfully");
      return {
        success: true,
        message: "Lottery entry submitted successfully",
        reason: "submitted",
      };
    }

    // If we can't confirm success, assume it worked if we got this far
    return {
      success: true,
      message: "Lottery entry submitted (confirmation unclear)",
      reason: "submitted",
    };
  } catch (error) {
    console.log(`❌ Error entering lottery: ${error}`);
    return {
      success: false,
      message: `Error: ${error}`,
      reason: "error",
    };
  } finally {
    await page.close();
  }
}

