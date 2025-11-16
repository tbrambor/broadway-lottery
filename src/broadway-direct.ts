export type LotteryResult = {
  success: boolean;
  message: string;
  reason?: "closed" | "no_entries" | "submitted" | "failed" | "error";
};

export async function broadwayDirect({ browser, userInfo, url }): Promise<LotteryResult> {
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

  // Check for "Enter Now" or "Enter" links - these indicate open lotteries
  const links = await page.getByRole("link", { name: /Enter/i }).all();
  console.log(`🔍 Found ${links.length} "Enter" link(s) on the page`);
  
  const hrefs = await Promise.all(
    links.map((link) => link.getAttribute("href"))
  ).catch(() => []);

  // Filter out null/empty hrefs
  const validHrefs = hrefs.filter((href) => href && href.trim() !== "");
  console.log(`🔍 Found ${validHrefs.length} valid entry link(s) after filtering`);

  if (validHrefs.length === 0) {
    // Check page content to see if all lotteries are closed
    const pageText = await page.textContent("body").catch(() => "");
    const lowerText = (pageText || "").toLowerCase();
    
    // Check for closed lottery indicators in the page
    const hasClosedStatus = 
      lowerText.includes("closed") && 
      (lowerText.includes("lottery status") || lowerText.includes("status"));
    
    // Check if there are any "Upcoming" or "Opens" entries
    const hasUpcoming = 
      lowerText.includes("upcoming") || 
      lowerText.includes("opens") ||
      lowerText.includes("open now");

    console.log(`🔍 Page analysis: hasClosedStatus=${hasClosedStatus}, hasUpcoming=${hasUpcoming}`);

    if (hasClosedStatus && !hasUpcoming) {
      console.log("ℹ️  All lotteries are closed - no entry links available");
      await page.close();
      return {
        success: false,
        message: "All lotteries are closed",
        reason: "closed",
      };
    } else {
      console.log("ℹ️  No entry links found - lottery may be closed or not available");
      await page.close();
      return {
        success: false,
        message: "No entry links found",
        reason: "no_entries",
      };
    }
  }

  console.log(`✅ Found ${validHrefs.length} open lottery entry link(s) - proceeding with submission`);

  let submissionSuccess = false;
  let submissionError: string | undefined;
  let allEntriesClosed = true;
  let attemptedSubmissions = 0;

  // Try to find "Enter Now" buttons/links on the current page (they may open modals)
  // Based on the HTML, these are links with class "enter-lottery-link" or "enter-button"
  // They have hrefs like: /enter-lottery/?lottery=XXX&window=popup
  
  // Strategy 1: Find by CSS class (most reliable)
  const enterLotteryLinks = await page.locator('a.enter-lottery-link, a.enter-button').all().catch(() => []);
  
  // Strategy 2: Find by role and name
  const enterNowButtons = await page.getByRole("button", { name: /Enter Now/i }).all().catch(() => []);
  const enterNowLinks = await page.getByRole("link", { name: /Enter Now/i }).all().catch(() => []);
  
  // Strategy 3: Find links with "Enter" text that aren't disabled
  const enterLinksByText = await page.locator('a:has-text("Enter")').all().catch(() => []);
  
  // Combine all potential elements
  const allEnterNowElements = [...enterLotteryLinks, ...enterNowButtons, ...enterNowLinks, ...enterLinksByText];
  
  // Filter out any buttons/links that are disabled or have "Closed" or "Upcoming" text
  const filteredEnterNowElements = [];
  for (const element of allEnterNowElements) {
    try {
      const text = await element.textContent().catch(() => "");
      const href = await element.getAttribute("href").catch(() => "");
      const classes = await element.getAttribute("class").catch(() => "");
      const isDisabled = await element.isDisabled().catch(() => false);
      const ariaDisabled = await element.getAttribute("aria-disabled").catch(() => null);
      const isVisible = await element.isVisible().catch(() => false);
      
      // Check if it's disabled
      const disabled = isDisabled || ariaDisabled === "true";
      
      // Check if it's a closed/upcoming button by class or text
      const isClosed = classes?.includes("closed-button") || classes?.includes("upcoming-button") || 
                       classes?.includes("dlslot-disabled") ||
                       text?.toLowerCase().includes("closed") || 
                       text?.toLowerCase().includes("upcoming");
      
      // Check if href contains enter-lottery (indicates it's an active entry link)
      const isEntryLink = href?.includes("enter-lottery") || classes?.includes("enter-lottery-link");
      
      // Only include if it's visible, not disabled, and is an entry link (or contains "Enter")
      if (isVisible && !disabled && !isClosed && (isEntryLink || (text && /Enter/i.test(text)))) {
        filteredEnterNowElements.push(element);
      }
    } catch {
      // If we can't check, skip it to avoid false positives
      continue;
    }
  }
  
  // Also try to find buttons/inputs with "Enter" in their label or value (but prioritize "Enter Now")
  const enterButtons = await page.getByLabel(/Enter/i).all().catch(() => []);
  const enterInputs = await page.locator('input[type="submit"][value*="Enter"], button:has-text("Enter")').all().catch(() => []);
  const allEnterElements = [...enterButtons, ...enterInputs];
  
  // Filter enter elements to exclude "Closed" buttons
  const filteredEnterElements = [];
  for (const element of allEnterElements) {
    try {
      const text = await element.textContent().catch(() => "");
      const value = await element.getAttribute("value").catch(() => "");
      const isDisabled = await element.isDisabled().catch(() => false);
      const isVisible = await element.isVisible().catch(() => false);
      
      // Exclude if it says "Closed" or "Upcoming"
      const textToCheck = (text || value || "").toLowerCase();
      if (isVisible && !isDisabled && !textToCheck.includes("closed") && !textToCheck.includes("upcoming")) {
        filteredEnterElements.push(element);
      }
    } catch {
      // If we can't check, skip it to avoid duplicates
      continue;
    }
  }

  // Combine potential entry triggers, prioritizing "Enter Now" buttons
  const entryTriggers = [...filteredEnterNowElements, ...filteredEnterElements];
  
  console.log(`🔍 Found ${entryTriggers.length} valid entry trigger(s) on page (${filteredEnterNowElements.length} "Enter Now" buttons)`);

  // If we have entry triggers on the page, try clicking them to open modals
  // Otherwise, navigate to the hrefs as before
  const useModalApproach = entryTriggers.length > 0;
  
  if (useModalApproach) {
    console.log("📋 Using modal approach - clicking buttons/links to open forms");
    
    for (let i = 0; i < entryTriggers.length; i++) {
      const trigger = entryTriggers[i];
      if (!trigger) continue;
      
      console.log(`\n📝 Processing entry ${i + 1} of ${entryTriggers.length}...`);
      
      try {
        // Always dismiss cookie banner first (it can reappear)
        const cookieBanner = page.locator("#cookie-information-template-wrapper");
        const isCookieBannerVisible = await cookieBanner.isVisible().catch(() => false);
        if (isCookieBannerVisible) {
          console.log("🍪 Dismissing cookie banner before clicking entry trigger...");
          // Try clicking accept button first
          try {
            const acceptButton = cookieBanner.getByRole("button", { name: /accept|agree|ok|got it|continue/i });
            if (await acceptButton.isVisible({ timeout: 1000 }).catch(() => false)) {
              await acceptButton.click({ force: true });
              await page.waitForTimeout(300);
            }
          } catch {
            // Continue to force hide
          }
          
          // Force hide via JavaScript
          await page.evaluate(() => {
            const banner = document.getElementById("cookie-information-template-wrapper");
            if (banner) {
              banner.style.display = "none";
              banner.style.visibility = "hidden";
              banner.style.opacity = "0";
              banner.style.pointerEvents = "none";
              banner.remove();
            }
          });
          await page.waitForTimeout(300);
        }
        
        // Scroll into view and click to open modal
        await trigger.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        
        // Dismiss cookie banner again right before clicking (it might have reappeared)
        const cookieBannerStillVisible = await cookieBanner.isVisible().catch(() => false);
        if (cookieBannerStillVisible) {
          await page.evaluate(() => {
            const banner = document.getElementById("cookie-information-template-wrapper");
            if (banner) {
              banner.style.display = "none";
              banner.style.visibility = "hidden";
              banner.style.opacity = "0";
              banner.style.pointerEvents = "none";
              banner.remove();
            }
          });
          await page.waitForTimeout(200);
        }
        
        // Get the href before clicking (in case it's a link that navigates)
        const triggerHref = await trigger.getAttribute("href").catch(() => null);
        const isPopupLink = triggerHref?.includes("window=popup") || triggerHref?.includes("enter-lottery");
        const originalUrl = page.url();
        
        // Set up navigation promise if this is a link that might navigate
        let navigationPromise = null;
        if (isPopupLink && triggerHref) {
          // If it's a relative URL, make it absolute
          const fullUrl = triggerHref.startsWith("http") 
            ? triggerHref 
            : new URL(triggerHref, page.url()).toString();
          navigationPromise = page.waitForURL((url) => url.includes("enter-lottery") || url !== originalUrl, { timeout: 10000 }).catch(() => null);
        }
        
        // Click to open modal/popup - use force click to bypass any remaining interceptors
        await trigger.click({ force: true, timeout: 10000 }).catch(async () => {
          // If force click fails, try JavaScript click
          await trigger.evaluate((el) => {
            if (el instanceof HTMLElement) el.click();
          });
        });
        
        console.log(`✅ Clicked entry trigger ${i + 1}${isPopupLink ? " (popup link)" : ""}`);
        
        // Wait for either navigation (if popup link) or modal appearance
        if (navigationPromise) {
          try {
            await navigationPromise;
            console.log(`✅ Navigated to popup URL: ${page.url()}`);
            // Wait for page to load
            await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(1000);
          } catch {
            // Navigation didn't happen, might be a modal instead
          }
        }
        
        // Wait for modal to appear - look for common modal selectors
        const modalSelectors = [
          '[role="dialog"]',
          '.modal',
          '[class*="modal"]',
          '[class*="dialog"]',
          '[id*="modal"]',
          '[id*="dialog"]',
          '.popup',
          '[class*="popup"]',
        ];
        
        let modalFound = false;
        for (const selector of modalSelectors) {
          try {
            const modal = page.locator(selector).first();
            await modal.waitFor({ state: "visible", timeout: 5000 });
            modalFound = true;
            console.log(`✅ Modal appeared (selector: ${selector})`);
            break;
          } catch {
            continue;
          }
        }
        
        // Check if form fields are now visible (either in modal or on navigated page)
        const firstNameField = page.getByLabel("First Name");
        const isFormVisible = await firstNameField.isVisible({ timeout: 5000 }).catch(() => false);
        
        // Check if we navigated to a new URL
        const currentUrl = page.url();
        const urlChanged = currentUrl !== originalUrl && currentUrl.includes("enter-lottery");
        
        if (!modalFound && !isFormVisible && !urlChanged) {
          console.log("⚠️  Modal/form did not appear after clicking - trying to navigate to href");
          // Fall back to href navigation for this entry
          if (triggerHref) {
            const fullUrl = triggerHref.startsWith("http") 
              ? triggerHref 
              : new URL(triggerHref, page.url()).toString();
            await page.goto(fullUrl, { waitUntil: "networkidle", timeout: 60000 });
            await page.waitForTimeout(1000);
          } else if (i < validHrefs.length && validHrefs[i]) {
            await page.goto(validHrefs[i]!, { waitUntil: "networkidle", timeout: 60000 });
            await page.waitForTimeout(1000);
          } else {
            continue;
          }
        } else if (urlChanged) {
          console.log(`✅ Navigated to form page: ${currentUrl}`);
        }
      } catch (error) {
        console.warn(`⚠️  Failed to open modal with trigger ${i + 1}: ${error.message}`);
        // Fall back to href navigation
        if (i < validHrefs.length && validHrefs[i]) {
          await page.goto(validHrefs[i]!, { waitUntil: "networkidle", timeout: 60000 });
        } else {
          continue;
        }
      }
      
      // Now check if form is available (either in modal or on page)
    const formPageText = await page.textContent("body").catch(() => "");
    const lowerFormText = (formPageText || "").toLowerCase();
    
    const isFormPageClosed = 
      lowerFormText.includes("lottery is closed") ||
      lowerFormText.includes("lottery has closed") ||
      lowerFormText.includes("no longer accepting entries") ||
      lowerFormText.includes("entries are closed") ||
      lowerFormText.includes("lottery closed") ||
      lowerFormText.includes("entry period has ended");

    if (isFormPageClosed) {
        console.log("ℹ️  Lottery is closed - skipping entry");
        // Close modal if open
        try {
          const closeButton = page.locator('[aria-label*="close"], .modal-close, [class*="close"]').first();
          await closeButton.click({ timeout: 2000 }).catch(() => {});
        } catch {
          // Ignore
        }
      continue;
    }

      // Check if form fields are available
    const firstNameField = page.getByLabel("First Name");
    const isFormAvailable = await firstNameField.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!isFormAvailable) {
      console.log("ℹ️  Form is not available - lottery may be closed");
        // Close modal if open
        try {
          const closeButton = page.locator('[aria-label*="close"], .modal-close, [class*="close"]').first();
          await closeButton.click({ timeout: 2000 }).catch(() => {});
        } catch {
          // Ignore
        }
      continue;
    }

    // If we get here, we found an open entry form
    allEntriesClosed = false;
    attemptedSubmissions++;

    await firstNameField.waitFor({ timeout: 30000 });
    await page.getByLabel("First Name").fill(userInfo.firstName);
    await page.getByLabel("Last Name").fill(userInfo.lastName);
    await page
      .getByLabel("Qty of Tickets Requested")
      .selectOption(userInfo.numberOfTickets);
    await page.getByLabel("Email").fill(userInfo.email);

    // Enter Date of Birth
    await page.locator("#dlslot_dob_month").fill(userInfo.dateOfBirth.month);
    await page.locator("#dlslot_dob_day").fill(userInfo.dateOfBirth.day);
    await page.locator("#dlslot_dob_year").fill(userInfo.dateOfBirth.year);

    await page.getByLabel("Zip").fill(userInfo.zip);
    await page
      .getByLabel("Country of Residence")
      .selectOption({ label: userInfo.countryOfResidence });

    // Agree to terms
    await page.locator("#dlslot_agree").check({ force: true });

    // Set up error logging before form submission
    // Log JavaScript console errors
    page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error") {
        console.log(`🔴 Console error: ${msg.text()}`);
      }
    });

    // Log page errors
    page.on("pageerror", (error) => {
      console.log(`🔴 Page error: ${error.message}`);
    });

      // Handle cookie consent banner if present - do this more aggressively
    const cookieBanner = page.locator("#cookie-information-template-wrapper");
    const isCookieBannerVisible = await cookieBanner.isVisible().catch(() => false);
    if (isCookieBannerVisible) {
        console.log("🍪 Cookie banner detected - attempting to dismiss");
        // Try multiple strategies to dismiss the cookie banner
        try {
          // Strategy 1: Find and click an accept/agree button within the cookie banner
          const acceptButton = cookieBanner.getByRole("button", { name: /accept|agree|ok|got it|continue/i });
          const acceptButtonVisible = await acceptButton.isVisible({ timeout: 2000 }).catch(() => false);
      if (acceptButtonVisible) {
            await acceptButton.click({ force: true });
            console.log("✅ Clicked cookie banner accept button");
          }
        } catch (e) {
          // Strategy 2: Try clicking any button in the cookie banner
          try {
            const anyButton = cookieBanner.locator("button").first();
            if (await anyButton.isVisible({ timeout: 1000 }).catch(() => false)) {
              await anyButton.click({ force: true });
              console.log("✅ Clicked cookie banner button");
            }
          } catch (e2) {
            // Strategy 3: Try clicking a link in the cookie banner
            try {
              const anyLink = cookieBanner.locator("a").first();
              if (await anyLink.isVisible({ timeout: 1000 }).catch(() => false)) {
                await anyLink.click({ force: true });
                console.log("✅ Clicked cookie banner link");
              }
            } catch (e3) {
              // Strategy 4: Try to hide it via JavaScript
              try {
                await page.evaluate(() => {
                  const banner = document.getElementById("cookie-information-template-wrapper");
                  if (banner) {
                    banner.style.display = "none";
                    banner.remove();
                  }
                });
                console.log("✅ Removed cookie banner via JavaScript");
              } catch (e4) {
                console.warn("⚠️  Could not dismiss cookie banner");
              }
            }
          }
        }
        
        // Wait for banner to disappear or be hidden
        try {
          await cookieBanner.waitFor({ state: "hidden", timeout: 3000 });
          console.log("✅ Cookie banner is now hidden");
        } catch {
          // Try to verify it's actually gone by checking visibility
          const stillVisible = await cookieBanner.isVisible().catch(() => false);
          if (stillVisible) {
            // Force hide it via JavaScript
            await page.evaluate(() => {
              const banner = document.getElementById("cookie-information-template-wrapper");
              if (banner) {
                banner.style.display = "none";
                banner.style.visibility = "hidden";
                banner.style.opacity = "0";
                banner.style.pointerEvents = "none";
              }
            });
            console.log("✅ Force-hid cookie banner via JavaScript");
          }
        }
        
        // Wait a bit for any animations to complete
        await page.waitForTimeout(500);
      }

      // Check for and handle reCAPTCHA if present
      const recaptchaSelectors = [
        'iframe[src*="recaptcha"]',
        'iframe[title*="reCAPTCHA"]',
        '[class*="recaptcha"]',
        '[id*="recaptcha"]',
        '[data-sitekey]', // reCAPTCHA v2 site key
      ];
      
      let recaptchaDetected = false;
      let recaptchaIframe = null;
      
      for (const selector of recaptchaSelectors) {
        try {
          const element = page.locator(selector).first();
          const isVisible = await element.isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            recaptchaDetected = true;
            if (selector.includes('iframe')) {
              recaptchaIframe = element;
            }
            console.log(`🤖 reCAPTCHA detected (selector: ${selector})`);
            break;
          }
        } catch {
          continue;
        }
      }
      
      // Also check for reCAPTCHA in iframes (they're often in separate iframes)
      if (!recaptchaDetected) {
        try {
          const iframes = await page.locator('iframe').all();
          for (const iframe of iframes) {
            const src = await iframe.getAttribute('src').catch(() => '');
            if (src && (src.includes('recaptcha') || src.includes('google.com/recaptcha'))) {
              recaptchaDetected = true;
              recaptchaIframe = iframe;
              console.log(`🤖 reCAPTCHA detected in iframe: ${src.substring(0, 100)}`);
              break;
            }
          }
        } catch {
          // Ignore
        }
      }
      
      if (recaptchaDetected) {
        console.log("⏳ Waiting for reCAPTCHA verification (stealth plugin may auto-verify)...");
        
        // Wait for reCAPTCHA to potentially auto-verify
        // The stealth plugin sometimes allows automatic verification
        const maxWaitTime = 15000; // 15 seconds
        const checkInterval = 1000; // Check every second
        let waited = 0;
        let isVerified = false;
        
        while (waited < maxWaitTime && !isVerified) {
          await page.waitForTimeout(checkInterval);
          waited += checkInterval;
          
          // Check if reCAPTCHA is verified by looking for success indicators
          try {
            // Check if the checkbox is checked (for v2)
            if (recaptchaIframe) {
              const iframeContent = await recaptchaIframe.contentFrame();
              if (iframeContent) {
                const checkbox = iframeContent.locator('#recaptcha-anchor');
                const ariaChecked = await checkbox.getAttribute('aria-checked').catch(() => null);
                if (ariaChecked === 'true') {
                  isVerified = true;
                  console.log("✅ reCAPTCHA appears to be verified");
                  break;
                }
              }
            }
            
            // Also check for the response token (g-recaptcha-response)
            const responseToken = await page.evaluate(() => {
              const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
              return textarea ? (textarea as HTMLTextAreaElement).value : null;
            }).catch(() => null);
            
            if (responseToken && responseToken.length > 0) {
              isVerified = true;
              console.log("✅ reCAPTCHA response token found - verification successful");
              break;
            }
            
            // Check if reCAPTCHA element is no longer visible (might mean it's verified and hidden)
            const stillVisible = await page.locator(recaptchaSelectors[0]).isVisible().catch(() => false);
            if (!stillVisible && waited > 3000) {
              // If it disappeared after a few seconds, might be verified
              isVerified = true;
              console.log("✅ reCAPTCHA element no longer visible - may be verified");
              break;
            }
          } catch (e) {
            // Continue waiting
          }
        }
        
        if (!isVerified) {
          console.warn("⚠️  reCAPTCHA detected but not auto-verified after waiting");
          console.warn("⚠️  Form submission may fail or be blocked by reCAPTCHA");
          console.warn("⚠️  Consider using a reCAPTCHA solving service or manual intervention");
          
          // Try to click the checkbox manually as a last resort
          try {
            if (recaptchaIframe) {
              const iframeContent = await recaptchaIframe.contentFrame();
              if (iframeContent) {
                const checkbox = iframeContent.locator('#recaptcha-anchor, .recaptcha-checkbox');
                await checkbox.click({ timeout: 3000 }).catch(() => {});
                console.log("🖱️  Attempted to click reCAPTCHA checkbox");
                // Wait a bit more after clicking
                await page.waitForTimeout(3000);
              }
            }
          } catch (e) {
            console.warn("⚠️  Could not interact with reCAPTCHA checkbox");
          }
      } else {
          // Wait a bit more to ensure verification is complete
        await page.waitForTimeout(1000);
      }
    }

      // Submit the form - try multiple locator strategies for "Enter Now" button
      let enterButton;
      try {
        // Try "Enter Now" first (as user specified)
        enterButton = page.getByLabel("Enter Now");
        await enterButton.waitFor({ timeout: 2000 });
        console.log("✅ Found button with label 'Enter Now'");
      } catch {
        try {
          // Try "Enter" (fallback)
          enterButton = page.getByLabel("Enter");
          await enterButton.waitFor({ timeout: 2000 });
          console.log("✅ Found button with label 'Enter'");
        } catch {
          // Try by role and text
          try {
            enterButton = page.getByRole("button", { name: /Enter Now/i });
            await enterButton.waitFor({ timeout: 2000 });
            console.log("✅ Found button with text 'Enter Now'");
          } catch {
            // Try by value attribute
            try {
              enterButton = page.locator('input[type="submit"][value*="Enter"]');
              await enterButton.waitFor({ timeout: 2000 });
              console.log("✅ Found submit button with 'Enter' in value");
            } catch {
              // Last resort: try any submit button in the form
              enterButton = page.locator("form").first().locator('input[type="submit"], button[type="submit"]').first();
              await enterButton.waitFor({ timeout: 2000 });
              console.log("✅ Found submit button in form");
            }
          }
        }
      }
    const formUrl = page.url();

    // Check if form is valid before submission
    const form = page.locator("form").first();
    const isFormValid = await form.evaluate((formEl) => {
      return (formEl as HTMLFormElement).checkValidity();
    }).catch(() => true); // If we can't check, assume it's valid

    if (!isFormValid) {
      console.warn("⚠️  Form validation failed - form may not submit");
    }

    // Check if button is disabled or not clickable
    const isButtonDisabled = await enterButton.isDisabled().catch(() => false);
    const isButtonVisible = await enterButton.isVisible().catch(() => false);
    
    if (isButtonDisabled) {
      console.warn("⚠️  Enter button is disabled - form may not submit");
    }
    if (!isButtonVisible) {
      console.warn("⚠️  Enter button is not visible - form may not submit");
    }

    // Log all non-GET requests to help debug what's happening
    page.on("response", (response) => {
      const method = response.request().method();
      const status = response.status();
      const url = response.url();
      const isStaticAsset = url.match(/\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico)$/i);
      const isGoogleAnalytics = url.includes("google-analytics.com") || url.includes("googletagmanager.com");
      
      if (
        (method === "POST" || method === "PUT" || method === "PATCH") &&
        !isStaticAsset &&
        !isGoogleAnalytics
      ) {
        console.log(
          `🌐 ${method} ${status} ${url}`
        );
      }
    });

    // Set up waiting for the actual form submission response
      // Also watch for navigation and DOM changes that indicate submission
      const formSubmissionPromise = Promise.race([
        // Strategy 1: Wait for network response
        page
      .waitForResponse(
        async (response) => {
          const method = response.request().method();
          const status = response.status();
          const url = response.url();
          
          // Exclude static assets
          const isStaticAsset = url.match(/\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico)$/i);
          
          // Exclude Google Analytics and other tracking services
          const isTracking = 
            url.includes("google-analytics.com") ||
            url.includes("googletagmanager.com") ||
            url.includes("doubleclick.net") ||
            url.includes("googleadservices.com") ||
            url.includes("facebook.com/tr") ||
            url.includes("analytics");
          
          // Look for actual form submission endpoints
          // Any POST/PUT/PATCH to broadwaydirect.com (excluding tracking) is likely the form submission
              // Also accept GET requests that might be form submissions (some forms use GET)
          const isFormSubmission =
                (method === "POST" || method === "PUT" || method === "PATCH" || method === "GET") &&
            status >= 200 &&
            status < 400 &&
            !isStaticAsset &&
            !isTracking &&
                (url.includes("broadwaydirect.com") || url.includes("lottery"));

          if (isFormSubmission) {
            console.log(
              `📡 Form submission response: ${method} ${status} ${url}`
            );
            
            // Try to get response body for debugging
            try {
              const body = await response.text();
              if (body) {
                console.log(`📄 Response body preview: ${body.substring(0, 200)}`);
              }
            } catch (e) {
              // Response body might not be available, ignore
            }
          }

          return isFormSubmission;
        },
        { timeout: 30000 }
      )
          .catch(() => null),
        // Strategy 2: Wait for navigation (form might cause page change)
        page
          .waitForURL((url) => url !== formUrl, { timeout: 30000 })
          .then(() => {
            console.log(`📡 Navigation detected after form submission`);
            return { navigation: true, url: page.url() };
          })
          .catch(() => null),
        // Strategy 3: Wait for success message to appear in DOM
        page
          .waitForSelector(
            '[class*="success"], [class*="alert-success"], [id*="success"], [class*="thank"], [class*="entered"]',
            { timeout: 30000 }
          )
          .then(() => {
            console.log(`📡 Success indicator appeared in DOM`);
            return { domChange: true };
          })
          .catch(() => null),
      ]).catch(() => null);

    // Wait a bit to ensure form is ready
    await page.waitForTimeout(500);
    
      // Aggressively dismiss cookie banner right before clicking Enter button
      // The cookie banner can reappear or persist, so we need to be very aggressive
      const cookieBannerStillVisible = await cookieBanner.isVisible().catch(() => false);
      if (cookieBannerStillVisible) {
        console.log("🍪 Cookie banner still visible - force dismissing before Enter button click...");
        // Try clicking accept button first
        try {
          const acceptButton = cookieBanner.getByRole("button", { name: /accept|agree|ok|got it|continue/i });
          if (await acceptButton.isVisible({ timeout: 1000 }).catch(() => false)) {
            await acceptButton.click({ force: true });
            await page.waitForTimeout(200);
          }
        } catch {
          // Continue to force hide
        }
        
        // Force hide via JavaScript - be very aggressive
        await page.evaluate(() => {
          const banner = document.getElementById("cookie-information-template-wrapper");
          if (banner) {
            banner.style.display = "none";
            banner.style.visibility = "hidden";
            banner.style.opacity = "0";
            banner.style.pointerEvents = "none";
            banner.remove();
          }
          // Also remove any other cookie-related elements
          const cookieElements = document.querySelectorAll('[id*="cookie"], [class*="cookie"]');
          cookieElements.forEach((el) => {
            (el as HTMLElement).style.pointerEvents = "none";
            (el as HTMLElement).style.display = "none";
          });
        });
        await page.waitForTimeout(300);
      }
      
      // Always use force click since cookie banner is known to intercept
      // Scroll button into view if needed
      await enterButton.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      
      // Dismiss cookie banner one more time right before click
      const cookieBannerFinalCheck = await cookieBanner.isVisible().catch(() => false);
      if (cookieBannerFinalCheck) {
        await page.evaluate(() => {
          const banner = document.getElementById("cookie-information-template-wrapper");
          if (banner) {
            banner.style.display = "none";
            banner.style.visibility = "hidden";
            banner.style.opacity = "0";
            banner.style.pointerEvents = "none";
            banner.remove();
          }
        });
        await page.waitForTimeout(200);
      }
      
      try {
        // Use force click from the start to bypass cookie banner interception
        await enterButton.click({ force: true, timeout: 10000 });
        console.log("✅ Enter button clicked (forced to bypass interceptors)");
    } catch (error) {
        console.warn(`⚠️  Force click failed: ${error.message}`);
        // If force click fails, try JavaScript click
        try {
          await enterButton.evaluate((el) => {
            if (el instanceof HTMLElement) {
              el.click();
            }
          });
          console.log("✅ Enter button clicked (via JavaScript)");
        } catch (jsError) {
          try {
            // Last resort: Submit form directly
            await form.evaluate((formEl) => {
              (formEl as HTMLFormElement).submit();
            });
            console.log("✅ Form submitted directly");
          } catch (submitError) {
            console.error(`❌ Failed to click/submit: ${submitError.message}`);
            throw submitError;
          }
      }
    }

    // Wait for form submission response
    const response = await formSubmissionPromise;
      let hasSubmissionIndicator = false;
    
    if (response) {
      // Check what type of response we got
      if (response instanceof Object && 'navigation' in response) {
        // Navigation-based detection
        console.log(`✅ Form submission completed: Navigation to ${response.url || 'new page'}`);
        hasSubmissionIndicator = true;
      } else if (response instanceof Object && 'domChange' in response) {
        // DOM change-based detection
        console.log(`✅ Form submission completed: Success indicator appeared in DOM`);
        hasSubmissionIndicator = true;
      } else if (response && typeof response.request === 'function') {
        // Network response-based detection
      console.log(
        `✅ Form submission completed: ${response.request().method()} ${response.status()} ${response.url()}`
      );
        hasSubmissionIndicator = true;
      
      // Check response body for success/error indicators
      try {
        const responseBody = await response.text();
        if (responseBody) {
          const lowerBody = responseBody.toLowerCase();
          if (lowerBody.includes("error") || lowerBody.includes("invalid") || lowerBody.includes("failed")) {
            console.warn(`⚠️  Response body suggests error: ${responseBody.substring(0, 300)}`);
          } else if (lowerBody.includes("success") || lowerBody.includes("entered") || lowerBody.includes("thank")) {
            console.log(`✅ Response body suggests success`);
          }
        }
      } catch (e) {
        // Response body might not be readable, ignore
        }
      }
    } else {
      console.warn(`⚠️  No form submission response detected within timeout`);
      console.warn(`⚠️  This may indicate the form did not submit properly`);
    }
    
    // Wait for network to be idle to ensure all requests complete
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // Wait for any dynamic content to load
    await page.waitForTimeout(2000);

    // Check for success indicators
    const successIndicators = [
      page.getByText(/success|thank you|entered|submitted|you're entered|you are entered|entry received/i),
      page.locator('[class*="success"], [class*="alert-success"], [id*="success"]'),
    ];

    const hasSuccessIndicator = await Promise.race(
      successIndicators.map(async (indicator) => {
        try {
          const element = await indicator.first();
          const isVisible = await element.isVisible({ timeout: 3000 });
          if (isVisible) {
            const text = await element.textContent().catch(() => "");
            console.log(`✅ Success indicator found: ${text?.substring(0, 100)}`);
          }
          return isVisible;
        } catch {
          return false;
        }
      })
    ).catch(() => false);

    // Check for error messages
    const errorIndicators = [
      page.locator('[class*="error"], [class*="alert-danger"], [role="alert"], [id*="error"]'),
      page.getByText(/error|invalid|failed|try again|already entered|duplicate/i),
    ];

    const hasErrorIndicator = await Promise.race(
      errorIndicators.map(async (indicator) => {
        try {
          const element = await indicator.first();
          const isVisible = await element.isVisible({ timeout: 2000 });
          if (isVisible) {
            const text = await element.textContent().catch(() => "");
            console.warn(`⚠️  Error indicator found: ${text?.substring(0, 100)}`);
          }
          return isVisible;
        } catch {
          return false;
        }
      })
    ).catch(() => false);
    
    // Also check page content for any messages
    const pageContent = await page.content();
    const pageText = await page.textContent("body").catch(() => "");
    if (pageText) {
      const lowerText = pageText.toLowerCase();
      if (lowerText.includes("already entered") || lowerText.includes("duplicate entry")) {
        console.warn(`⚠️  Page content suggests duplicate entry`);
      }
    }

    // Log warnings if submission appears to have failed
    const currentUrl = page.url();
    const urlChanged = currentUrl !== formUrl;

    // If we're still on the form page and no success indicator, log a warning
    if (!urlChanged && !hasSuccessIndicator) {
      if (hasErrorIndicator) {
        const errorText = await errorIndicators[0]
          .first()
          .textContent()
          .catch(() => "Unknown error");
        console.warn(`⚠️  Form submission may have failed: ${errorText}`);
      } else {
        console.warn(
          `⚠️  No clear success indicator found after submission. URL changed: ${urlChanged}`
        );
      }
    }

    // Determine if this submission was successful
    let wasSuccessful = false;
    if (hasSubmissionIndicator) {
      // If we detected a submission (via network, navigation, or DOM), check for success
      if (hasSuccessIndicator) {
        wasSuccessful = true;
      } else if (response && typeof response.request === 'function') {
        // For network responses, check status code
        wasSuccessful = response.status() >= 200 && response.status() < 300;
      } else if (response && ('navigation' in response || 'domChange' in response)) {
        // For navigation or DOM changes, assume success if no error indicator
        wasSuccessful = !hasErrorIndicator;
      }
    } else {
      // Fallback: if we have a success indicator even without submission detection, consider it successful
      wasSuccessful = hasSuccessIndicator && !hasErrorIndicator;
    }

    if (wasSuccessful) {
      submissionSuccess = true;
    } else if (!submissionSuccess) {
      // Only set error if we haven't had a success yet
      if (hasErrorIndicator) {
        const errorText = await errorIndicators[0]
          .first()
          .textContent()
          .catch(() => "Unknown error");
        submissionError = errorText;
      } else if (!response) {
        submissionError = "No form submission response detected";
      } else {
        submissionError = "Form submission may have failed";
      }
    }

    // Wait for a random timeout to avoid spamming the API
    const breakTime = Math.floor(Math.random() * 1000) + 1;
    await page.waitForTimeout(breakTime);
      
      // Close modal if it's still open before next iteration (important for multiple entries)
      if (useModalApproach && i < entryTriggers.length - 1) {
        // Only close if there are more entries to process
        console.log(`🔄 Closing modal before processing next entry...`);
        
        // Wait a bit for any post-submission animations
        await page.waitForTimeout(1500);
        
        // Check if we're still in a popup/modal window - if so, navigate back to main page
        const currentUrl = page.url();
        if (currentUrl.includes('window=popup') || currentUrl.includes('/enter-lottery/')) {
          console.log("🔄 Navigating back to main page from popup...");
          // Navigate back to the original show page
          await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
          await page.waitForTimeout(1000);
        }
        
        // Try multiple strategies to close the modal
        let modalClosed = false;
        let formHidden = false;
        
        // Strategy 1: Look for close button
        try {
          const closeSelectors = [
            '[aria-label*="close" i]',
            '[aria-label*="Close" i]',
            '.modal-close',
            '[class*="close"]',
            '[class*="Close"]',
            'button:has-text("Close")',
            'button:has-text("×")',
            '[data-dismiss="modal"]',
          ];
          
          for (const selector of closeSelectors) {
            try {
              const closeButton = page.locator(selector).first();
              const isVisible = await closeButton.isVisible({ timeout: 1000 }).catch(() => false);
              if (isVisible) {
                await closeButton.click({ timeout: 2000 });
                console.log(`✅ Closed modal using selector: ${selector}`);
                modalClosed = true;
                await page.waitForTimeout(500);
                break;
              }
            } catch {
              continue;
            }
          }
        } catch {
          // Try next strategy
        }
        
        // Strategy 2: Press Escape key
        if (!modalClosed) {
          try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            console.log("✅ Pressed Escape to close modal");
            modalClosed = true;
          } catch {
            // Try next strategy
          }
        }
        
        // Strategy 3: Click outside modal (backdrop)
        if (!modalClosed) {
          try {
            const backdrop = page.locator('.modal-backdrop, [class*="backdrop"]').first();
            if (await backdrop.isVisible({ timeout: 1000 }).catch(() => false)) {
              await backdrop.click({ force: true });
              console.log("✅ Clicked backdrop to close modal");
              modalClosed = true;
              await page.waitForTimeout(500);
            }
          } catch {
            // Try next strategy
          }
        }
        
        // Strategy 4: Force hide via JavaScript
        if (!modalClosed) {
          try {
            await page.evaluate(() => {
              // Hide modals
              const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]');
              modals.forEach((modal) => {
                (modal as HTMLElement).style.display = 'none';
                modal.removeAttribute('aria-hidden');
                modal.setAttribute('aria-hidden', 'true');
              });
              
              // Remove backdrops
              const backdrops = document.querySelectorAll('.modal-backdrop, [class*="backdrop"]');
              backdrops.forEach((backdrop) => backdrop.remove());
              
              // Remove modal-open class from body
              document.body.classList.remove('modal-open');
              document.body.style.overflow = '';
              
              // Hide any form elements that might still be visible
              const forms = document.querySelectorAll('form');
              forms.forEach((form) => {
                const formParent = form.closest('[role="dialog"], .modal, [class*="modal"]');
                if (formParent) {
                  (formParent as HTMLElement).style.display = 'none';
                }
              });
            });
            console.log("✅ Force-closed modal via JavaScript");
            modalClosed = true;
            await page.waitForTimeout(500);
          } catch {
            console.warn("⚠️  Could not close modal - may interfere with next entry");
          }
        }
        
        // Wait and verify modal/form is actually closed
        await page.waitForTimeout(1000);
        
        // Check if form fields are no longer visible
        try {
          const firstNameField = page.getByLabel("First Name");
          const isFormStillVisible = await firstNameField.isVisible({ timeout: 1000 }).catch(() => false);
          if (!isFormStillVisible) {
            formHidden = true;
            console.log("✅ Form is no longer visible - modal appears closed");
          } else {
            console.warn("⚠️  Form still visible after closing attempt");
            // Try one more time to force hide
            await page.evaluate(() => {
              const forms = document.querySelectorAll('form');
              forms.forEach((form) => {
                const formParent = form.closest('[role="dialog"], .modal, [class*="modal"], [class*="popup"]');
                if (formParent) {
                  (formParent as HTMLElement).style.display = 'none';
                  (formParent as HTMLElement).style.visibility = 'hidden';
                }
              });
            });
            await page.waitForTimeout(500);
          }
        } catch {
          // If we can't check, assume it's closed
          formHidden = true;
        }
        
        // If we're still on a popup URL and form is still visible, navigate back
        const stillOnPopup = page.url().includes('window=popup') || page.url().includes('/enter-lottery/');
        if (stillOnPopup || !formHidden) {
          console.log("🔄 Navigating back to main page to reset state...");
          await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
          await page.waitForTimeout(1000);
        }
      }
    }
  } else {
    // Fallback: Navigate to hrefs as before (non-modal approach)
    console.log("📋 Using href navigation approach");
    
    for (let i = 0; i < validHrefs.length; i++) {
      const href = validHrefs[i];
      if (!href) {
        continue;
      }
      await page.goto(href, { waitUntil: "networkidle", timeout: 60000 });

      // Check if lottery is closed on the form page
      const formPageText = await page.textContent("body").catch(() => "");
      const lowerFormText = (formPageText || "").toLowerCase();
      
      const isFormPageClosed = 
        lowerFormText.includes("lottery is closed") ||
        lowerFormText.includes("lottery has closed") ||
        lowerFormText.includes("no longer accepting entries") ||
        lowerFormText.includes("entries are closed") ||
        lowerFormText.includes("lottery closed") ||
        lowerFormText.includes("entry period has ended");

      if (isFormPageClosed) {
        console.log("ℹ️  Lottery is closed on form page - skipping entry");
        continue;
      }

      // Check if form fields are available (if not, lottery might be closed)
      const firstNameField = page.getByLabel("First Name");
      const isFormAvailable = await firstNameField.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (!isFormAvailable) {
        console.log("ℹ️  Form is not available - lottery may be closed");
        continue;
      }

      // If we get here, we found an open entry form
      allEntriesClosed = false;
      attemptedSubmissions++;

      await firstNameField.waitFor({ timeout: 30000 });
      await page.getByLabel("First Name").fill(userInfo.firstName);
      await page.getByLabel("Last Name").fill(userInfo.lastName);
      await page
        .getByLabel("Qty of Tickets Requested")
        .selectOption(userInfo.numberOfTickets);
      await page.getByLabel("Email").fill(userInfo.email);

      // Enter Date of Birth
      await page.locator("#dlslot_dob_month").fill(userInfo.dateOfBirth.month);
      await page.locator("#dlslot_dob_day").fill(userInfo.dateOfBirth.day);
      await page.locator("#dlslot_dob_year").fill(userInfo.dateOfBirth.year);

      await page.getByLabel("Zip").fill(userInfo.zip);
      await page
        .getByLabel("Country of Residence")
        .selectOption({ label: userInfo.countryOfResidence });

      // Agree to terms
      await page.locator("#dlslot_agree").check({ force: true });

      // Set up error logging before form submission
      page.on("console", (msg) => {
        const type = msg.type();
        if (type === "error") {
          console.log(`🔴 Console error: ${msg.text()}`);
        }
      });

      page.on("pageerror", (error) => {
        console.log(`🔴 Page error: ${error.message}`);
      });

      // Handle cookie consent banner if present
      const cookieBanner = page.locator("#cookie-information-template-wrapper");
      const isCookieBannerVisible = await cookieBanner.isVisible().catch(() => false);
      if (isCookieBannerVisible) {
        console.log("🍪 Cookie banner detected - attempting to dismiss");
        try {
          const acceptButton = cookieBanner.getByRole("button", { name: /accept|agree|ok|got it|continue/i });
          const acceptButtonVisible = await acceptButton.isVisible({ timeout: 2000 }).catch(() => false);
          if (acceptButtonVisible) {
            await acceptButton.click({ force: true });
            console.log("✅ Clicked cookie banner accept button");
          }
        } catch (e) {
          await page.evaluate(() => {
            const banner = document.getElementById("cookie-information-template-wrapper");
            if (banner) {
              banner.style.display = "none";
              banner.style.visibility = "hidden";
              banner.style.opacity = "0";
              banner.style.pointerEvents = "none";
            }
          });
        }
        await page.waitForTimeout(500);
      }

      // Check for and handle reCAPTCHA if present (same logic as modal approach)
      const recaptchaSelectors = [
        'iframe[src*="recaptcha"]',
        'iframe[title*="reCAPTCHA"]',
        '[class*="recaptcha"]',
        '[id*="recaptcha"]',
        '[data-sitekey]',
      ];
      
      let recaptchaDetected = false;
      let recaptchaIframe = null;
      
      for (const selector of recaptchaSelectors) {
        try {
          const element = page.locator(selector).first();
          const isVisible = await element.isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            recaptchaDetected = true;
            if (selector.includes('iframe')) {
              recaptchaIframe = element;
            }
            console.log(`🤖 reCAPTCHA detected (selector: ${selector})`);
            break;
          }
        } catch {
          continue;
        }
      }
      
      if (!recaptchaDetected) {
        try {
          const iframes = await page.locator('iframe').all();
          for (const iframe of iframes) {
            const src = await iframe.getAttribute('src').catch(() => '');
            if (src && (src.includes('recaptcha') || src.includes('google.com/recaptcha'))) {
              recaptchaDetected = true;
              recaptchaIframe = iframe;
              console.log(`🤖 reCAPTCHA detected in iframe: ${src.substring(0, 100)}`);
              break;
            }
          }
        } catch {
          // Ignore
        }
      }
      
      if (recaptchaDetected) {
        console.log("⏳ Waiting for reCAPTCHA verification (stealth plugin may auto-verify)...");
        
        const maxWaitTime = 15000;
        const checkInterval = 1000;
        let waited = 0;
        let isVerified = false;
        
        while (waited < maxWaitTime && !isVerified) {
          await page.waitForTimeout(checkInterval);
          waited += checkInterval;
          
          try {
            if (recaptchaIframe) {
              const iframeContent = await recaptchaIframe.contentFrame();
              if (iframeContent) {
                const checkbox = iframeContent.locator('#recaptcha-anchor');
                const ariaChecked = await checkbox.getAttribute('aria-checked').catch(() => null);
                if (ariaChecked === 'true') {
                  isVerified = true;
                  console.log("✅ reCAPTCHA appears to be verified");
                  break;
                }
              }
            }
            
            const responseToken = await page.evaluate(() => {
              const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
              return textarea ? (textarea as HTMLTextAreaElement).value : null;
            }).catch(() => null);
            
            if (responseToken && responseToken.length > 0) {
              isVerified = true;
              console.log("✅ reCAPTCHA response token found - verification successful");
              break;
            }
            
            const stillVisible = await page.locator(recaptchaSelectors[0]).isVisible().catch(() => false);
            if (!stillVisible && waited > 3000) {
              isVerified = true;
              console.log("✅ reCAPTCHA element no longer visible - may be verified");
              break;
            }
          } catch (e) {
            // Continue waiting
          }
        }
        
        if (!isVerified) {
          console.warn("⚠️  reCAPTCHA detected but not auto-verified after waiting");
          console.warn("⚠️  Form submission may fail or be blocked by reCAPTCHA");
          
          try {
            if (recaptchaIframe) {
              const iframeContent = await recaptchaIframe.contentFrame();
              if (iframeContent) {
                const checkbox = iframeContent.locator('#recaptcha-anchor, .recaptcha-checkbox');
                await checkbox.click({ timeout: 3000 }).catch(() => {});
                console.log("🖱️  Attempted to click reCAPTCHA checkbox");
                await page.waitForTimeout(3000);
              }
            }
          } catch (e) {
            console.warn("⚠️  Could not interact with reCAPTCHA checkbox");
          }
        } else {
          await page.waitForTimeout(1000);
        }
      }

      // Submit the form - try multiple locator strategies
      let enterButton;
      try {
        enterButton = page.getByLabel("Enter Now");
        await enterButton.waitFor({ timeout: 2000 });
        console.log("✅ Found button with label 'Enter Now'");
      } catch {
        try {
          enterButton = page.getByLabel("Enter");
          await enterButton.waitFor({ timeout: 2000 });
          console.log("✅ Found button with label 'Enter'");
        } catch {
          try {
            enterButton = page.getByRole("button", { name: /Enter Now/i });
            await enterButton.waitFor({ timeout: 2000 });
            console.log("✅ Found button with text 'Enter Now'");
          } catch {
            try {
              enterButton = page.locator('input[type="submit"][value*="Enter"]');
              await enterButton.waitFor({ timeout: 2000 });
              console.log("✅ Found submit button with 'Enter' in value");
            } catch {
              enterButton = page.locator("form").first().locator('input[type="submit"], button[type="submit"]').first();
              await enterButton.waitFor({ timeout: 2000 });
              console.log("✅ Found submit button in form");
            }
          }
        }
      }
      const formUrl = page.url();
      const form = page.locator("form").first();

      // Set up form submission detection (same as modal approach)
      const formSubmissionPromise = Promise.race([
        page
          .waitForResponse(
            async (response) => {
              const method = response.request().method();
              const status = response.status();
              const url = response.url();
              const isStaticAsset = url.match(/\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico)$/i);
              const isTracking = 
                url.includes("google-analytics.com") ||
                url.includes("googletagmanager.com") ||
                url.includes("doubleclick.net") ||
                url.includes("googleadservices.com") ||
                url.includes("facebook.com/tr") ||
                url.includes("analytics");
              const isFormSubmission =
                (method === "POST" || method === "PUT" || method === "PATCH" || method === "GET") &&
                status >= 200 &&
                status < 400 &&
                !isStaticAsset &&
                !isTracking &&
                (url.includes("broadwaydirect.com") || url.includes("lottery"));
              if (isFormSubmission) {
                console.log(`📡 Form submission response: ${method} ${status} ${url}`);
              }
              return isFormSubmission;
            },
            { timeout: 30000 }
          )
          .catch(() => null),
        page
          .waitForURL((url) => url !== formUrl, { timeout: 30000 })
          .then(() => {
            console.log(`📡 Navigation detected after form submission`);
            return { navigation: true, url: page.url() };
          })
          .catch(() => null),
        page
          .waitForSelector(
            '[class*="success"], [class*="alert-success"], [id*="success"], [class*="thank"], [class*="entered"]',
            { timeout: 30000 }
          )
          .then(() => {
            console.log(`📡 Success indicator appeared in DOM`);
            return { domChange: true };
          })
          .catch(() => null),
      ]).catch(() => null);

      await page.waitForTimeout(500);
      
      const cookieBannerStillVisible = await cookieBanner.isVisible().catch(() => false);
      if (cookieBannerStillVisible) {
        await page.evaluate(() => {
          const banner = document.getElementById("cookie-information-template-wrapper");
          if (banner) {
            banner.style.display = "none";
            banner.style.visibility = "hidden";
            banner.style.opacity = "0";
            banner.style.pointerEvents = "none";
            banner.remove();
          }
        });
        await page.waitForTimeout(300);
      }
      
      try {
        await enterButton.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await enterButton.click({ timeout: 10000 });
        console.log("✅ Enter button clicked");
      } catch (error) {
        console.warn(`⚠️  Initial click failed: ${error.message}`);
        try {
          await enterButton.click({ force: true });
          console.log("✅ Enter button clicked (forced)");
        } catch (forceError) {
          try {
            await enterButton.evaluate((el) => {
              if (el instanceof HTMLElement) el.click();
            });
            console.log("✅ Enter button clicked (via JavaScript)");
          } catch (jsError) {
            try {
              await form.evaluate((formEl) => {
                (formEl as HTMLFormElement).submit();
              });
              console.log("✅ Form submitted directly");
            } catch (submitError) {
              console.error(`❌ Failed to click/submit: ${submitError.message}`);
              throw submitError;
            }
          }
        }
      }

      // Wait for form submission response (same logic as modal approach)
      const response = await formSubmissionPromise;
      let hasSubmissionIndicator = false;
      
      if (response) {
        if (response instanceof Object && 'navigation' in response) {
          console.log(`✅ Form submission completed: Navigation to ${response.url || 'new page'}`);
          hasSubmissionIndicator = true;
        } else if (response instanceof Object && 'domChange' in response) {
          console.log(`✅ Form submission completed: Success indicator appeared in DOM`);
          hasSubmissionIndicator = true;
        } else if (response && typeof response.request === 'function') {
          console.log(`✅ Form submission completed: ${response.request().method()} ${response.status()} ${response.url()}`);
          hasSubmissionIndicator = true;
        }
      } else {
        console.warn(`⚠️  No form submission response detected within timeout`);
      }
      
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // Check for success indicators (same as modal approach)
      const successIndicators = [
        page.getByText(/success|thank you|entered|submitted|you're entered|you are entered|entry received/i),
        page.locator('[class*="success"], [class*="alert-success"], [id*="success"]'),
      ];

      const hasSuccessIndicator = await Promise.race(
        successIndicators.map(async (indicator) => {
          try {
            const element = await indicator.first();
            const isVisible = await element.isVisible({ timeout: 3000 });
            if (isVisible) {
              const text = await element.textContent().catch(() => "");
              console.log(`✅ Success indicator found: ${text?.substring(0, 100)}`);
            }
            return isVisible;
          } catch {
            return false;
          }
        })
      ).catch(() => false);

      const errorIndicators = [
        page.locator('[class*="error"], [class*="alert-danger"], [role="alert"], [id*="error"]'),
        page.getByText(/error|invalid|failed|try again|already entered|duplicate/i),
      ];

      const hasErrorIndicator = await Promise.race(
        errorIndicators.map(async (indicator) => {
          try {
            const element = await indicator.first();
            const isVisible = await element.isVisible({ timeout: 2000 });
            if (isVisible) {
              const text = await element.textContent().catch(() => "");
              console.warn(`⚠️  Error indicator found: ${text?.substring(0, 100)}`);
            }
            return isVisible;
          } catch {
            return false;
          }
        })
      ).catch(() => false);
      
      const currentUrl = page.url();
      const urlChanged = currentUrl !== formUrl;

      if (!urlChanged && !hasSuccessIndicator) {
        if (hasErrorIndicator) {
          const errorText = await errorIndicators[0].first().textContent().catch(() => "Unknown error");
          console.warn(`⚠️  Form submission may have failed: ${errorText}`);
        } else {
          console.warn(`⚠️  No clear success indicator found after submission. URL changed: ${urlChanged}`);
        }
      }

      let wasSuccessful = false;
      if (hasSubmissionIndicator) {
        if (hasSuccessIndicator) {
          wasSuccessful = true;
        } else if (response && typeof response.request === 'function') {
          wasSuccessful = response.status() >= 200 && response.status() < 300;
        } else if (response && ('navigation' in response || 'domChange' in response)) {
          wasSuccessful = !hasErrorIndicator;
        }
      } else {
        wasSuccessful = hasSuccessIndicator && !hasErrorIndicator;
      }

      if (wasSuccessful) {
        submissionSuccess = true;
      } else if (!submissionSuccess) {
        if (hasErrorIndicator) {
          const errorText = await errorIndicators[0].first().textContent().catch(() => "Unknown error");
          submissionError = errorText;
        } else if (!response) {
          submissionError = "No form submission response detected";
        } else {
          submissionError = "Form submission may have failed";
        }
      }

      const breakTime = Math.floor(Math.random() * 1000) + 1;
      await page.waitForTimeout(breakTime);
    }
  }

  await page.close();

  // If all entries were closed, return closed status
  if (allEntriesClosed && attemptedSubmissions === 0) {
    return {
      success: false,
      message: "All lottery entries are closed",
      reason: "closed",
    };
  }

  if (submissionSuccess) {
    return {
      success: true,
      message: "Lottery entry submitted successfully",
      reason: "submitted",
    };
  } else {
    return {
      success: false,
      message: submissionError || "Failed to submit lottery entry",
      reason: "failed",
    };
  }
}
