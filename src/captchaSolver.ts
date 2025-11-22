// Helper to solve Google reCAPTCHA v2 using 2Captcha service
// Requires the environment variable CAPTCHA_API_KEY to be set.

// Using global fetch (Node 18+); no external import needed

/**
 * Solve a reCAPTCHA challenge via 2Captcha.
 * @param siteKey The site‑key attribute from the reCAPTCHA widget.
 * @param pageUrl The full URL of the page where the widget appears.
 * @param apiKey Your 2Captcha API key.
 * @returns The g‑recaptcha‑response token.
 */
export async function solveRecaptcha(
  siteKey: string,
  pageUrl: string,
  apiKey: string
): Promise<string> {
  // 1️⃣ Submit the captcha solving request
  const submitUrl = `http://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${encodeURIComponent(
    pageUrl
  )}&json=1`;
  const submitRes = await fetch(submitUrl);
  const submitJson = (await submitRes.json()) as { status: number; request: string };
  if (submitJson.status !== 1) {
    throw new Error(`2Captcha submit error: ${submitJson.request}`);
  }
  const requestId = submitJson.request;

  // 2️⃣ Poll for the solution
  const poll = async (): Promise<string> => {
    const pollUrl = `http://2captcha.com/res.php?key=${apiKey}&action=get&id=${requestId}&json=1`;
    const pollRes = await fetch(pollUrl);
    const pollJson = (await pollRes.json()) as { status: number; request: string };
    if (pollJson.status === 1) {
      return pollJson.request; // this is the token
    }
    if (pollJson.request === "CAPCHA_NOT_READY") {
      await new Promise((r) => setTimeout(r, 5000));
      return poll();
    }
    throw new Error(`2Captcha poll error: ${pollJson.request}`);
  };

  return poll();
}
