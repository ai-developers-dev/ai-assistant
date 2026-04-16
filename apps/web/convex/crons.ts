import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Hourly promo trial expiry check
crons.hourly(
  "expire-promo-trials",
  { minuteUTC: 30 },
  internal.promoCodes.expireTrials
);

// Every 5 minutes: check for due scheduled tasks and execute them
crons.interval(
  "process-scheduled-tasks",
  { minutes: 5 },
  internal.scheduledTaskRunner.processDueTasks
);

// Every 30 minutes: run heartbeat checks for projects with heartbeat enabled
crons.interval(
  "heartbeat-check",
  { minutes: 30 },
  internal.scheduledTaskRunner.processHeartbeats
);

// Every 1 hour: advance multi-touch outreach sequences for due businesses
// (Reduced from 4h — cron is now efficient with indexed queries and staggered batches)
crons.interval(
  "outreach-sequences",
  { hours: 1 },
  internal.outreachCron.processOutreachSequences
);

// Daily at 10:00 UTC (4:00am CT / 5:00am ET): Marketing Manager sends daily report
crons.daily(
  "marketing-report-daily",
  { hourUTC: 10, minuteUTC: 0 },
  internal.marketingReport.generateAndSend
);

// Every 30 minutes: advance email warmup stages + reset daily counts
crons.interval(
  "email-warmup",
  { minutes: 30 },
  internal.emailWarmup.advanceStages
);

// Weekly (every Monday at 11:00 UTC): reactivate stale leads that never replied
crons.weekly(
  "reactivate-stale-leads",
  { dayOfWeek: "monday", hourUTC: 11, minuteUTC: 0 },
  internal.outreachCron.reactivateStaleLeads
);

export default crons;
