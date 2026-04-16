# Lead Generation Application Audit Report

**Date:** April 6, 2026
**Scope:** Full codebase review with diff against April 5 audit
**Auditor:** AI Assistant (Scheduled Task)

---

## Executive Summary

Day 8 of continuous monitoring. The application pipeline remains **stable with zero regressions**. The core pipeline — **scrape → enrich → score → send (Resend + Gmail SMTP + contact form) → track opens → detect replies via IMAP/Resend webhooks → classify → auto-follow-up → webhook dispatch** — continues to operate correctly.

**No code changes have been made since April 1.** All critical files retain the same modification timestamps. The four P1/P2 data-quality bugs are now **5 days overdue**, and today's audit uncovered a **new significant finding**: a centralized `webhookDispatch.ts` Convex module exists (63 lines, created April 1) but is **never actually called** by any route or function — the inline fire-and-forget webhook code in `direct-email-tools.ts` and `inbox/poll/route.ts` remains in exclusive use. The fix was written but never wired in.

The timing optimizer continues to build an increasingly biased model of send-time performance. The send timing data gap (P1 bug, 5 days open) means the optimizer's reply-weighted scoring is now running almost entirely on open events, not reply events, for Gmail SMTP sends — the opposite of its design intent.

---

## 1. Changes Since Yesterday's Audit (April 5 → April 6)

### 1.1 No Code Changes Detected

File-by-file verification confirms **zero modifications** to any core files since April 1. Modification timestamps are identical to yesterday's audit:

| File | Last Modified | Status |
|------|--------------|--------|
| `direct-email-tools.ts` | April 1 08:49 | **Unchanged** — `recordSentEmail` still missing; tracking pixel still missing |
| `inbox/poll/route.ts` | April 1 08:49 | **Unchanged** — `sendTimingAnalytics.recordReply` still missing |
| `contact-form-tools.ts` | April 1 08:46 | **Unchanged** — line 192 still records `channel: "email"` |
| `outreachCron.ts` | April 1 08:48 | Unchanged |
| `schema.ts` | April 1 08:47 | Unchanged |
| `businesses.ts` | March 31 09:07 | Unchanged |
| `leads.ts` | March 30 08:41 | Unchanged |
| `webhookDispatch.ts` | April 1 (est.) | **NEW FINDING — see Section 2.6** |

- Tool files in `apps/web/src/lib/tools/`: **41 files** (unchanged since Day 1)
- API routes: **29 routes** (unchanged since Day 1)
- No SMS/Twilio integration files anywhere in `apps/web/src/`
- No new Convex functions or schema changes

**Assessment:** Sixth consecutive day with no code changes. The four bugs that could each be fixed in under 10 minutes are now representing a full week of compounding data quality debt.

---

## 2. Persistent Issues (Carried Forward + New Finding)

### 2.1 `recordSentEmail` Missing from Resend Tool — P1 (Day 5 Open)

**File:** `apps/web/src/lib/tools/direct-email-tools.ts` (after line 205)
**Confirmed:** The code path from lines 190–205 calls `updateOutreachStatus` and `updateEmailStatus` (for the Resend message ID) but never calls `businesses.recordSentEmail`. The `sentEmails` array on business records only contains Gmail-sent email content. Every Resend email sent in the past 5+ days has no content audit trail.
**CAN-SPAM risk:** Commercial email content must be retained for compliance.
**Fix:** Add `businesses.recordSentEmail` call with subject, body, provider "resend", and messageId after line 205.
**Effort:** 5 minutes. **Now 5 days overdue.**

### 2.2 IMAP Reply Timing Analytics Not Recorded — P1 (Day 5 Open)

**File:** `apps/web/src/app/api/inbox/poll/route.ts` (after line 153)
**Confirmed:** The IMAP poller at lines 140–186 handles reply detection, classification, and webhook dispatch — but never calls `sendTimingAnalytics.recordReply`. The `recordReply` mutation exists and is correct in `convex/sendTimingAnalytics.ts` (line 54), waiting to be called.
**Impact:** The send timing optimizer in `outreachCron.ts` uses a formula where replies are weighted 10× more than opens (`replyCount × 10 + openCount × 2`). With zero IMAP replies recorded, the optimizer is effectively operating as an open-rate optimizer, not a reply-rate optimizer. After 5 days, this bias is deeply embedded in the stored analytics data.
**Fix:** Add `sendTimingAnalytics.recordReply` call after line 153 using `matchedBusiness.outreachStatus.emailSentAt` as the sent timestamp.
**Effort:** 5 minutes. **Now 5 days overdue.**

