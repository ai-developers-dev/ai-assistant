import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";

// ── Get ALL orgs that have ever had lead gen activity ─────────────────

export const getActiveOrgs = internalQuery({
  handler: async (ctx) => {
    const orgIds = new Set<string>();

    // Include orgs with ANY scheduled tasks (active, completed, paused)
    const tasks = await ctx.db.query("scheduledTasks").collect();
    for (const task of tasks) {
      orgIds.add(task.organizationId);
    }

    // Include orgs with ANY businesses (even if tasks were deleted)
    const businesses = await ctx.db.query("businesses").collect();
    for (const biz of businesses) {
      orgIds.add(biz.organizationId);
    }

    // Include ALL orgs (the Marketing Manager should analyze every org)
    const allOrgs = await ctx.db.query("organizations").collect();
    for (const org of allOrgs) {
      orgIds.add(org._id);
    }

    const orgs: Array<{ orgId: string; orgName: string }> = [];
    for (const orgId of orgIds) {
      const org = await ctx.db.get(orgId as any);
      if (org) {
        orgs.push({ orgId: org._id, orgName: (org as any).name || "Unknown Org" });
      }
    }
    return orgs;
  },
});

// ── Get comprehensive report data for an org ─────────────────────────

export const getReportData = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const yesterdayStartMs = todayStartMs - 24 * 60 * 60 * 1000;
    const weekAgoMs = now - 7 * 24 * 60 * 60 * 1000;

    // Get all businesses
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    // Single-pass accumulation — replaces 17 separate .filter() passes over `all`.
    // Still O(n) scan but one pass with inlined counters instead of 17 array allocs.
    const last24h = now - 24 * 60 * 60 * 1000;
    let scrapedToday = 0, enrichedToday = 0, emailedToday = 0, metaSentToday = 0, linkedinSentToday = 0;
    let badOwnerNames = 0;
    let enriched = 0, withEmail = 0, withOwner = 0, withMeta = 0, withLinkedin = 0, withReviews = 0;
    let emailSent = 0, metaSent = 0, linkedinSent = 0, emailReplied = 0;
    let hot = 0, warm = 0, objection = 0, cold = 0;
    let scoreSum = 0, scoreCount = 0;
    let criticalUpgrade = 0;

    for (const b of all) {
      const bAny = b as any;
      const os = b.outreachStatus;

      if (b.createdAt >= last24h) scrapedToday++;
      if (b.status !== "new" && b.updatedAt >= last24h) enrichedToday++;
      if (os?.emailSentAt && os.emailSentAt >= last24h) emailedToday++;
      if (os?.metaSentAt && os.metaSentAt >= last24h) metaSentToday++;
      if (os?.linkedinSentAt && os.linkedinSentAt >= last24h) linkedinSentToday++;

      if (b.ownerName) {
        const words = b.ownerName.split(/\s+/);
        const bad = words.length < 2 || words.length > 3 || !words.every((w: string) => /^[A-Z][a-z]+$/.test(w));
        if (bad) badOwnerNames++;
      }

      if (b.status !== "new") enriched++;
      if (b.email) withEmail++;
      if (b.ownerName) withOwner++;
      if (b.metaPageUrl) withMeta++;
      if (bAny.linkedinOwnerUrl) withLinkedin++;
      if (bAny.reviews?.length) withReviews++;
      if (os?.emailSentAt) emailSent++;
      if (os?.metaSentAt) metaSent++;
      if (os?.linkedinSentAt) linkedinSent++;
      if (os?.emailRepliedAt) emailReplied++;

      const cls = bAny.replyClassification;
      if (cls === "hot") hot++;
      else if (cls === "warm") warm++;
      else if (cls === "objection") objection++;
      else if (cls === "cold") cold++;

      const score = b.leadScore ?? 0;
      if (score > 0) { scoreSum += score; scoreCount++; }

      if (bAny.websiteQuality?.needsUpgrade === "critical") criticalUpgrade++;
    }

    const total = all.length;
    const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;

    // Pain points
    const painPointCounts: Record<string, number> = {};
    for (const b of all) {
      const pp = (b as any).reviewInsights?.painPoints;
      if (Array.isArray(pp)) {
        for (const p of pp) {
          painPointCounts[p.theme] = (painPointCounts[p.theme] || 0) + 1;
        }
      }
    }

    // A/B subject line test results
    const subjectStats: Record<string, { sent: number; opened: number; replied: number }> = {};
    for (const b of all) {
      const tests = (b as any).subjectLineTests;
      if (Array.isArray(tests)) {
        for (const t of tests) {
          if (!subjectStats[t.variant]) subjectStats[t.variant] = { sent: 0, opened: 0, replied: 0 };
          subjectStats[t.variant].sent += t.sentCount ?? 0;
          subjectStats[t.variant].opened += t.openCount ?? 0;
          subjectStats[t.variant].replied += t.replyCount ?? 0;
        }
      }
    }
    const topSubjectVariants = Object.entries(subjectStats)
      .map(([variant, stats]) => ({
        variant,
        ...stats,
        openRate: stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 1000) / 10 : 0,
        replyRate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.openRate - a.openRate)
      .slice(0, 5);

    // Per-city stats
    const cityCounts: Record<string, { total: number; replied: number }> = {};
    for (const b of all) {
      const city = b.address?.city || "Unknown";
      if (!cityCounts[city]) cityCounts[city] = { total: 0, replied: 0 };
      cityCounts[city].total++;
      if (b.outreachStatus?.emailRepliedAt) cityCounts[city].replied++;
    }

    // Per-vertical stats
    const verticalCounts: Record<string, { total: number; replied: number }> = {};
    for (const b of all) {
      const v = (b as any).vertical || b.categories?.[0] || "Unknown";
      if (!verticalCounts[v]) verticalCounts[v] = { total: 0, replied: 0 };
      verticalCounts[v].total++;
      if (b.outreachStatus?.emailRepliedAt) verticalCounts[v].replied++;
    }

    // 7-day comparison
    const scrapedThisWeek = all.filter((b) => b.createdAt >= weekAgoMs).length;
    const emailedThisWeek = all.filter((b) => b.outreachStatus?.emailSentAt && b.outreachStatus.emailSentAt >= weekAgoMs).length;

    // City campaigns
    const cities = await ctx.db
      .query("cityCampaigns")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
    const citiesDone = cities.filter((c) => c.status === "done").length;
    const citiesTotal = cities.length;

    // Social posts today
    const posts = await ctx.db
      .query("leadGenPosts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
    const postsToday = posts.filter((p) => (p.postedAt ?? 0) >= todayStartMs);
    const redditToday = postsToday.filter((p) => p.platform === "reddit" && p.status === "posted").length;
    const fbGroupToday = postsToday.filter((p) => p.platform === "meta_group" && p.status === "posted").length;
    const youtubeToday = postsToday.filter((p) => p.platform === "youtube" && p.status === "posted").length;
    const twitterToday = postsToday.filter((p) => p.platform === "twitter" && p.status === "posted").length;
    const discordToday = postsToday.filter((p) => p.platform === "discord" && p.status === "posted").length;
    const linkedinGroupToday = postsToday.filter((p) => p.platform === "linkedin_group" && p.status === "posted").length;
    const quoraToday = postsToday.filter((p) => p.platform === "quora").length;
    const nextdoorToday = postsToday.filter((p) => p.platform === "nextdoor").length;

    // All-time social stats
    const allTimePosts = posts.filter((p) => p.status === "posted").length;
    const socialAllTime = {
      reddit: posts.filter((p) => p.platform === "reddit" && p.status === "posted").length,
      fbGroup: posts.filter((p) => p.platform === "meta_group" && p.status === "posted").length,
      youtube: posts.filter((p) => p.platform === "youtube" && p.status === "posted").length,
      twitter: posts.filter((p) => p.platform === "twitter" && p.status === "posted").length,
      discord: posts.filter((p) => p.platform === "discord" && p.status === "posted").length,
      linkedinGroup: posts.filter((p) => p.platform === "linkedin_group" && p.status === "posted").length,
      quora: posts.filter((p) => p.platform === "quora").length,
      nextdoor: posts.filter((p) => p.platform === "nextdoor").length,
      total: allTimePosts,
      logged: posts.filter((p) => p.status === "logged").length,
      failed: posts.filter((p) => p.status === "failed").length,
    };

    return {
      today: { scrapedToday, enrichedToday, emailedToday, metaSentToday, linkedinSentToday, redditToday, fbGroupToday, youtubeToday, twitterToday, discordToday, linkedinGroupToday, quoraToday, nextdoorToday },
      socialAllTime,
      allTime: { total, enriched, withEmail, withOwner, withMeta, withLinkedin, withReviews, emailSent, metaSent, linkedinSent, emailReplied },
      replies: { hot, warm, objection, cold, total: emailReplied },
      enrichmentQuality: {
        ownerPct: total > 0 ? Math.round((withOwner / total) * 100) : 0,
        emailPct: total > 0 ? Math.round((withEmail / total) * 100) : 0,
        metaPct: total > 0 ? Math.round((withMeta / total) * 100) : 0,
        linkedinPct: total > 0 ? Math.round((withLinkedin / total) * 100) : 0,
        reviewsPct: total > 0 ? Math.round((withReviews / total) * 100) : 0,
        avgScore,
        criticalUpgradePct: total > 0 ? Math.round((criticalUpgrade / total) * 100) : 0,
      },
      painPoints: Object.entries(painPointCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
      topCities: Object.entries(cityCounts).sort((a, b) => b[1].total - a[1].total).slice(0, 5),
      topVerticals: Object.entries(verticalCounts).sort((a, b) => b[1].total - a[1].total).slice(0, 5),
      weekComparison: { scrapedThisWeek, emailedThisWeek },
      cities: { done: citiesDone, total: citiesTotal },
      replyRate: emailSent > 0 ? Math.round((emailReplied / emailSent) * 1000) / 10 : 0,
      subjectLineTests: topSubjectVariants,
      dataQuality: {
        badOwnerNames,
        badOwnerPct: withOwner > 0 ? Math.round((badOwnerNames / withOwner) * 100) : 0,
      },
    };
  },
});

