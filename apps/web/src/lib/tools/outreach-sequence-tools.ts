import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const DAY_MS = 24 * 60 * 60 * 1000;
const WARM_LEAD_THRESHOLD_MS = 3 * DAY_MS;
const COLD_THRESHOLD_MS = 14 * DAY_MS;

type QueueStatus = "ready" | "warm_lead" | "linkedin_accepted" | "cold" | "bounced";

/**
 * Determine the smart status for a business in the outreach queue.
 * Priority order: bounced > linkedin_accepted > warm_lead > cold > ready
 */
function computeQueueStatus(b: any): QueueStatus {
  const now = Date.now();
  const os = b.outreachStatus ?? {};

  // Bounced email → skip remaining email steps
  if (b.emailStatus === "bounced") return "bounced";

  // LinkedIn replied → priority human follow-up
  if (os.linkedinRepliedAt) return "linkedin_accepted";

  // Email opened but no reply for 3+ days → warm lead
  if (
    b.emailOpenedAt &&
    !os.emailRepliedAt &&
    now - b.emailOpenedAt >= WARM_LEAD_THRESHOLD_MS
  ) {
    return "warm_lead";
  }

  // All channels sent, none replied after 14 days → cold
  const emailSent = !!os.emailSentAt;
  const metaSent = !!os.metaSentAt;
  const linkedinSent = !!os.linkedinSentAt;
  const anyReplied = !!(os.emailRepliedAt || os.metaRepliedAt || os.linkedinRepliedAt);
  const anySent = emailSent || metaSent || linkedinSent;

  if (anySent && !anyReplied) {
    // Check if all available channels have been contacted
    const emailDone = !b.email || emailSent;
    const metaDone = !b.metaPageUrl || metaSent;
    const linkedinDone = !b.linkedinOwnerUrl || linkedinSent;

    if (emailDone && metaDone && linkedinDone) {
      // Find the most recent send timestamp
      const lastSent = Math.max(os.emailSentAt ?? 0, os.metaSentAt ?? 0, os.linkedinSentAt ?? 0);
      if (lastSent > 0 && now - lastSent >= COLD_THRESHOLD_MS) return "cold";
    }
  }

  return "ready";
}

/**
 * Sequence steps and their scheduled offsets from sequence start:
 *   Step 0 — Email #1 (intro)          Day 0  (immediate)
 *   Step 1 — LinkedIn / FB DM          Day 2
 *   Step 2 — Email #2 (follow-up)      Day 5
 *   Step 3 — LinkedIn follow-up msg    Day 7  (if connection accepted)
 *   Step 4 — Final email (break-up)    Day 14
 */