### 2.3 Resend Direct Email Tool Missing Open Tracking Pixel — P2 (Day 4 Open)

**File:** `apps/web/src/lib/tools/direct-email-tools.ts`
**Confirmed:** The Gmail tool (`gmail-email-tools.ts`) injects a self-hosted open tracking pixel via `/api/track/open`. The Resend tool does not. Resend emails are only tracked via Resend's own webhook (deliveries, opens, bounces), not the self-hosted pixel that also triggers `checkAndAdvanceSequence`. This creates sequence advancement inconsistency between the two email channels.
**Effort:** 5 minutes.

### 2.4 Contact Form Tool Records as `channel: "email"` — P2 (Day 6 Open)

**File:** `apps/web/src/lib/tools/contact-form-tools.ts`, line 192
**Confirmed:** Line 192 reads `channel: "email", // Treat form submission as email-equivalent`. The schema's `formSubmittedAt` field in `outreachStatus` (schema line 840) goes unused for this path. Every contact form submission is counted as an email send in analytics and channel attribution.
**Fix:** Change to `channel: "form"` and use `formSubmittedAt`.
**Effort:** 2 minutes. **Now 6 days overdue.**

### 2.5 IMAP Reply Text Extraction Still Naive — P2 (Day 6 Open)

The IMAP poller passes raw email text (including MIME boundaries and HTML tags from multipart messages) to the AI reply classifier. Mobile email clients (iOS Mail, Gmail mobile) commonly send HTML-only or multipart replies. This degrades classification accuracy for a significant fraction of real-world replies.
**Fix:** Install `mailparser` for proper MIME parsing before classification.
**Effort:** 30 minutes.

### 2.6 `webhookDispatch.ts` Exists But Is Never Called — P2 (NEW FINDING)

**File:** `apps/web/convex/webhookDispatch.ts`
**Discovery:** A centralized `webhookDispatch` Convex module (63 lines) was created on April 1 with a proper `dispatch` internal action. This module correctly handles event filtering, structured payload formatting, error logging, and response status checking. However, **it is never called from any file in the codebase** — confirmed by grepping all `.ts` files in `apps/web/src/` and `apps/web/convex/` for `webhookDispatch.dispatch`.

The inline fire-and-forget webhook code remains the only active dispatch path:
- `direct-email-tools.ts` lines 229–238: `fetch(wh.url, ...).catch(() => {})` for `lead.emailed`
- `inbox/poll/route.ts` lines 167–185: `fetch(wh.url, ...).catch(() => {})` for `lead.replied`

This means the `webhookDispatch.ts` module is dead code. The correct fix exists but was never wired in. The inline paths continue to silently swallow errors with no retry, no logging of failures, and no delivery confirmation.

**Impact:** Any CRM, Zapier, or Make integration relying on `lead.emailed` or `lead.replied` webhooks has been receiving silent delivery failures since the beginning without any visibility.
**Fix:** Replace the inline `fetch` blocks with calls to `internal.webhookDispatch.dispatch`.
**Effort:** 30 minutes (already most of the work is done in `webhookDispatch.ts`).

### 2.7 `batchCreateFromServer` O(N×M) Dedup — P3 (Day 7 Open)

**File:** `apps/web/convex/leads.ts`, lines 268–286
The name+company dedup loads all org leads via `.collect()` for every lead in the batch. At scale (10,000 leads × 50-lead batch = 500,000 comparisons), this will cause timeout or memory issues.
**Fix:** Add a composite index `by_organizationId_name_company` or switch to `.filter().first()`.
**Effort:** 30 minutes.

### 2.8 `businesses.list` Uses `.collect()` Without Pagination — P3 (Day 7 Open)

**File:** `apps/web/convex/businesses.ts`, lines 19–47
All three query paths call `.collect()` loading entire result sets, then slice in memory. Not urgent at current scale but will spike memory at large orgs.
**Fix:** Replace `.collect()` + `.slice(0, limit)` with `.take(limit)`.
**Effort:** 15 minutes.

### 2.9 `marketingReport.getActiveOrgs` Full Table Scans — P3 (Day 7 Open)

**File:** `apps/web/convex/marketingReport.ts`, lines 8–37
Scans `scheduledTasks`, `businesses`, and `organizations` tables entirely via `.collect()` then deduplicates in a `Set`. Acceptable at current scale, problematic at 100+ orgs.
**Effort:** 30 minutes.