// ── Format report as HTML email ──────────────────────────────────────

function formatReportHtml(orgName: string, data: any): string {
  const d = data;
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const painPointRows = d.painPoints.map(([theme, count]: [string, number]) =>
    `<tr><td style="padding:4px 8px;border-bottom:1px solid #333">${theme}</td><td style="padding:4px 8px;border-bottom:1px solid #333;text-align:right">${count} leads</td></tr>`
  ).join("");

  const cityRows = d.topCities.map(([city, stats]: [string, { total: number; replied: number }]) => {
    const rate = stats.total > 0 ? Math.round((stats.replied / stats.total) * 1000) / 10 : 0;
    return `<tr><td style="padding:4px 8px;border-bottom:1px solid #333">${city}</td><td style="padding:4px 8px;border-bottom:1px solid #333;text-align:right">${stats.total}</td><td style="padding:4px 8px;border-bottom:1px solid #333;text-align:right">${rate}%</td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#111;color:#eee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;padding:32px;max-width:600px;border:1px solid #333">

<tr><td style="padding-bottom:24px;border-bottom:1px solid #333">
  <h1 style="margin:0;font-size:20px;color:#fff">Daily Lead Gen Report</h1>
  <p style="margin:4px 0 0;color:#888;font-size:13px">${orgName} — ${date}</p>
</td></tr>

<tr><td style="padding:20px 0">
  <h2 style="margin:0 0 12px;font-size:14px;color:#888;text-transform:uppercase;letter-spacing:1px">Last 24 Hours</h2>
  <table width="100%" style="font-size:14px;color:#ddd">
    <tr><td>Scraped</td><td style="text-align:right;font-weight:bold;color:#60a5fa">${d.today.scrapedToday}</td></tr>
    <tr><td>Enriched</td><td style="text-align:right;font-weight:bold;color:#a78bfa">${d.today.enrichedToday}</td></tr>
    <tr><td>Emails sent</td><td style="text-align:right;font-weight:bold;color:#34d399">${d.today.emailedToday}</td></tr>
    <tr><td>Meta DMs</td><td style="text-align:right;font-weight:bold;color:#38bdf8">${d.today.metaSentToday}</td></tr>
    <tr><td>LinkedIn</td><td style="text-align:right;font-weight:bold;color:#818cf8">${d.today.linkedinSentToday}</td></tr>
  </table>
</td></tr>

<tr><td style="padding:20px 0;border-top:1px solid #333">
  <h2 style="margin:0 0 12px;font-size:14px;color:#888;text-transform:uppercase;letter-spacing:1px">Social Posting (Last 24h / All-Time)</h2>
  <table width="100%" style="font-size:13px;color:#ddd">
    <tr><td>Reddit posts</td><td style="text-align:right">${d.today.redditToday} today / ${d.socialAllTime?.reddit ?? 0} total</td></tr>
    <tr><td>Facebook Group posts</td><td style="text-align:right">${d.today.fbGroupToday} today / ${d.socialAllTime?.fbGroup ?? 0} total</td></tr>
    <tr><td>YouTube comments</td><td style="text-align:right">${d.today.youtubeToday} today / ${d.socialAllTime?.youtube ?? 0} total</td></tr>
    <tr><td>Twitter/X posts</td><td style="text-align:right">${d.today.twitterToday ?? 0} today / ${d.socialAllTime?.twitter ?? 0} total</td></tr>
    <tr><td>LinkedIn Group posts</td><td style="text-align:right">${d.today.linkedinGroupToday ?? 0} today / ${d.socialAllTime?.linkedinGroup ?? 0} total</td></tr>
    <tr><td>Discord posts</td><td style="text-align:right">${d.today.discordToday ?? 0} today / ${d.socialAllTime?.discord ?? 0} total</td></tr>
    <tr><td>Quora questions found</td><td style="text-align:right">${d.today.quoraToday ?? 0} today / ${d.socialAllTime?.quora ?? 0} total</td></tr>
    <tr><td>Nextdoor communities found</td><td style="text-align:right">${d.today.nextdoorToday ?? 0} today / ${d.socialAllTime?.nextdoor ?? 0} total</td></tr>
    <tr><td style="border-top:1px solid #333;padding-top:4px;font-weight:bold">Total posted</td><td style="text-align:right;border-top:1px solid #333;padding-top:4px;font-weight:bold">${(d.today.redditToday + d.today.fbGroupToday + d.today.youtubeToday + (d.today.twitterToday ?? 0) + (d.today.discordToday ?? 0) + (d.today.linkedinGroupToday ?? 0))} today / ${d.socialAllTime?.total ?? 0} total</td></tr>
    ${(d.socialAllTime?.failed ?? 0) > 0 ? `<tr><td style="color:#ef4444">Failed posts</td><td style="text-align:right;color:#ef4444">${d.socialAllTime.failed}</td></tr>` : ""}
  </table>
</td></tr>

<tr><td style="padding:20px 0;border-top:1px solid #333">
  <h2 style="margin:0 0 12px;font-size:14px;color:#888;text-transform:uppercase;letter-spacing:1px">All-Time Totals</h2>
  <table width="100%" style="font-size:14px;color:#ddd">
    <tr><td>Total leads</td><td style="text-align:right;font-weight:bold">${d.allTime.total}</td></tr>
    <tr><td>Enriched</td><td style="text-align:right">${d.allTime.enriched} (${d.allTime.total > 0 ? Math.round((d.allTime.enriched / d.allTime.total) * 100) : 0}%)</td></tr>
    <tr><td>Emailed</td><td style="text-align:right">${d.allTime.emailSent}</td></tr>
    <tr><td>Replied</td><td style="text-align:right;font-weight:bold;color:${d.replyRate >= 5 ? '#34d399' : '#f59e0b'}">${d.replies.total} (${d.replyRate}%)</td></tr>
    <tr><td style="padding-left:16px;color:#888">Hot</td><td style="text-align:right;color:#34d399">${d.replies.hot}</td></tr>
    <tr><td style="padding-left:16px;color:#888">Warm</td><td style="text-align:right;color:#60a5fa">${d.replies.warm}</td></tr>
    <tr><td style="padding-left:16px;color:#888">Objection</td><td style="text-align:right;color:#f59e0b">${d.replies.objection}</td></tr>
    <tr><td style="padding-left:16px;color:#888">Cold</td><td style="text-align:right;color:#ef4444">${d.replies.cold}</td></tr>
    <tr><td>Cities</td><td style="text-align:right">${d.cities.done}/${d.cities.total} done</td></tr>
  </table>
</td></tr>

<tr><td style="padding:20px 0;border-top:1px solid #333">
  <h2 style="margin:0 0 12px;font-size:14px;color:#888;text-transform:uppercase;letter-spacing:1px">Enrichment Quality</h2>
  <table width="100%" style="font-size:13px;color:#ddd">
    <tr><td>Owner found</td><td style="text-align:right">${d.enrichmentQuality.ownerPct}%</td></tr>
    <tr><td>Email found</td><td style="text-align:right">${d.enrichmentQuality.emailPct}%</td></tr>
    <tr><td>Facebook found</td><td style="text-align:right">${d.enrichmentQuality.metaPct}%</td></tr>
    <tr><td>LinkedIn found</td><td style="text-align:right">${d.enrichmentQuality.linkedinPct}%</td></tr>
    <tr><td>Reviews collected</td><td style="text-align:right">${d.enrichmentQuality.reviewsPct}%</td></tr>
    <tr><td>Avg lead score</td><td style="text-align:right;font-weight:bold">${d.enrichmentQuality.avgScore}/100</td></tr>
    <tr><td>Needs website upgrade</td><td style="text-align:right;color:#ef4444">${d.enrichmentQuality.criticalUpgradePct}%</td></tr>
  </table>
</td></tr>

${d.topCities.length > 0 ? `<tr><td style="padding:20px 0;border-top:1px solid #333">
  <h2 style="margin:0 0 12px;font-size:14px;color:#888;text-transform:uppercase;letter-spacing:1px">Top Cities</h2>
  <table width="100%" style="font-size:13px;color:#ddd">
    <tr><th style="text-align:left;color:#888;padding:4px 8px">City</th><th style="text-align:right;color:#888;padding:4px 8px">Leads</th><th style="text-align:right;color:#888;padding:4px 8px">Reply %</th></tr>
    ${cityRows}
  </table>
</td></tr>` : ""}

${d.painPoints.length > 0 ? `<tr><td style="padding:20px 0;border-top:1px solid #333">
  <h2 style="margin:0 0 12px;font-size:14px;color:#888;text-transform:uppercase;letter-spacing:1px">Pain Points Detected</h2>
  <table width="100%" style="font-size:13px;color:#ddd">
    ${painPointRows}
  </table>
</td></tr>` : ""}

${d.subjectLineTests?.length > 0 ? `<tr><td style="padding:20px 0;border-top:1px solid #333">
  <h2 style="margin:0 0 12px;font-size:14px;color:#888;text-transform:uppercase;letter-spacing:1px">A/B Subject Line Performance</h2>
  <table width="100%" style="font-size:13px;color:#ddd">
    <tr style="color:#888"><td style="padding:4px 8px">Variant</td><td style="padding:4px 8px;text-align:right">Sent</td><td style="padding:4px 8px;text-align:right">Open Rate</td><td style="padding:4px 8px;text-align:right">Reply Rate</td></tr>
    ${d.subjectLineTests.map((t: any) =>
      `<tr><td style="padding:4px 8px;border-bottom:1px solid #333">${t.variant}</td><td style="padding:4px 8px;border-bottom:1px solid #333;text-align:right">${t.sent}</td><td style="padding:4px 8px;border-bottom:1px solid #333;text-align:right;color:${t.openRate >= 25 ? '#22c55e' : t.openRate >= 15 ? '#eab308' : '#ef4444'}">${t.openRate}%</td><td style="padding:4px 8px;border-bottom:1px solid #333;text-align:right">${t.replyRate}%</td></tr>`
    ).join("")}
  </table>
  <p style="font-size:11px;color:#888;margin:8px 0 0">Tip: Converge on variants with 25%+ open rates. Retire variants below 10%.</p>
</td></tr>` : ""}

${d.dataQuality?.badOwnerNames > 0 ? `<tr><td style="padding:20px 0;border-top:1px solid #333">
  <h2 style="margin:0 0 12px;font-size:14px;color:#f59e0b;text-transform:uppercase;letter-spacing:1px">Data Quality Alerts</h2>
  <ul style="padding-left:20px;color:#ddd;font-size:13px;line-height:1.6">
    <li><strong style="color:#ef4444">${d.dataQuality.badOwnerNames} leads (${d.dataQuality.badOwnerPct}%) have invalid owner names</strong> — likely extracted from review text instead of actual business owners. Re-run enrichment or check Apollo.io credits.</li>
  </ul>
</td></tr>` : ""}

<tr><td style="padding:20px 0;border-top:1px solid #333">
  <h2 style="margin:0 0 12px;font-size:14px;color:#888;text-transform:uppercase;letter-spacing:1px">Marketing Manager Analysis & Improvements</h2>
  <div style="font-size:13px;color:#ddd;line-height:1.6">
    ${d.allTime.total === 0 ? `
      <p style="color:#f59e0b;font-weight:bold">No leads generated yet. Here's your action plan:</p>
      <ol style="padding-left:20px;color:#ddd">
        <li><strong>Create a campaign:</strong> Go to Scheduled Tasks → Quick Test → select state + verticals → Run Test</li>
        <li><strong>Verify APIs:</strong> Settings → check Outscraper, Firecrawl, Apollo all show "Connected"</li>
        <li><strong>Connect email:</strong> Settings → Gmail SMTP → add your Gmail + App Password</li>
        <li><strong>For local dev:</strong> Ensure ngrok is running and NEXT_PUBLIC_APP_URL matches in Convex env</li>
        <li><strong>Start small:</strong> Test with 5 leads first, then scale to 50, 100, 200+</li>
      </ol>
    ` : `
      <p style="color:#60a5fa;font-weight:bold;margin-bottom:8px">Based on thorough analysis of ${d.allTime.total} leads:</p>
      <ol style="padding-left:20px;color:#ddd">

        ${d.today.scrapedToday === 0 && d.allTime.total > 0 ? `<li><strong style="color:#f59e0b">NO ACTIVITY in last 24h.</strong> Check if scheduled tasks are running. Verify ngrok/Vercel URL is accessible from Convex cloud.</li>` : ""}

        ${d.enrichmentQuality.emailPct < 50 ? `<li><strong style="color:#ef4444">CRITICAL — Email coverage only ${d.enrichmentQuality.emailPct}%.</strong> ${d.allTime.total - d.allTime.withEmail} leads have no email. Actions: (1) Ensure Hunter.io is connected as last-resort email finder, (2) Increase Firecrawl credits for deeper website scraping, (3) Check if Apollo.io plan has enough credits.</li>` : `<li style="color:#34d399">Email coverage good at ${d.enrichmentQuality.emailPct}%.</li>`}

        ${d.enrichmentQuality.ownerPct < 60 ? `<li><strong style="color:#f59e0b">Owner name gap — only ${d.enrichmentQuality.ownerPct}%.</strong> Apollo.io is the primary source. Check credits or upgrade plan. Without owner names, emails use generic "Hi there" which reduces reply rates by 40%.</li>` : ""}

        ${d.dataQuality?.badOwnerPct > 20 ? `<li><strong style="color:#ef4444">DATA QUALITY: ${d.dataQuality.badOwnerPct}% of owner names are invalid</strong> (extracted from reviews, not real names). The owner extraction filter has been improved — clear old data and re-scrape for clean results.</li>` : ""}

        ${d.replyRate === 0 && d.allTime.emailSent > 0 ? `<li><strong style="color:#ef4444">ZERO REPLIES from ${d.allTime.emailSent} emails.</strong> Urgent actions: (1) Check if emails land in spam (test with mail-tester.com), (2) Review sent email content — are they too generic?, (3) Try pain-point-based hooks instead of rating-only hooks, (4) Consider warming the Gmail account first with 5-10 manual sends.</li>` : ""}
        ${d.replyRate > 0 && d.replyRate < 3 ? `<li><strong style="color:#f59e0b">Reply rate ${d.replyRate}% is below target (5%).</strong> Try: (1) Lead with specific Google review quotes, (2) Reference pain points from reviews, (3) A/B test subject lines, (4) Send at 9-10am local time.</li>` : ""}
        ${d.replyRate >= 5 ? `<li style="color:#34d399"><strong>Reply rate ${d.replyRate}% is excellent!</strong> Keep current approach. Consider scaling volume.</li>` : ""}

        ${d.enrichmentQuality.criticalUpgradePct > 20 ? `<li><strong style="color:#60a5fa">OPPORTUNITY: ${d.enrichmentQuality.criticalUpgradePct}% of leads have outdated/critical websites.</strong> These are your BEST prospects — they clearly need what you sell. Prioritize these in outreach queue.</li>` : ""}

        ${d.enrichmentQuality.reviewsPct < 50 ? `<li><strong>Reviews collection only ${d.enrichmentQuality.reviewsPct}%.</strong> Reviews are your best email personalization hook. Check Outscraper API key and credits.</li>` : ""}

        ${d.painPoints.length > 0 ? `<li><strong>Top pain points detected:</strong> ${d.painPoints.map(([t, c]: [string, number]) => `"${t}" (${c} leads)`).join(", ")}. Use the pre-built email hooks for these — they convert 2-3x better than generic outreach.</li>` : ""}

        ${d.topCities.length > 1 ? (() => {
          const getReplyRate = ([, stats]: [string, { total: number; replied: number }]) =>
            stats.total > 0 ? stats.replied / stats.total : 0;
          const best = d.topCities.reduce((a: [string, { total: number; replied: number }], b: [string, { total: number; replied: number }]) =>
            getReplyRate(b) > getReplyRate(a) ? b : a
          );
          const worst = d.topCities.reduce((a: [string, { total: number; replied: number }], b: [string, { total: number; replied: number }]) =>
            b[1].total > 2 && getReplyRate(b) < getReplyRate(a) ? b : a
          );
          return `<li><strong>City performance:</strong> Best: ${best[0]} (${best[1].total} leads). Consider adding suburbs of ${best[0]} for higher density. ${worst[0] !== best[0] ? `Worst: ${worst[0]} — consider pausing or trying different angle.` : ""}</li>`;
        })() : ""}

        <li><strong>Weekly trend:</strong> ${d.weekComparison.scrapedThisWeek} leads scraped this week, ${d.weekComparison.emailedThisWeek} emailed. ${d.weekComparison.scrapedThisWeek > d.weekComparison.emailedThisWeek * 2 ? "Enrichment/email is falling behind scraping — consider reducing daily scrape target or running pipeline more frequently." : "Pipeline throughput looks balanced."}</li>

        <li><strong>Next steps:</strong> Check the Insights page in the app for detailed per-lead recommendations. The Marketing Manager will continue analyzing and improving daily.</li>
      </ol>
    `}
  </div>
</td></tr>

<tr><td style="padding:20px 0;border-top:1px solid #333">
  <h2 style="margin:0 0 12px;font-size:14px;color:#60a5fa;text-transform:uppercase;letter-spacing:1px">App Enhancement Suggestions</h2>
  <div style="font-size:13px;color:#ddd;line-height:1.6">
    <p style="color:#888;margin-bottom:8px">Based on current performance and competitor analysis, here are recommended platform improvements:</p>
    <ol style="padding-left:20px;color:#ddd">

      ${d.allTime.emailSent > 0 && d.replyRate < 5 ? `<li><strong style="color:#f59e0b">Email Warmup System:</strong> Your reply rate is ${d.replyRate}%. Emails may be landing in spam. Implement gradual sending volume ramp-up (5/day → 15 → 25 → full limit over 4 weeks) to build Gmail reputation. Competitors like Instantly.ai and Smartlead ALL offer this.</li>` : ""}

      ${d.allTime.emailSent > 10 ? `<li><strong style="color:#a78bfa">A/B Subject Line Testing:</strong> You've sent ${d.allTime.emailSent} emails. Start testing 3 subject line variants per send to find what resonates. Schema is ready — just needs activation. Expected: 15-25% more opens.</li>` : ""}

      ${(d.socialAllTime?.total ?? 0) === 0 ? `<li><strong style="color:#ef4444">Social Posting Not Active:</strong> Zero social posts detected. Connect Reddit, Twitter, or YouTube accounts in Settings to start community posting. Social presence builds brand awareness and drives inbound leads.</li>` : ""}
      ${(d.socialAllTime?.reddit ?? 0) === 0 && (d.socialAllTime?.total ?? 0) > 0 ? `<li><strong>Reddit:</strong> No Reddit posts yet. Create a Reddit account, build karma, and start sharing helpful content in subreddits related to your verticals.</li>` : ""}
      ${(d.socialAllTime?.quora ?? 0) > 0 ? `<li><strong>Quora:</strong> ${d.socialAllTime.quora} questions found but Quora requires manual answers. Set aside 15 min/day to answer these — each answer builds long-term SEO authority.</li>` : ""}
      ${(d.today.quoraToday ?? 0) === 0 && (d.today.nextdoorToday ?? 0) === 0 ? `<li><strong>Quora + Nextdoor Discovery:</strong> Not running. Enable these in your campaign social settings — they find threads where potential customers are asking for recommendations.</li>` : ""}

      <li><strong style="color:#38bdf8">SMS Outreach Channel:</strong> Add Twilio SMS as a follow-up channel. Text messages have 98% open rate vs 20% for email. A simple "Hi Mike, just sent you an email about your website" text doubles contact rates.</li>

      <li><strong style="color:#34d399">Gmail Reply Detection:</strong> Build IMAP polling to auto-detect email replies and classify them as hot/warm/cold. Currently you have to check Gmail manually — this is the #1 feature all competitors offer.</li>

      ${d.enrichmentQuality.emailPct < 70 ? `<li><strong style="color:#f59e0b">Waterfall Enrichment:</strong> Email coverage at ${d.enrichmentQuality.emailPct}%. Add RocketReach or Snov.io as additional email sources after Hunter.io. Clay.com achieves 78% coverage with multi-source waterfall.</li>` : ""}

      <li><strong>Dynamic Image Personalization:</strong> Generate side-by-side screenshots showing "Your current website vs. what it could look like." Lemlist proves this increases engagement 20-40%.</li>

      <li><strong>Contact Form Auto-Submit:</strong> ${d.allTime.total - d.allTime.withEmail} leads have no email. For those with contact forms detected, auto-fill and submit the form as an alternative outreach channel.</li>

      ${d.allTime.total > 50 ? `<li><strong>Predictive Lead Scoring:</strong> With ${d.allTime.total} leads, you have enough data to build a model predicting which leads are most likely to respond. Focus outreach on high-probability leads first.</li>` : ""}

      <li><strong>Smart Send Timing:</strong> Track when opens/replies happen by hour and day. After 50+ sends, auto-schedule emails for the optimal window (typically Tue-Thu, 9-11am local time).</li>

    </ol>
  </div>
</td></tr>

<tr><td style="padding:20px 0;border-top:1px solid #333;color:#666;font-size:11px">
  Generated by Marketing Manager AI Agent<br/>
  ${orgName} Lead Generation Platform
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── Main cron handler: generate and send report for all active orgs ──

export const generateAndSend = internalAction({
  handler: async (ctx) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const schedulerSecret = process.env.SCHEDULER_INTERNAL_SECRET;

    if (!schedulerSecret) {
      console.error("[marketing-report] No SCHEDULER_INTERNAL_SECRET set");
      return;
    }

    // Get all orgs with active campaigns
    const orgs = await ctx.runQuery(internal.marketingReport.getActiveOrgs);

    for (const org of orgs) {
      try {
        // Get report data
        const data = await ctx.runQuery(internal.marketingReport.getReportData, {
          organizationId: org.orgId as any,
        });

        // Always send report — even with 0 leads, the Marketing Manager should
        // analyze the process and suggest improvements

        // Format HTML email
        const reportHtml = formatReportHtml(org.orgName, data);

        // Send email via API route
        const res = await fetch(`${appUrl}/api/reports/send-marketing-report`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Scheduler-Secret": schedulerSecret,
          },
          body: JSON.stringify({
            organizationId: org.orgId,
            reportHtml,
            subject: `Daily Lead Report — ${org.orgName} — ${new Date().toLocaleDateString()}`,
          }),
        });

        if (res.ok) {
          console.log(`[marketing-report] Sent report for ${org.orgName}`);
        } else {
          const err = await res.text();
          console.error(`[marketing-report] Failed for ${org.orgName}:`, err);
        }

        // Save as agent insight
        try {
          await ctx.runMutation(internal.agentInsights.createFromServer, {
            organizationId: org.orgId as any,
            category: "performance",
            title: `Daily Report — ${new Date().toLocaleDateString()}`,
            summary: `Scraped: ${data.today.scrapedToday} | Emailed: ${data.today.emailedToday} | Replied: ${data.replies.total} (${data.replyRate}%)`,
            details: JSON.stringify(data, null, 2),
            priority: data.replyRate < 3 ? "high" : data.replyRate < 6 ? "medium" : "low",
          });
        } catch (err) {
          console.error(`[marketing-report] Failed to save insight for ${org.orgName}:`, err);
        }
      } catch (err) {
        console.error(`[marketing-report] Error for org ${org.orgId}:`, err);
      }
    }
  },
});
