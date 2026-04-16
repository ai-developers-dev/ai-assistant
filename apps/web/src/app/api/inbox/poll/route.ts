import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { decryptProviderKeys } from "@/lib/credentials/provider-keys";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Reply tone classification keywords
const TONE_KEYWORDS: Record<string, string[]> = {
  hot: ["interested", "tell me more", "pricing", "cost", "how much", "let's talk", "schedule", "call me", "sounds good", "love to", "set up", "meeting", "demo", "when can"],
  warm: ["maybe", "not sure", "more info", "questions", "curious", "when", "can you", "what does", "how does", "depends"],
  objection: ["already have", "not now", "too expensive", "not interested right now", "maybe later", "busy", "have a guy", "not looking", "have someone"],
  cold: ["stop", "remove", "unsubscribe", "not interested", "no thanks", "don't contact", "take me off", "opt out", "spam", "reported"],
  auto_reply: ["out of office", "away from", "vacation", "auto-reply", "automatic reply", "currently unavailable", "will return", "limited access"],
};

function classifyReply(text: string): string {
  const lower = text.toLowerCase();
  for (const [tone, keywords] of Object.entries(TONE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) return tone;
    }
  }
  return "warm"; // Default to warm if can't classify
}

function stripQuotedText(text: string): string {
  // Remove quoted reply text (lines starting with >)
  const lines = text.split("\n");
  const filtered = lines.filter(line => !line.trim().startsWith(">") && !line.trim().startsWith("On ") && !line.includes("wrote:"));
  // Also remove everything after "---" or "Original Message"
  const joined = filtered.join("\n");
  const cutoff = joined.search(/---|\bOriginal Message\b|\bForwarded message\b/i);
  return cutoff > 0 ? joined.substring(0, cutoff).trim() : joined.trim();
}