### 2.10 Instantly API Key Handling Incomplete — P4

**File:** `apps/web/src/app/api/leads/instantly-replies/route.ts`
Always falls back to the global env var, ignoring per-org credentials stored in `providerKeys`.

---

## 3. Lead Gen Pipeline Health Assessment (April 5 → April 6)

| Metric | April 5 | April 6 | Change |
|--------|---------|---------|--------|
| All critical packages installed | ✅ Verified | ✅ Verified | No change |
| Puppeteer XPath selectors | ✅ Fixed | ✅ Fixed | No change |
| IMAP `unseen` search key | ✅ Correct | ✅ Correct | No change |
| Two-step unsubscribe | ✅ Live | ✅ Live | No change |
| Booking link in follow-ups | ✅ Live | ✅ Live | No change |
| Immediate hot-lead follow-up | ✅ Live | ✅ Live | No change |
| Outbound webhook dispatch (centralized module) | ⚠️ Module exists, never wired | ⚠️ Module exists, never wired | **Confirmed — dead code** |
| Outbound webhook dispatch (inline paths) | ✅ Operational (no error logging) | ✅ Operational (no error logging) | No change |
| A/B subject line stats query | ✅ Available | ✅ Available | No change |
| Email warmup system | ✅ Operational | ✅ Operational | No change |
| Send timing optimizer | ✅ Operational (biased data) | ✅ Operational (biased data) | Bias compounding: Day 5 |
| Domain health checker | ✅ Available (passive) | ✅ Available (passive) | No change |
| Resend webhook handler | ✅ Operational | ✅ Operational | No change |
| Resend `recordSentEmail` parity | ⚠️ Missing | ⚠️ Missing | **Day 5 open** |
| Resend open tracking pixel | ⚠️ Missing | ⚠️ Missing | **Day 4 open** |
| IMAP reply timing analytics | ⚠️ Missing | ⚠️ Missing | **Day 5 open** |
| Contact form channel tracking | ⚠️ Incorrect | ⚠️ Incorrect | **Day 6 open** |
| SMS/WhatsApp via Twilio | ❌ Not started | ❌ Not started | No change |
| Reply intelligence dashboard UI | ❌ Not started | ❌ Not started | No change |
| Personalized landing pages | ❌ Not started | ❌ Not started | No change |

**Overall Pipeline Status:** Stable. No regressions. No new features. Data quality debt from P1 bugs continues to compound.

---

## 4. New Deep-Dive: The Dead `webhookDispatch` Module

### 4.1 What Was Built

The `webhookDispatch.ts` Convex file (created April 1) is a well-structured centralized webhook dispatcher. It:
- Fetches org webhooks via an internal query (avoids passing the entire org object)
- Filters by event type and enabled status
- Wraps each dispatch in a try/catch with `console.error` logging
- Checks `response.ok` and logs non-2xx responses
- Returns a `{ dispatched: N }` result for observability

This is exactly the right architecture. It supersedes both inline dispatch blocks.

### 4.2 Why It Doesn't Work

The module is never imported or called. The `internal.webhookDispatch.dispatch` action signature requires an `organizationId`, `event`, and `payload` — all of which are already available at both call sites. The migration would take approximately 30 minutes and would:

1. Replace 15 lines of inline `fetch` in `direct-email-tools.ts` with a single `await convex.action(api.webhookDispatch.dispatch, { ... })` call
2. Replace 20 lines of inline `fetch` in `inbox/poll/route.ts` with the same pattern

### 4.3 Immediate Value

Once wired in, CRM integrations would immediately gain:
- Error visibility (console logs in Convex for failed deliveries)
- Delivery confirmation counts
- A foundation for adding retry logic in the future

---

## 5. Cumulative Bug Debt Analysis (Day 8)

