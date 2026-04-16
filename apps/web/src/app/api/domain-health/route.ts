import { NextResponse } from "next/server";
import dns from "dns/promises";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");

  if (!domain) {
    return NextResponse.json({ error: "Missing domain parameter" }, { status: 400 });
  }

  try {
    const results: Record<string, any> = {
      domain,
      checkedAt: new Date().toISOString(),
      spf: { found: false, record: null, valid: false },
      dkim: { found: false },
      dmarc: { found: false, record: null, policy: null },
      mx: { found: false, records: [] },
      ssl: { valid: false },
      overall: "unknown",
      score: 0,
    };

    // Check SPF
    try {
      const txtRecords = await dns.resolveTxt(domain);
      const spfRecord = txtRecords.find((r) => r.join("").startsWith("v=spf1"));
      if (spfRecord) {
        results.spf = {
          found: true,
          record: spfRecord.join(""),
          valid: spfRecord.join("").includes("include:") || spfRecord.join("").includes("ip4:"),
        };
      }
    } catch { /* No TXT records */ }

    // Check DKIM (common selectors)
    for (const selector of ["google", "default", "selector1", "selector2", "k1"]) {
      try {
        const dkimRecords = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
        if (dkimRecords.length > 0) {
          results.dkim = { found: true, selector };
          break;
        }
      } catch { /* Not found for this selector */ }
    }

    // Check DMARC
    try {
      const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
      const dmarcRecord = dmarcRecords.find((r) => r.join("").startsWith("v=DMARC1"));
      if (dmarcRecord) {
        const record = dmarcRecord.join("");
        const policyMatch = record.match(/p=(\w+)/);
        results.dmarc = {
          found: true,
          record,
          policy: policyMatch ? policyMatch[1] : "none",
        };
      }
    } catch { /* No DMARC */ }

    // Check MX
    try {
      const mxRecords = await dns.resolveMx(domain);
      results.mx = {
        found: mxRecords.length > 0,
        records: mxRecords.sort((a, b) => a.priority - b.priority).slice(0, 3).map((r) => ({
          priority: r.priority,
          exchange: r.exchange,
        })),
      };
    } catch { /* No MX records */ }

    // Check SSL
    try {
      const sslRes = await fetch(`https://${domain}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      results.ssl = { valid: sslRes.ok || sslRes.status < 500 };
    } catch {
      results.ssl = { valid: false };
    }

    // Calculate score
    let score = 0;
    if (results.spf.found && results.spf.valid) score += 25;
    else if (results.spf.found) score += 10;
    if (results.dkim.found) score += 25;
    if (results.dmarc.found) score += 25;
    if (results.dmarc.policy === "reject" || results.dmarc.policy === "quarantine") score += 5;
    if (results.mx.found) score += 15;
    if (results.ssl.valid) score += 10;

    results.score = score;
    results.overall = score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "poor";

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
