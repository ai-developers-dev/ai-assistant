/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as agentCommunications from "../agentCommunications.js";
import type * as agentDecisionLog from "../agentDecisionLog.js";
import type * as agentInsights from "../agentInsights.js";
import type * as agentPlans from "../agentPlans.js";
import type * as agentTeams from "../agentTeams.js";
import type * as artifacts from "../artifacts.js";
import type * as billing from "../billing.js";
import type * as businesses from "../businesses.js";
import type * as cityCampaigns from "../cityCampaigns.js";
import type * as credentials from "../credentials.js";
import type * as crons from "../crons.js";
import type * as emailWarmup from "../emailWarmup.js";
import type * as embeddings from "../embeddings.js";
import type * as files from "../files.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as leadGenPipeline from "../leadGenPipeline.js";
import type * as leadGenPosts from "../leadGenPosts.js";
import type * as leads from "../leads.js";
import type * as lib_auth from "../lib/auth.js";
import type * as marketingReport from "../marketingReport.js";
import type * as messages from "../messages.js";
import type * as organizations from "../organizations.js";
import type * as outreachCron from "../outreachCron.js";
import type * as platformConfig from "../platformConfig.js";
import type * as projects from "../projects.js";
import type * as promoCodes from "../promoCodes.js";
import type * as rateLimits from "../rateLimits.js";
import type * as scheduledTaskRunner from "../scheduledTaskRunner.js";
import type * as sendTimingAnalytics from "../sendTimingAnalytics.js";
import type * as sessions from "../sessions.js";
import type * as subagentRuns from "../subagentRuns.js";
import type * as tasks from "../tasks.js";
import type * as teamAgents from "../teamAgents.js";
import type * as usage from "../usage.js";
import type * as users from "../users.js";
import type * as webhookDispatch from "../webhookDispatch.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  agentCommunications: typeof agentCommunications;
  agentDecisionLog: typeof agentDecisionLog;
  agentInsights: typeof agentInsights;
  agentPlans: typeof agentPlans;
  agentTeams: typeof agentTeams;
  artifacts: typeof artifacts;
  billing: typeof billing;
  businesses: typeof businesses;
  cityCampaigns: typeof cityCampaigns;
  credentials: typeof credentials;
  crons: typeof crons;
  emailWarmup: typeof emailWarmup;
  embeddings: typeof embeddings;
  files: typeof files;
  health: typeof health;
  http: typeof http;
  leadGenPipeline: typeof leadGenPipeline;
  leadGenPosts: typeof leadGenPosts;
  leads: typeof leads;
  "lib/auth": typeof lib_auth;
  marketingReport: typeof marketingReport;
  messages: typeof messages;
  organizations: typeof organizations;
  outreachCron: typeof outreachCron;
  platformConfig: typeof platformConfig;
  projects: typeof projects;
  promoCodes: typeof promoCodes;
  rateLimits: typeof rateLimits;
  scheduledTaskRunner: typeof scheduledTaskRunner;
  sendTimingAnalytics: typeof sendTimingAnalytics;
  sessions: typeof sessions;
  subagentRuns: typeof subagentRuns;
  tasks: typeof tasks;
  teamAgents: typeof teamAgents;
  usage: typeof usage;
  users: typeof users;
  webhookDispatch: typeof webhookDispatch;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