| Bug | First Identified | Days Open | Fix Time | Cumulative Impact |
|-----|-----------------|-----------|----------|-------------------|
| `recordSentEmail` missing (Resend) | April 2 | **5 days** | 5 min | 5+ days of Resend emails with no content audit trail |
| IMAP reply timing analytics | April 2 | **5 days** | 5 min | 5+ days of biased optimizer — reply scoring near-zero |
| Resend open tracking pixel | April 3 | **4 days** | 5 min | Resend emails miss self-hosted sequence advancement |
| Contact form channel mislabel | April 1 | **6 days** | 2 min | All form submissions miscounted as emails in analytics |
| IMAP reply MIME parsing | April 1 | **6 days** | 30 min | Degraded reply classification accuracy (mobile clients) |
| `webhookDispatch` not wired in | April 1 | **6 days** | 30 min | CRM webhook errors invisible; retry module sits unused |
| `batchCreateFromServer` O(N×M) | March 31 | **7 days** | 30 min | Scale risk; not urgent at current volume |
| `businesses.list` no pagination | March 31 | **7 days** | 15 min | Memory spike risk on large orgs |
| `marketingReport` table scans | March 31 | **7 days** | 30 min | Scale risk; acceptable now |

**Total estimated fix time for all P1+P2 bugs: ~82 minutes** (up from ~62 minutes last audit due to the newly identified `webhookDispatch` wiring gap).

---

## 6. Feature Recommendations (Updated Priority)

### 6.1 SMS Channel via Twilio — Priority: CRITICAL (Week 2 Overdue)

This remains the single highest-ROI unimplemented feature. The Twilio MCP connector is available in this environment with `CreateMessage` and `ListMessage` tools confirmed accessible.

Key facts (unchanged):
- SMS open rate: ~98% vs cold email ~22% — 4-5× multiplier on every lead contacted
- Local business owners respond to SMS at dramatically higher rates than cold email
- The schema, cron, and daily count tracking all support "sms" as a channel with zero schema changes required
- The `outreachDailyCounts` table already tracks per-channel counts; adding "sms" requires only a new tool file and one schema field (`smsSentAt`)

**Implementation path:**
1. `apps/web/src/lib/tools/sms-tools.ts` — new file, ~150 lines
2. `smsSentAt: v.optional(v.number())` added to `outreachStatus` in schema
3. SMS step added to outreach sequence in `outreachCron.ts`
4. Inbound SMS webhook route at `/api/webhooks/sms/route.ts`
5. Use Twilio `CreateMessage` for sends; `ListMessage` for reply polling

**Recommended multi-channel sequence:** Email Day 1 → SMS Day 3 (if no open) → Follow-up email Day 7. This pattern typically yields 3-5× the response rate of email alone.
**Estimated effort:** 3-4 hours.

### 6.2 Backfill Timing Analytics Data — Priority: HIGH (New)

Once the IMAP reply recording bug (Section 2.2) is fixed, 5 days of biased data will remain in `sendTimingAnalytics`. The backfill approach:
- Query all businesses in the org where `outreachStatus.emailRepliedAt` is set AND `outreachStatus.emailSentAt` is set
- For each, call `sendTimingAnalytics.recordReply` with the `emailSentAt` timestamp
- This retroactively corrects the reply counts for all historical time slots

Without this backfill, fixing the bug forward only corrects new data; the optimizer will continue making decisions partially based on 5 days of reply-free historical slots.
**Estimated effort:** 30 minutes (a one-time Convex migration action).

### 6.3 Reply Intelligence Dashboard — Priority: HIGH

All backend data exists and is being collected. The missing piece is a frontend UI page showing:
- Reply breakdown by classification (hot/warm/objection/cold/auto_reply)
- Conversion funnel: scraped → enriched → contacted → opened → replied → qualified → won
- A/B subject line performance table (data already collected in `subjectLineTests`)
- Optimal send time heatmap (data in `sendTimingAnalytics`)
- Lead score distribution histogram
- Top objections extracted from `emailReplies` text

The `sendTimingAnalytics` table, `subjectLineTests` array, `replyClassification` field, and `pipelineStage` field are all populated and ready to visualize.
**Estimated effort:** 1 day.

### 6.4 Dynamic Lead Scoring V2 — Priority: HIGH

The current `leadScore` is set once at enrichment and never updated. Schema has `leadScoreVersion` (line 849) indicating versioned scoring was always the intent. Behavioral signals to add:
- Email open: +5 points (Resend webhook already fires)
- Email reply (hot): +25 points (IMAP poller already classifies)
- Email reply (warm): +15 points
- Email bounce: score → 0
- Unsubscribe: score → -1 (permanent do-not-contact)

The Resend webhook handler (`webhooks/resend/route.ts`) already processes all these events — adding score mutations is ~10 lines per event type in the existing handler.
**Estimated effort:** 4 hours.

### 6.5 Personalized Pre-Send Landing Pages — Priority: HIGH

