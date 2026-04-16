/**
 * Shared email composition — HTML template, unsubscribe URL, tracking pixel,
 * plain-text fallback. Used by both direct-email-tools (Resend) and
 * gmail-email-tools (Gmail SMTP) to avoid drift between the two.
 *
 * Keeps the template CAN-SPAM-compliant (List-Unsubscribe, physical address,
 * unsubscribe link in footer).
 */
import { signPixelUrl } from "@/lib/tracking/pixel-signature";

export interface ComposedEmail {
  /** HTML body wrapped in a styled table layout with footer + tracking pixel. */
  html: string;
  /** Plain-text body with unsubscribe URL appended. */
  text: string;
  /** HTTP headers required for RFC 8058 one-click unsubscribe. */
  headers: { "List-Unsubscribe": string; "List-Unsubscribe-Post": string };
  /** The unsubscribe URL (exposed so callers can log/inspect it). */
  unsubscribeUrl: string;
}

export interface ComposeOptions {
  businessId: string;
  organizationId: string;
  recipientEmail: string;
  body: string;
  fromName?: string;
  physicalAddress?: string;
  /**
   * Whether to include a 1x1 open-tracking pixel in the HTML.
   * Gmail SMTP: true (no webhook-based opens).
   * Resend: false (Resend's own open tracking is used instead).
   */
  includeTrackingPixel: boolean;
  /** Override base URL for unsubscribe/pixel links. Defaults to NEXT_PUBLIC_APP_URL. */
  baseUrl?: string;
}

export function composeEmail(opts: ComposeOptions): ComposedEmail {
  const baseUrl =
    opts.baseUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://app.yourdomain.com";

  const unsubscribeUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(
    opts.recipientEmail
  )}&orgId=${encodeURIComponent(opts.organizationId)}`;

  const senderName = opts.fromName ?? "The Team";
  const footerAddress = opts.physicalAddress ?? "1234 Main St, Chicago, IL 60601";

  // Plain text → HTML paragraphs
  const htmlBody = opts.body
    .split(/\n\n+/)
    .map(
      (para) =>
        `<p style="margin:0 0 16px 0;line-height:1.6">${para.replace(/\n/g, "<br/>")}</p>`
    )
    .join("");

  const trackingPixel = opts.includeTrackingPixel
    ? `<img src="${baseUrl}/api/track/open?id=${encodeURIComponent(
        opts.businessId
      )}&org=${encodeURIComponent(opts.organizationId)}&sig=${signPixelUrl(
        opts.businessId,
        opts.organizationId
      )}" width="1" height="1" style="display:none" alt="" />`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:24px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:40px;max-width:600px">
        <tr><td style="color:#1a1a1a;font-size:16px">
          ${htmlBody}
          <p style="margin:24px 0 0 0;color:#555;font-size:14px">Best,<br/><strong>${senderName}</strong></p>
        </td></tr>
        <tr><td style="border-top:1px solid #eee;padding-top:16px;margin-top:24px;color:#999;font-size:11px;line-height:1.5">
          You received this email because your business was found via Google Maps.
          If you'd prefer not to receive emails like this,
          <a href="${unsubscribeUrl}" style="color:#999">unsubscribe here</a>.<br/>
          ${footerAddress}
        </td></tr>
      </table>
      ${trackingPixel}
    </td></tr>
  </table>
</body>
</html>`;

  const text =
    opts.body +
    `\n\nBest,\n${senderName}\n\n---\nUnsubscribe: ${unsubscribeUrl}\n${footerAddress}`;

  return {
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    unsubscribeUrl,
  };
}
