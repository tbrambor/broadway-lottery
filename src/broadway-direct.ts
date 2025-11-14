export async function broadwayDirect({ browser, userInfo, url }) {
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

  const links = await page.getByRole("link", { name: /Enter/i }).all();
  const hrefs = await Promise.all(
    links.map((link) => link.getAttribute("href"))
  );

  for (let i = 0; i < hrefs.length; i++) {
    const href = hrefs[i];
    if (!href) {
      continue;
    }
    await page.goto(href, { waitUntil: "networkidle", timeout: 60000 });

    await page.getByLabel("First Name").waitFor({ timeout: 30000 });
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

    // Handle cookie consent banner if present
    const cookieBanner = page.locator("#cookie-information-template-wrapper");
    const isCookieBannerVisible = await cookieBanner.isVisible().catch(() => false);
    if (isCookieBannerVisible) {
      // Try to find and click an accept/agree button within the cookie banner
      const acceptButton = cookieBanner.getByRole("button", { name: /accept|agree|ok|got it/i });
      const acceptButtonVisible = await acceptButton.isVisible().catch(() => false);
      if (acceptButtonVisible) {
        await acceptButton.click();
        // Wait for banner to disappear
        await cookieBanner.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
      } else {
        // If no explicit button, try to dismiss by clicking outside or waiting
        // Some banners auto-dismiss or can be closed by clicking backdrop
        await page.waitForTimeout(1000);
      }
    }

    // Submit the form - use force: true if cookie banner still blocks it
    const enterButton = page.getByLabel("Enter");
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
    // Exclude Google Analytics and other tracking requests
    const formSubmissionPromise = page
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
          const isFormSubmission =
            (method === "POST" || method === "PUT" || method === "PATCH") &&
            status >= 200 &&
            status < 400 &&
            !isStaticAsset &&
            !isTracking &&
            url.includes("broadwaydirect.com");

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
      .catch(() => null);

    // Wait a bit to ensure form is ready
    await page.waitForTimeout(500);
    
    try {
      // Scroll button into view if needed
      await enterButton.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      
      await enterButton.click({ timeout: 10000 });
      console.log("✅ Enter button clicked");
    } catch (error) {
      console.warn(`⚠️  Initial click failed: ${error.message}`);
      // If click fails due to interception, force the click
      try {
        await enterButton.click({ force: true });
        console.log("✅ Enter button clicked (forced)");
      } catch (forceError) {
        console.error(`❌ Failed to click enter button: ${forceError.message}`);
        throw forceError;
      }
    }

    // Wait for form submission response
    const response = await formSubmissionPromise;
    if (response) {
      console.log(
        `✅ Form submission completed: ${response.request().method()} ${response.status()} ${response.url()}`
      );
      
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

    // Wait for a random timeout to avoid spamming the API
    const breakTime = Math.floor(Math.random() * 1000) + 1;
    await page.waitForTimeout(breakTime);
  }
}