The `reviewInsights` schema (lines 904-916) already stores `theme`, `evidence`, `solution`, and `emailHook` per pain point per business. This is landing page content that could be auto-rendered at `/p/[businessSlug]`. Each business would get a unique URL included in their outreach email showing their specific pain points, a matched case study, and the booking CTA. This typically increases conversion rates by 20-40% vs generic landing pages.
**Estimated effort:** 1-2 days.

### 6.6 AI-Powered Objection Handling — Priority: MEDIUM-HIGH

Current: IMAP poller classifies replies into hot/warm/objection/cold. Enhancement: extract specific objection type (price, timing, "not interested," "already have a solution"), generate a tailored rebuttal using the business's own `reviewInsights`, track which rebuttal strategies convert best per `vertical`. The schema already supports `emailReplies` storage and `vertical` segmentation.
**Estimated effort:** 1 day.

### 6.7 Domain Health Auto-Pause Cron — Priority: MEDIUM

The `/api/domain-health` route is passive (never called automatically). A daily cron that:
1. Checks each sending domain's health score
2. Alerts org admin if score < 60
3. Auto-pauses outreach if score < 40 or 24h bounce rate > 5%

Would protect the most valuable long-term asset: sender domain reputation. A single domain blacklisting event can kill months of warmup work.
**Estimated effort:** 3-4 hours.

### 6.8 Webhook Retry with Exponential Backoff — Priority: MEDIUM

Now that `webhookDispatch.ts` exists as an Convex internal action, adding retry logic is straightforward: add a `webhookRetryQueue` table, schedule retries with exponential backoff on HTTP failure, and add a delivery log per webhook event. This would turn webhook delivery from a best-effort fire-and-forget into a guaranteed-delivery system — critical for paid CRM integrations.
**Estimated effort:** 2-3 hours.

### 6.9 Multi-Touch Sequence Templates per Vertical — Priority: MEDIUM

The `vertical` field is stored on every business. Pre-built, tested email sequences per vertical (restaurant, medical spa, HVAC, roofing, etc.) would provide consistent messaging, faster execution, and lower token costs than generating each email from scratch with Claude.
**Estimated effort:** 1 day.

### 6.10 LinkedIn InMail Automation — Priority: MEDIUM (Long-Term)

`linkedin-outreach-tools.ts` exists for LinkedIn awareness-phase activity. Adding InMail to the direct outreach sequence — particularly for high-score (`leadScore > 70`) leads who haven't replied — would open a high-value channel. LinkedIn InMail has a ~57% open rate.
**Estimated effort:** High (OAuth complexity + rate limit management).

---

## 7. Updated Priority Matrix

| Priority | Feature/Fix | Impact | Effort | Days Open |
|----------|-------------|--------|--------|-----------|
| **P1** | Add `recordSentEmail` to Resend tool | Medium | 5 min | **5 days** |
| **P1** | Add reply timing analytics to IMAP poller | High | 5 min | **5 days** |
| **P1** | SMS/WhatsApp via Twilio | Very High | 3-4 hours | — |
| **P2** | Add open tracking pixel to Resend template | Medium | 5 min | **4 days** |
| **P2** | Wire up `webhookDispatch.ts` centralized module | Medium | 30 min | **6 days** |
| **P2** | Contact form channel tracking fix | Low | 2 min | **6 days** |
| **P2** | MIME parser for IMAP replies | Medium | 30 min | **6 days** |
| **P2** | Backfill 5 days of timing analytics data | High | 30 min | — |
| **P2** | Reply intelligence dashboard | High | 1 day | — |
| **P2** | Dynamic lead scoring V2 | Medium-High | 4 hours | — |
| **P2** | Personalized landing pages | Very High | 1-2 days | — |
| **P2** | AI objection handling | High | 1 day | — |
| **P3** | Domain health auto-pause cron | Medium | 3-4 hours | — |
| **P3** | Webhook retry with backoff | Medium | 2-3 hours | — |
| **P3** | Multi-touch sequence templates per vertical | Medium | 1 day | — |
| **P3** | `batchCreateFromServer` dedup optimization | Low | 30 min | **7 days** |
| **P3** | `businesses.list` pagination | Low-Med | 15 min | **7 days** |
| **P3** | `marketingReport` full table scans | Low | 30 min | **7 days** |
| **P4** | LinkedIn InMail automation | High | High | — |
| **P4** | Instantly per-org credentials | Low | Low | **7 days** |

---

## 8. "Best Lead Gen App on the Planet" — Week 2 Strategic Assessment

