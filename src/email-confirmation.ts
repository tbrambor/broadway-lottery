import Imap from "imap";
import { simpleParser } from "mailparser";

export type EmailConfig = {
  host: string; // e.g., "imap.gmail.com"
  port: number; // e.g., 993
  user: string; // email address
  password: string; // email password or app password
  tls: boolean; // use TLS/SSL
};

export type ConfirmationLink = {
  url: string;
  showName?: string;
  timestamp: Date;
};

/**
 * Connect to email via IMAP and find confirmation emails from Broadway Direct
 */
export async function findConfirmationEmails(
  config: EmailConfig,
  maxWaitSeconds: number = 60
): Promise<ConfirmationLink[]> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    const confirmationLinks: ConfirmationLink[] = [];
    const startTime = Date.now();

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err, box) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }

        // Search for emails from Broadway Direct with confirmation subject
        const searchCriteria = [
          ["FROM", "lottery@broadwaydirect.com"],
          ["SUBJECT", "Action Required"],
          ["UNSEEN"], // Only unread emails
        ];

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            imap.end();
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            console.log("📧 No unread confirmation emails found");
            imap.end();
            resolve([]);
            return;
          }

          console.log(`📧 Found ${results.length} unread confirmation email(s)`);

          const fetch = imap.fetch(results, { bodies: "" });

          fetch.on("message", (msg, seqno) => {
            msg.on("body", (stream) => {
              simpleParser(stream, async (err, parsed) => {
                if (err) {
                  console.warn(`⚠️  Error parsing email ${seqno}: ${err.message}`);
                  return;
                }

                // Extract confirmation link from email
                const link = extractConfirmationLink(parsed);
                if (link) {
                  // Extract show name from subject if possible
                  const showName = extractShowName(parsed.subject || "");
                  confirmationLinks.push({
                    ...link,
                    showName,
                    timestamp: parsed.date || new Date(),
                  });
                  console.log(
                    `✅ Found confirmation link for ${showName || "lottery"}: ${link.url.substring(0, 80)}...`
                  );
                }
              });
            });
          });

          fetch.once("end", () => {
            imap.end();
            resolve(confirmationLinks);
          });
        });
      });
    });

    imap.once("error", (err) => {
      imap.end();
      reject(err);
    });

    imap.connect();

    // Timeout after maxWaitSeconds
    setTimeout(() => {
      if (imap.state !== "closed") {
        imap.end();
      }
      if (confirmationLinks.length === 0 && Date.now() - startTime < maxWaitSeconds * 1000) {
        // If we haven't found anything and haven't waited long enough, keep waiting
        // This will be handled by the caller
        resolve([]);
      } else {
        resolve(confirmationLinks);
      }
    }, maxWaitSeconds * 1000);
  });
}

/**
 * Extract confirmation link from email body
 */
function extractConfirmationLink(parsed: any): { url: string } | null {
  // Try HTML first
  if (parsed.html) {
    // Look for confirmation links in HTML
    const htmlLinkRegex = /href=["'](https?:\/\/[^"']*confirm[^"']*|https?:\/\/[^"']*validate[^"']*|https?:\/\/[^"']*verify[^"']*)[^"']*["']/i;
    const match = parsed.html.match(htmlLinkRegex);
    if (match && match[1]) {
      return { url: match[1] };
    }

    // Also try to find any link with "confirm" or "validate" in the text
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>(?:[^<]*confirm[^<]*|Click to Confirm)[^<]*<\/a>/i;
    const linkMatch = parsed.html.match(linkRegex);
    if (linkMatch && linkMatch[1]) {
      return { url: linkMatch[1] };
    }
  }

  // Try text version
  if (parsed.text) {
    const textLinkRegex = /(https?:\/\/[^\s]*confirm[^\s]*|https?:\/\/[^\s]*validate[^\s]*|https?:\/\/[^\s]*verify[^\s]*)/i;
    const match = parsed.text.match(textLinkRegex);
    if (match && match[1]) {
      return { url: match[1] };
    }
  }

  return null;
}

/**
 * Extract show name from email subject
 */
function extractShowName(subject: string): string | undefined {
  // Subject format: "Action Required: Confirm your email address to enter WICKED (NY) lottery"
  const match = subject.match(/enter\s+([^(]+)\s*\(/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * Wait for confirmation email and extract link
 */
export async function waitForConfirmationEmail(
  config: EmailConfig | null,
  maxWaitSeconds: number = 120,
  checkIntervalSeconds: number = 5
): Promise<ConfirmationLink | null> {
  if (!config) {
    console.log("📧 Email confirmation disabled (no email config provided)");
    return null;
  }

  console.log(`📧 Waiting for confirmation email (max ${maxWaitSeconds}s)...`);
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    try {
      const links = await findConfirmationEmails(config, checkIntervalSeconds);
      if (links.length > 0) {
        // Return the most recent one
        const mostRecent = links.sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
        )[0];
        console.log(`✅ Found confirmation email for ${mostRecent.showName || "lottery"}`);
        return mostRecent;
      }
    } catch (error) {
      console.warn(`⚠️  Error checking email: ${error.message}`);
    }

    // Wait before checking again
    await new Promise((resolve) => setTimeout(resolve, checkIntervalSeconds * 1000));
  }

  console.warn(`⚠️  No confirmation email found within ${maxWaitSeconds} seconds`);
  return null;
}