export function createOutreachSequenceTool(config: {
  organizationId: string;
  convex: ConvexHttpClient;
}) {
  const { organizationId, convex } = config;

  return tool({
    description: "View and manage the multi-touch outreach sequence queue. Shows which businesses are due for their next outreach step and how many are in each step of the funnel. Use this to check sequence status before running outreach.",
    parameters: z.object({
      action: z.enum(["view_queue", "skip_business", "prioritize_business"]).describe(
        "view_queue: see businesses due for next step | skip_business: remove from sequence | prioritize_business: move to front"
      ),
      businessId: z.string().optional().describe("Required for skip_business and prioritize_business"),
      limit: z.number().min(1).max(50).default(20).describe("Max businesses to show in view_queue"),
    }),
    execute: async ({ action, businessId, limit }) => {
      try {
        if (action === "view_queue") {
          const due = await convex.query(api.businesses.getBusinessesDueForOutreach, {
            organizationId: organizationId as Id<"organizations">,
            limit,
          });

          if (!due || due.length === 0) {
            return { count: 0, message: "No businesses are due for outreach right now." };
          }

          // Auto-handle bounced businesses: skip to next non-email step or mark complete
          const bouncedIds: string[] = [];
          for (const b of due) {
            if (b.emailStatus === "bounced") {
              const currentStep = b.outreachSequenceStep ?? 0;
              // Email steps are 0 (Email #1), 2 (Email #2), 4 (Final email)
              const isEmailStep = currentStep === 0 || currentStep === 2 || currentStep === 4;
              if (isEmailStep) {
                // Skip to next non-email step: 0→1 (LinkedIn), 2→3 (LinkedIn follow-up), 4→done
                const nextNonEmail = currentStep === 0 ? 1 : currentStep === 2 ? 3 : -1;
                const nextAt = nextNonEmail >= 0 ? Date.now() : undefined;
                try {
                  await convex.mutation(api.businesses.advanceSequenceStep, {
                    id: b._id as Id<"businesses">,
                    step: nextNonEmail >= 0 ? nextNonEmail : 5, // 5 = complete
                    nextStepAt: nextAt,
                  });
                  bouncedIds.push(b._id);
                } catch { /* best-effort */ }
              }
            }
          }

          const mapped = due.map((b: any) => {
            const status = computeQueueStatus(b);
            return {
              _id: b._id,
              name: b.name,
              city: b.address?.city,
              leadScore: b.leadScore ?? 0,
              currentStep: b.outreachSequenceStep ?? 0,
              nextStepAt: b.outreachNextStepAt ? new Date(b.outreachNextStepAt).toLocaleDateString() : "now",
              status,
              channels: {
                hasEmail: !!b.email,
                hasFacebook: !!b.metaPageUrl,
                hasLinkedIn: !!b.linkedinOwnerUrl,
              },
            };
          });

          // Summary counts by status
          const statusCounts = mapped.reduce(
            (acc: Record<QueueStatus, number>, b: { status: QueueStatus }) => {
              acc[b.status] = (acc[b.status] ?? 0) + 1;
              return acc;
            },
            { ready: 0, warm_lead: 0, linkedin_accepted: 0, cold: 0, bounced: 0 }
          );

          return {
            count: mapped.length,
            businesses: mapped,
            statusCounts,
            bouncedAutoSkipped: bouncedIds.length,
            message: `${mapped.length} businesses in queue. ${statusCounts.warm_lead} warm leads, ${statusCounts.linkedin_accepted} LinkedIn accepted, ${statusCounts.cold} cold, ${statusCounts.bounced} bounced (${bouncedIds.length} auto-skipped).`,
          };
        }

        if ((action === "skip_business" || action === "prioritize_business") && businessId) {
          if (action === "skip_business") {
            // Clear the scheduled next step (remove from queue)
            await convex.mutation(api.businesses.advanceSequenceStep, {
              id: businessId as Id<"businesses">,
              step: -1, // sentinel for skipped
              nextStepAt: undefined,
            });
            return { success: true, message: `Business removed from outreach queue.` };
          } else {
            // Prioritize: set nextStepAt to now
            await convex.mutation(api.businesses.advanceSequenceStep, {
              id: businessId as Id<"businesses">,
              step: 0,
              nextStepAt: Date.now(),
            });
            return { success: true, message: `Business moved to front of outreach queue.` };
          }
        }

        return { error: "Invalid action or missing businessId" };
      } catch (err: any) {
        return { error: err?.message ?? String(err) };
      }
    },
  });
}

/**
 * Calculates when the next sequence step should run after completing a given step.
 * Returns epoch ms for nextStepAt.
 */
export function nextStepTimestamp(currentStep: number, startedAt: number): number | undefined {
  const offsets: Record<number, number> = {
    0: 2 * DAY_MS,   // After step 0 (Email #1), next is step 1 in 2 days
    1: 3 * DAY_MS,   // After step 1 (LinkedIn/FB), next is step 2 in 3 more days (day 5)
    2: 2 * DAY_MS,   // After step 2 (Email #2), next is step 3 in 2 days (day 7)
    3: 7 * DAY_MS,   // After step 3 (LinkedIn follow-up), next is step 4 in 7 days (day 14)
  };
  const delay = offsets[currentStep];
  if (delay === undefined) return undefined; // No more steps
  return Date.now() + delay;
}

/**
 * Marks that a sequence step has been completed and schedules the next one.
 * Call this after successfully sending any outreach message in the sequence.
 */
export async function completeSequenceStep(
  convex: ConvexHttpClient,
  businessId: string,
  completedStep: number
): Promise<void> {
  const nextAt = nextStepTimestamp(completedStep, Date.now());
  await convex.mutation(api.businesses.advanceSequenceStep, {
    id: businessId as Id<"businesses">,
    step: completedStep + 1,
    nextStepAt: nextAt,
  });
}

/**
 * Initializes a business into the outreach sequence (sets step 0 as due immediately).
 * Call this when you want to enroll a business in the sequence.
 */
export async function enrollInSequence(
  convex: ConvexHttpClient,
  businessId: string
): Promise<void> {
  await convex.mutation(api.businesses.advanceSequenceStep, {
    id: businessId as Id<"businesses">,
    step: 0,
    nextStepAt: Date.now(), // Due immediately for step 0
  });
}