export async function POST(req: Request) {
  // Verify scheduler secret
  const secret = req.headers.get("x-scheduler-secret");
  if (secret !== process.env.SCHEDULER_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { organizationId } = await req.json();
    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
    }

    // Get org + Gmail credentials
    const orgData = await convex.query(api.organizations.getById, { id: organizationId });
    if (!orgData?.providerKeys) {
      return NextResponse.json({ error: "No provider keys" }, { status: 400 });
    }

    const credentials = decryptProviderKeys(
      orgData.providerKeys as Record<string, any>,
      organizationId
    );

    // Find Gmail accounts
    const gmailAccounts = credentials.gmail_smtp_accounts;
    if (!Array.isArray(gmailAccounts) || gmailAccounts.length === 0) {
      return NextResponse.json({ error: "No Gmail accounts" }, { status: 400 });
    }

    let totalReplies = 0;
    const results: any[] = [];

    for (const account of gmailAccounts) {
      try {
        // Use imapflow for IMAP access
        const { ImapFlow } = await import("imapflow");
        const client = new ImapFlow({
          host: "imap.gmail.com",
          port: 993,
          secure: true,
          auth: { user: account.email, pass: account.password },
          logger: false,
        });

        await client.connect();
        const lock = await client.getMailboxLock("INBOX");

        try {
          // Search for emails received in last 15 minutes
          const since = new Date(Date.now() - 15 * 60 * 1000);
          const messages = client.fetch(
            // imapflow SearchObject: `seen: false` means NOT marked as seen
            // (i.e., unread messages). This is the correct key — `unseen` is
            // not part of the imapflow type.
            { since, seen: false },
            { envelope: true, bodyStructure: true, source: true }
          );

          // Max size for a single message we'll process (1 MB).
          // Protects against OOM from attacker emails with massive attachments —
          // client.fetch(...{ source: true }) buffers the entire RFC-822 message.
          const MAX_MSG_BYTES = 1_000_000;

          for await (const msg of messages) {
            const envelope = msg.envelope;
            if (!envelope) continue;

            // Skip oversized messages before they're materialized any further.
            // `msg.size` may or may not be populated depending on fetch opts;
            // fall back to checking source length if needed.
            const msgSize = (msg as any).size as number | undefined;
            if (msgSize && msgSize > MAX_MSG_BYTES) {
              console.warn(`[inbox-poll] skipping oversized message ${msgSize} bytes from ${envelope.from?.[0]?.address}`);
              continue;
            }
            if (msg.source && msg.source.length > MAX_MSG_BYTES) {
              console.warn(`[inbox-poll] skipping oversized message source ${msg.source.length} bytes`);
              continue;
            }

            // Check if this is a reply to one of our outreach emails
            const inReplyTo = envelope.inReplyTo;
            const subject = envelope.subject || "";
            const from = envelope.from?.[0]?.address || "";

            if (!inReplyTo && !subject.startsWith("Re:")) continue;

            // Try to match against our sent emails
            let matchedBusiness: any = null;
            if (inReplyTo) {
              matchedBusiness = await convex.query(api.businesses.findByMessageIdGlobal, {
                messageId: inReplyTo,
              });
            }

            if (!matchedBusiness && from) {
              matchedBusiness = await convex.query(api.businesses.findByEmail, {
                organizationId: organizationId as Id<"organizations">,
                email: from,
              });
            }

            if (!matchedBusiness) continue;

            // Extract reply text
            let replyText = "";
            if (msg.source) {
              const fullText = msg.source.toString();
              // Simple extraction: get text after headers
              const bodyStart = fullText.indexOf("\r\n\r\n");
              if (bodyStart > 0) {
                replyText = stripQuotedText(fullText.substring(bodyStart + 4));
              }
            }

            if (!replyText && subject) {
              replyText = subject;
            }

            // Classify the reply
            const classification = classifyReply(replyText);

            // Update the business
            try {
              await convex.mutation(api.businesses.updateReplyClassification, {
                id: matchedBusiness._id,
                replyClassification: classification as any,
              });

              // Save the reply text
              await convex.mutation(api.businesses.markOutreachReply, {
                id: matchedBusiness._id,
                channel: "email",
                repliedAt: Date.now(),
                repliedBy: from,
              });

              totalReplies++;
              results.push({
                business: matchedBusiness.name,
                from,
                classification,
                preview: replyText.slice(0, 100),
              });

              // Fire outbound webhooks (Zapier/Make/Slack)
              try {
                const webhooks = (orgData.webhooks as Array<{ event: string; url: string; enabled: boolean }>) ?? [];
                const replyWebhooks = webhooks.filter((w) => w.enabled && w.event === "lead.replied");
                for (const wh of replyWebhooks) {
                  fetch(wh.url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Webhook-Event": "lead.replied" },
                    body: JSON.stringify({
                      event: "lead.replied",
                      timestamp: new Date().toISOString(),
                      organizationId,
                      data: {
                        businessId: matchedBusiness._id,
                        businessName: matchedBusiness.name,
                        from,
                        classification,
                        replyPreview: replyText.slice(0, 200),
                        leadScore: matchedBusiness.leadScore,
                      },
                    }),
                  }).catch(() => {}); // Fire-and-forget
                }
              } catch { /* non-fatal */ }

              // If HOT lead, send alert email + trigger immediate follow-up
              if (classification === "hot") {
                try {
                  const nodemailer = (await import("nodemailer")).default;
                  const transporter = nodemailer.createTransport({
                    service: "gmail",
                    auth: { user: account.email, pass: account.password },
                  });
                  // Strip CR/LF from any field that lands in mail headers to
                  // prevent header-injection (Bcc, Reply-To, etc.) via crafted
                  // business names or sender addresses.
                  const stripCRLF = (s: string | undefined): string =>
                    (s ?? "").replace(/[\r\n]+/g, " ").trim();
                  const safeBizName = stripCRLF(matchedBusiness.name);
                  const safeCity = stripCRLF(matchedBusiness.address?.city);
                  const safeFrom = stripCRLF(from);
                  // Reply text only appears in the body, but still strip null
                  // bytes and truncate for sanity.
                  const safeReply = replyText.replace(/\0/g, "").slice(0, 500);

                  await transporter.sendMail({
                    from: account.email,
                    to: account.email,
                    subject: `🔥 HOT LEAD: ${safeBizName} replied!`,
                    text: `${safeBizName} (${safeCity}) replied to your outreach!\n\nThey said:\n"${safeReply}"\n\nClassification: HOT\nReply NOW to close this lead!\n\nLead score: ${matchedBusiness.leadScore}/100\nEmail: ${safeFrom}`,
                  });
                } catch { /* Alert email is non-fatal */ }

                // Trigger immediate AI follow-up (skip the 1-hour cron delay)
                try {
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
                  if (appUrl) {
                    await fetch(`${appUrl}/api/chat`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "x-convex-internal": "true",
                      },
                      body: JSON.stringify({
                        messages: [{
                          role: "user",
                          content: `URGENT: Business ID ${matchedBusiness._id} just replied with a HOT lead response. Send an immediate follow-up reply using send_direct_email. Be conversational and enthusiastic — acknowledge their interest and propose a call. This is a reply to their reply, not a cold email. After sending, update the business lastFollowUpAt timestamp.`,
                        }],
                        agentType: "lead_gen",
                        organizationId,
                        isInternalCron: true,
                      }),
                    });
                  }
                } catch { /* Immediate follow-up is non-fatal — cron will catch it */ }
              }

              // If COLD, mark as unsubscribed
              if (classification === "cold") {
                try {
                  await convex.mutation(api.businesses.updateEmailStatus, {
                    id: matchedBusiness._id,
                    emailStatus: "unsubscribed",
                  });
                } catch { /* non-fatal */ }
              }
            } catch (err: any) {
              console.error(`[inbox-poll] Error updating business:`, err.message);
            }
          }
        } finally {
          lock.release();
        }

        await client.logout();
      } catch (err: any) {
        console.error(`[inbox-poll] IMAP error for ${account.email}:`, err.message);
        results.push({ account: account.email, error: err.message });
      }
    }

    return NextResponse.json({ success: true, totalReplies, results });
  } catch (err: any) {
    console.error("[inbox-poll] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