### 8.1 Infrastructure Strengths (Confirmed, Unchanged)

The platform's foundation remains solid:

- **Outreach automation:** Hourly cron with indexed queries, staggered batches, data-driven send timing (despite current data bias), and automatic retry with backoff. Multi-model approach (Sonnet for email writing, Haiku for classification) optimizes cost vs. quality.
- **Email warmup:** 4-week ramp (5→15→25→50→unlimited/day) with per-account tracking. Production-grade deliverability protection.
- **Lead enrichment:** Three-tier dedup, review insight extraction with pain points, website quality scoring, multi-source social data. Rich personalization data few competitors match.
- **Compliance:** Two-step unsubscribe, bounce/complaint handling, CAN-SPAM links in every email.
- **41 tools** spanning email, social, prospecting, analysis, and orchestration.

### 8.2 The Three Gaps Holding the Platform Back

**Gap 1: Multi-Channel Orchestration** — Email-only outreach has a hard ceiling around 22% open rate. SMS is available (Twilio MCP is connected), the schema supports it, and the cron can dispatch it. This is the single largest conversion lever available right now and has been identified for 7 consecutive days without action.

**Gap 2: Feedback Loop Integrity** — The P1 bugs (now 5 days overdue, 17 minutes total to fix) mean the send timing optimizer is making worse decisions with each passing day. The optimizer was designed to improve over time by learning from reply timing data. Instead, it's drifting toward optimizing for opens, not replies. This is the opposite of what matters for conversion.

**Gap 3: Conversion Intelligence** — The system contacts leads and classifies their replies but doesn't close the loop. Dynamic lead scoring, objection-type-specific follow-ups, and personalized landing pages are the difference between a high-volume outreach tool and a high-conversion lead generation platform. The data for all three already exists in the schema.

### 8.3 The Week 2 Action Plan

If the goal is to become the best lead gen app on the planet, Week 2 should accomplish exactly these things, in order:

1. **Fix the 4 data-quality bugs** (17 minutes total) — restore data integrity before adding anything new
2. **Backfill timing analytics** (30 minutes) — correct 5 days of biased optimizer data
3. **Wire up `webhookDispatch.ts`** (30 minutes) — the fix already exists; just connect it
4. **Add SMS via Twilio** (3-4 hours) — largest single conversion multiplier available
5. **Dynamic lead scoring V2** (4 hours) — makes every subsequent decision smarter
6. **Reply intelligence dashboard** (1 day) — makes the data visible and actionable

**Total estimated time for Week 2 plan: ~12 hours.** These six items would produce a measurable jump in response rates (SMS alone), restore data integrity, fix invisible CRM failures, and give operators the visibility they need to optimize campaigns.

---

## 9. Summary

**Day 8 of monitoring. No regressions. No new features. No code changes since April 1.**

**New finding:** `webhookDispatch.ts` is a dead module — correctly written but never called. Inline fire-and-forget webhook dispatch remains the only active path, silently swallowing CRM delivery failures.

**Immediate fixes (total: ~82 minutes):**
1. Add `recordSentEmail` to `direct-email-tools.ts` — 5 min
2. Add `sendTimingAnalytics.recordReply` to IMAP poller — 5 min
3. Add open tracking pixel to Resend email template — 5 min
4. Fix contact form channel label — 2 min
5. Wire `webhookDispatch.ts` into both dispatch call sites — 30 min
6. Fix MIME parsing in IMAP reply handler — 30 min

**This week (highest ROI):**
7. **Backfill timing analytics data** — correct 5 days of biased optimizer data. 30 min.
8. **SMS via Twilio** — the #1 conversion lever, ~98% open rate. 3-4 hours.
9. **Dynamic lead scoring V2** — behavioral signals from opens/replies/bounces. 4 hours.
10. **Reply intelligence dashboard** — make all collected data visible. 1 day.
11. **Domain health auto-pause** — protect sender reputation automatically. 3-4 hours.

**Key insight:** The platform is at the end of a critical window. The infrastructure quality is genuinely high — but eight consecutive days without a code change means data quality debt is now a week deep, the send timing optimizer is making systematically wrong decisions, CRM webhook failures are invisible to operators, and the highest-impact features remain unimplemented. The fixes are known, scoped, and in several cases already partially written (as `webhookDispatch.ts` demonstrates). The gap is execution, not design.

---

*Report generated automatically by scheduled AI audit task on April 6, 2026.*
