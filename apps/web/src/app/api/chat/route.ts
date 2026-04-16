import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { createMemoryTools } from "@/lib/tools/memory-tools";
import { createDelegationTool } from "@/lib/tools/delegation-tools";
import { createTeamDelegationTool } from "@/lib/tools/team-delegation-tools";
import { createFileTools } from "@/lib/tools/file-tools";
import { resolveTools } from "@/lib/tools/catalog";
import {
  getArtifactContent,
  clearArtifactContent,
} from "@/lib/tools/save-artifact";
import {
  getPlanState,
  clearPlanState,
} from "@/lib/tools/agent-tools";
import { getAgentConfig } from "@/lib/agents/registry";
import { getModelConfig, DEFAULT_MODEL } from "@/lib/agents/models";
import { buildAgenticSystemPrompt } from "@/lib/agents/system-prompts";
import { executeWithResilience } from "@/lib/agents/execution";
import { compactIfNeeded } from "@/lib/agents/context-manager";
import { classifyProviderError } from "@/lib/errors/provider-errors";
import { generateEmbedding } from "@/lib/memory/embeddings";
import { cleanupStaleSessions } from "@/lib/browser/session-manager";
import { decryptProviderKeys, isTokenExpired } from "@/lib/credentials/provider-keys";
import type { DecryptedProviderKeys } from "@/lib/credentials/provider-keys";
import type { AgentType } from "@/lib/agents/registry";
import { createGoogleProspectTool } from "@/lib/tools/google-prospect-tools";
import { createMetaProspectTool } from "@/lib/tools/meta-prospect-tools";
import { createLinkedInProspectTool } from "@/lib/tools/linkedin-prospect-tools";
import { createGetEmailReadyBusinessesTool, createDirectEmailTool } from "@/lib/tools/direct-email-tools";
import { createGmailEmailTool } from "@/lib/tools/gmail-email-tools";
import { createSaveInsightTool } from "@/lib/tools/insights-tools";
import { createGooglePlacesTool, createScrapeAllVerticalsTool, resetScrapeCounter } from "@/lib/tools/google-places-tools";
import { createBusinessEnrichmentTool, createScoreBusinessLeadsTool } from "@/lib/tools/business-enrichment-tools";
import { createOutreachSequenceTool } from "@/lib/tools/outreach-sequence-tools";
import { createMetaFriendRequestTool } from "@/lib/tools/meta-outreach-tools";
import { createLinkedInConnectTool } from "@/lib/tools/linkedin-outreach-tools";
import { createRedditPostTool, createFindSocialGroupsTool } from "@/lib/tools/reddit-tools";
import { createMetaGroupPostTool } from "@/lib/tools/meta-group-tools";
import { createFindYoutubeVideosTool, createPostYoutubeCommentTool } from "@/lib/tools/youtube-tools";
import { createFindTwitterThreadsTool, createPostTweetTool } from "@/lib/tools/twitter-tools";
import { createDiscordPostTool } from "@/lib/tools/discord-tools";
import { createFindQuoraQuestionsTool } from "@/lib/tools/quora-tools";
import { createFindNextdoorCommunitiesTool } from "@/lib/tools/nextdoor-tools";
import { createCityCampaignTools } from "@/lib/tools/city-campaign-tools";
import { createLogDecisionTool } from "@/lib/tools/decision-log-tools";
import { createGetBusinessesByStatusTool } from "@/lib/tools/business-query-tools";
import { createGetCampaignSummaryTool } from "@/lib/tools/campaign-summary-tools";

// Allow long-running streaming responses (10 min).
// Claude Opus can think 2+ min then generate 3+ min for website HTML.
// Vercel caps this at the plan's limit (Pro = 300s, Enterprise = 900s).
export const maxDuration = 600;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const {
      messages,
      modelId = DEFAULT_MODEL,
      agentType = "general" as AgentType,
      enabledTools,
      proMode = false,
      projectId,
      sessionId,
      organizationId,
      taskId,
      _delegationDepth = 0,
    } = body;

    // Detect internal scheduler calls (skip usage metering for automated tasks)
    const isSchedulerCall =
      req.headers.get("x-scheduler-secret") === process.env.SCHEDULER_INTERNAL_SECRET;
    const isInternalCron =
      req.headers.get("x-convex-internal") === "true";
    const isTestMode = req.headers.get("x-test-mode") === "true";

    // Verify the caller is a member of the claimed organization.
    // Internal cron/scheduler callers authenticate via shared secret instead.
    let authedUserId: string | null = null;
    if (organizationId && !isSchedulerCall && !isInternalCron && !isTestMode) {
      const { userId } = await auth();
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      authedUserId = userId;
      // Verify the authenticated user is actually a member of the org they're
      // asking the chat API to act on. Without this, any signed-in user could
      // pass another org's id in the request body and burn that org's quota.
      const isMember = await convex.query(api.organizations.isUserMember, {
        userId,
        organizationId,
      });
      if (!isMember) {
        return new Response(
          JSON.stringify({ error: "Forbidden: not a member of this organization" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      // Rate limit: 60 chat requests/minute per user, 500/minute per org.
      // Protects against compromised accounts, buggy clients in infinite loops,
      // and brute-force quota exhaustion attempts.
      const userLimit = await convex.mutation(api.rateLimits.checkAndIncrement, {
        scope: "chat:user",
        key: userId,
        limit: 60,
      });
      if (!userLimit.ok) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded",
            message: `Too many requests. Try again in ${userLimit.resetInSeconds}s.`,
            category: "rate_limit",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(userLimit.resetInSeconds ?? 60),
            },
          }
        );
      }
      const orgLimit = await convex.mutation(api.rateLimits.checkAndIncrement, {
        scope: "chat:org",
        key: organizationId,
        limit: 500,
      });
      if (!orgLimit.ok) {
        return new Response(
          JSON.stringify({
            error: "Organization rate limit exceeded",
            message: `Your organization has made too many requests. Try again in ${orgLimit.resetInSeconds}s.`,
            category: "rate_limit",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(orgLimit.resetInSeconds ?? 60),
            },
          }
        );
      }
    }

    // Check request quota before calling the AI
    if (organizationId && !isSchedulerCall && !isInternalCron && !isTestMode) {
      try {
        await convex.mutation(api.organizations.checkAndIncrementUsage, {
          organizationId,
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            error: err.message || "Request limit reached",
            category: "insufficient_credits",
            suggestion:
              "You've used all your requests this month. Upgrade your plan for more.",
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const agent = getAgentConfig(agentType);
    const modelConfig = getModelConfig(modelId);

    // Accumulates the model's text output during streaming so save_artifact
    // can extract HTML from code blocks when content is too large for tool args.
    const textAccumulator = { current: "" };

    // ── Build dynamic tools (memory + delegation) ──────────────────────
    const dynamicTools: Record<string, any> = {};

    // Memory tools — always available when org + project IDs are present
    if (organizationId && projectId) {
      const memoryTools = createMemoryTools(convex, {
        organizationId,
        projectId,
        sessionId,
      });
      dynamicTools.memory_save = memoryTools.memory_save;
      dynamicTools.memory_search = memoryTools.memory_search;

      // File reading tool — lets agents access uploaded files
      const fileTools = createFileTools({
        organizationId,
        projectId,
        convex,
      });
      dynamicTools.read_file = fileTools.read_file;
    }

    // ── Fetch team config (if configured) ──────────────────────────────
    let teamConfig: any = null;
    let teamSubAgents: any[] = [];
    if (organizationId && _delegationDepth === 0) {
      try {
        teamConfig = await convex.query(api.agentTeams.getByOrganization, {
          organizationId,
        });
        if (teamConfig) {
          teamSubAgents = await convex.query(api.teamAgents.listByTeam, {
            agentTeamId: teamConfig._id,
          });
        }
      } catch (err) {
        console.error("[chat] Failed to fetch team config:", err);
      }
    }

    // Team delegation tool is created AFTER all dynamic tools are populated (see below ~line 510)
    // so sub-agents inherit credential-based tools like google_places_search, enrich_business, etc.
    if (teamConfig && teamSubAgents.length > 0 && _delegationDepth === 0) {
      // Update main agent status to "working"
      try {
        await convex.mutation(api.agentTeams.updateStatus, {
          teamId: teamConfig._id,
          status: "working",
          currentTask: messages?.findLast?.((m: any) => m.role === "user")?.content?.slice?.(0, 200),
        });
      } catch (err) {
        console.error("[chat] Failed to update team status:", err);
      }
    }

    // Fallback: basic delegation tool when no team is configured
    const maxDelegationDepth = proMode ? 3 : 1;
    if (!teamConfig && organizationId && projectId && _delegationDepth < maxDelegationDepth) {
      dynamicTools.delegate_to_agent = createDelegationTool(convex, {
        organizationId,
        projectId,
        sessionId,
        currentAgentType: agentType,
        delegationDepth: _delegationDepth,
        maxDepth: maxDelegationDepth,
      });
    }

    // NOTE: resolveTools is called after credential decryption below,
    // so prospecting/email tools can be injected into dynamicTools first.

    // Pure orchestrator mode config (applied after resolveTools below)
    const isOrchestrator = !!(teamConfig && teamSubAgents.length > 0 && _delegationDepth === 0);

    // Merge platform config into system prompt (if configured by admin)
    let systemPrompt = agent.systemPrompt;
    try {
      const platformConfig = await convex.query(
        api.platformConfig.getByAgentType,
        { agentType }
      );
      if (platformConfig) {
        if (platformConfig.isOverride) {
          systemPrompt = platformConfig.buildCriteria;
        } else {
          systemPrompt = `${agent.systemPrompt}\n\n## ADDITIONAL PLATFORM REQUIREMENTS\n${platformConfig.buildCriteria}`;
        }
      }
    } catch (err) {
      console.error("Failed to fetch platform config:", err);
    }

    // Wrap system prompt with agentic Plan-Execute-Reflect protocol
    // Inject team roster if team is configured
    const teamRosterConfig = teamConfig && teamSubAgents.length > 0
      ? {
          teamName: teamConfig.name,
          teamDescription: teamConfig.description,
          personality: teamConfig.personality,
          subAgents: teamSubAgents.map((a: any) => ({
            _id: a._id,
            name: a.name,
            specialty: a.specialty,
            modelId: a.modelId,
            isEnabled: a.isEnabled,
            status: a.status,
          })),
        }
      : undefined;
    systemPrompt = buildAgenticSystemPrompt(systemPrompt, agentType, proMode, teamRosterConfig);

    // ── Auto-inject recalled memories (hybrid search) ────────────────
    if (organizationId && projectId && process.env.OPENAI_API_KEY) {
      try {
        const lastUserMessage = messages?.findLast?.(
          (m: any) => m.role === "user"
        );
        const userText =
          typeof lastUserMessage?.content === "string"
            ? lastUserMessage.content
            : "";

        if (userText && userText.length > 10) {
          const embedding = await generateEmbedding(userText);
          if (embedding) {
            const memories = await convex.action(
              api.embeddings.hybridSearchMemories,
              {
                organizationId,
                projectId,
                embedding,
                query: userText,
                limit: 3,
              }
            );

            if (memories && memories.length > 0) {
              const memoryBlock = memories
                .map((m: any) => `- ${m.content}`)
                .join("\n");
              systemPrompt += `\n\n## RECALLED MEMORIES (from previous sessions)\n${memoryBlock}`;
            }
          }
        }
      } catch (err) {
        console.error("[chat] Failed to recall memories:", err);
      }
    }

    // ── Context window management ────────────────────────────────────
    let chatMessages = messages;
    if (modelConfig) {
      const { messages: compacted, wasCompacted } = compactIfNeeded(
        messages,
        systemPrompt,
        {
          contextWindow: modelConfig.contextWindow,
          maxOutputTokens: modelConfig.maxOutputTokens,
        }
      );
      chatMessages = compacted;
      if (wasCompacted) {
        systemPrompt += "\n\n[Note: Earlier messages were compacted to fit the context window. Recent messages are preserved in full.]";
      }
    }

    // Increase maxSteps to account for plan/update/reflect tool calls overhead
    const baseSteps = proMode
      ? Math.min(agent.maxSteps * 2, 50)
      : agent.maxSteps;
    let maxSteps = Math.min(baseSteps * 2, 80);

    // Lead gen agent needs enough steps for 7 pipeline stages but NOT so many
    // that the AI can run away with excessive scraping
    if (agentType === "lead_gen_agent") {
      maxSteps = 20; // 7 pipeline steps + overhead, prevents runaway scraping
    }

    // ── Fetch and decrypt provider credentials ─────────────────────────
    let credentials: DecryptedProviderKeys = {};
    let orgData: any = null;
    if (organizationId) {
      try {
        orgData = await convex.query(api.organizations.getById, {
          id: organizationId,
        });
        if (orgData?.providerKeys) {
          credentials = decryptProviderKeys(
            orgData.providerKeys as Record<string, any>,
            organizationId
          );

          // Auto-refresh expired OAuth tokens before use
          const modelProvider = modelConfig?.provider;
          if (modelProvider) {
            const cred = credentials[modelProvider as keyof DecryptedProviderKeys];
            if (cred && typeof cred === "object" && "type" in cred && isTokenExpired(cred)) {
              try {
                console.log(`[chat] Auto-refreshing expired ${modelProvider} OAuth token`);
                const refreshRes = await fetch(
                  `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/oauth/refresh`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ provider: modelProvider, organizationId }),
                  }
                );
                if (refreshRes.ok) {
                  // Re-fetch the updated credentials
                  const refreshedOrg = await convex.query(api.organizations.getById, {
                    id: organizationId,
                  });
                  if (refreshedOrg?.providerKeys) {
                    credentials = decryptProviderKeys(
                      refreshedOrg.providerKeys as Record<string, any>,
                      organizationId
                    );
                  }
                } else {
                  console.warn(`[chat] Failed to refresh ${modelProvider} token, falling back to OpenRouter`);
                }
              } catch (refreshErr) {
                console.error(`[chat] OAuth refresh error for ${modelProvider}:`, refreshErr);
              }
            }
          }
        }
      } catch (err) {
        console.error("[chat] Failed to fetch/decrypt provider keys:", err);
      }
    }

    // ── Prospecting & outreach tools (need org API keys) ──────────────
    if (credentials.google_custom_search && credentials.google_search_engine_id) {
      dynamicTools.google_prospect_search = createGoogleProspectTool({
        apiKey: credentials.google_custom_search.token,
        searchEngineId: credentials.google_search_engine_id.token,
        organizationId,
        convex,
      });
    }
    if (credentials.meta) {
      dynamicTools.meta_prospect_search = createMetaProspectTool({
        accessToken: credentials.meta.token,
        organizationId,
        convex,
      });
    }
    if (credentials.linkedin) {
      dynamicTools.linkedin_prospect_search = createLinkedInProspectTool({
        accessToken: credentials.linkedin.token,
        organizationId,
        convex,
      });
    }
    // ── Email outreach tools (Resend or Gmail SMTP — multi-account) ─────
    // Collect all Gmail accounts (multi-account array + legacy single credential)
    const gmailAccountsArr = (credentials.gmail_smtp_accounts ?? []).map(a => ({ email: a.email, password: a.password }));
    const gmailLegacy = (() => {
      if (!credentials.gmail_smtp) return [];
      const [e, p] = (credentials.gmail_smtp.token || "").split("|");
      return e && p ? [{ email: e, password: p }] : [];
    })();
    const allGmailAccounts = gmailAccountsArr.length > 0 ? gmailAccountsArr : gmailLegacy;

    // Collect all Resend accounts (multi-account array + legacy single credential)
    const resendAccountsArr = (credentials.warmed_email_accounts ?? []).map(a => {
      const [e, k] = (a.email + "|" + a.password).split("|"); // already split as email|apiKey
      return { email: a.email, apiKey: a.password };
    });
    const resendLegacy = (() => {
      if (!credentials.warmed_email) return [];
      const [e, k] = (credentials.warmed_email.token || "").split("|");
      const apiKey = process.env.RESEND_API_KEY || (k?.startsWith("re_") ? k : null);
      return e && apiKey ? [{ email: e, apiKey }] : [];
    })();
    const allResendAccounts = resendAccountsArr.length > 0 ? resendAccountsArr : resendLegacy;

    if (allGmailAccounts.length > 0 || allResendAccounts.length > 0) {
      dynamicTools.get_email_ready_businesses = createGetEmailReadyBusinessesTool({
        organizationId,
        convex,
      });
    }
    // Prefer Resend if available, otherwise Gmail
    if (allResendAccounts.length > 0) {
      dynamicTools.send_direct_email = createDirectEmailTool({
        resendApiKey: allResendAccounts[0].apiKey,
        fromEmail: allResendAccounts[0].email,
        organizationId,
        convex,
      });
    } else if (allGmailAccounts.length > 0) {
      const gmailTool = createGmailEmailTool({
        gmailAddress: allGmailAccounts[0].email,
        gmailAppPassword: allGmailAccounts[0].password,
        fromName: orgData?.name || undefined,
        organizationId,
        convex,
      });
      // Register under both names so agents using either name can find it
      dynamicTools.send_direct_email = gmailTool;
      dynamicTools.send_gmail_email = gmailTool;
    }

    // ── Home Services Campaign tools ─────────────────────────────────────
    // Extract dailyLimit from campaign config (passed via request body)
    const campaignDailyLimit = body.campaignConfig?.dailyResults;
    const campaignVerticals = body.campaignConfig?.verticals;
    console.log(`[chat] Campaign config: dailyLimit=${campaignDailyLimit}, verticals=${campaignVerticals?.length}, hasCampaignConfig=${!!body.campaignConfig}`);
    resetScrapeCounter(); // Reset per-execution counter
    if (credentials.outscraper && organizationId) {
      dynamicTools.google_places_search = createGooglePlacesTool({
        apiKey: credentials.outscraper.token,
        organizationId,
        convex,
        dailyLimit: campaignDailyLimit,
        totalVerticals: Array.isArray(campaignVerticals) ? campaignVerticals.length : undefined,
      });
      dynamicTools.scrape_all_verticals = createScrapeAllVerticalsTool({
        apiKey: credentials.outscraper.token,
        organizationId,
        convex,
        dailyLimit: campaignDailyLimit,
      });
      // Enrichment uses Firecrawl (org override key or env key)
      const firecrawlKey = credentials.firecrawl?.token || process.env.FIRECRAWL_API_KEY || "";
      if (firecrawlKey) {
        dynamicTools.enrich_business = createBusinessEnrichmentTool({
          firecrawlApiKey: firecrawlKey,
          outscraperApiKey: credentials.outscraper?.token,
          hunterApiKey: credentials.hunter?.token,
          apolloApiKey: credentials.apollo?.token,
          organizationId,
          convex,
        });
      }
      // Lead scoring — always available when outscraper is configured
      dynamicTools.score_business_leads = createScoreBusinessLeadsTool({
        organizationId: organizationId as any,
        convex,
      });
      // Outreach sequence queue viewer/manager
      dynamicTools.outreach_sequence = createOutreachSequenceTool({
        organizationId,
        convex,
      });
    }
    // Meta browser outreach — prefer multi-account array, fall back to legacy single credential
    const metaAccountsArr = credentials.meta_accounts ?? [];
    const metaLegacyAccounts = (() => {
      if (!credentials.meta) return [];
      const [e, p] = (credentials.meta.token || "").split("|");
      return e && p ? [{ email: e, password: p }] : [];
    })();
    const allMetaAccounts = metaAccountsArr.length > 0 ? metaAccountsArr.map(a => ({ email: a.email, password: a.password })) : metaLegacyAccounts;
    if (allMetaAccounts.length > 0 && organizationId) {
      dynamicTools.meta_friend_request = createMetaFriendRequestTool({
        accounts: allMetaAccounts,
        organizationId,
        convex,
      });
    }

    // LinkedIn browser outreach — prefer multi-account array, fall back to legacy single credential
    const linkedinAccountsArr = credentials.linkedin_accounts ?? [];
    const linkedinLegacyAccounts = (() => {
      if (!credentials.linkedin) return [];
      const [e, p] = (credentials.linkedin.token || "").split("|");
      return e && p ? [{ email: e, password: p }] : [];
    })();
    const allLinkedInAccounts = linkedinAccountsArr.length > 0 ? linkedinAccountsArr.map(a => ({ email: a.email, password: a.password })) : linkedinLegacyAccounts;
    if (allLinkedInAccounts.length > 0 && organizationId) {
      dynamicTools.linkedin_connect = createLinkedInConnectTool({
        accounts: allLinkedInAccounts,
        organizationId,
        convex,
      });
    }

    // ── Reddit posting (official API — needs clientId|clientSecret|username|password) ───
    const redditToken = credentials.reddit?.token;
    if (redditToken && organizationId) {
      const parts = redditToken.split("|");
      // Format: clientId|clientSecret|username|password
      if (parts.length >= 4) {
        dynamicTools.post_to_reddit = createRedditPostTool({
          redditClientId: parts[0],
          redditClientSecret: parts[1],
          redditUsername: parts[2],
          redditPassword: parts[3],
          organizationId,
          convex,
        });
      } else if (parts.length >= 2) {
        // Legacy format: email|password — still try with empty client ID/secret
        // Won't work with official API but won't crash
        console.warn("[chat] Reddit credentials in legacy email|password format. Need clientId|clientSecret|username|password for official API.");
      }
    }

    // ── Meta group posting (uses first Meta account) ─────────────────
    const firstMetaAccount = allMetaAccounts[0];
    if (firstMetaAccount && organizationId) {
      dynamicTools.post_to_meta_group = createMetaGroupPostTool({
        metaEmail: firstMetaAccount.email,
        metaPassword: firstMetaAccount.password,
        organizationId,
        convex,
      });
    }

    // ── Find social groups (uses Firecrawl) ──────────────────────────────
    const firecrawlKey =
      credentials.firecrawl?.token || process.env.FIRECRAWL_API_KEY || "";
    if (firecrawlKey) {
      dynamicTools.find_social_groups = createFindSocialGroupsTool(firecrawlKey);
    }

    // ── YouTube tools ─────────────────────────────────────────────────────
    if (credentials.youtube_oauth && organizationId) {
      dynamicTools.find_youtube_videos = createFindYoutubeVideosTool(credentials.youtube_oauth.token);
      dynamicTools.post_youtube_comment = createPostYoutubeCommentTool(credentials.youtube_oauth.token, {
        organizationId: organizationId as string, convex
      });
    }

    // ── Twitter/X tools ───────────────────────────────────────────────────
    if (credentials.twitter && organizationId) {
      dynamicTools.find_twitter_threads = createFindTwitterThreadsTool(credentials.twitter.token);
      dynamicTools.post_tweet = createPostTweetTool(credentials.twitter.token, {
        organizationId: organizationId as string, convex
      });
    }

    // ── Discord tools (webhook-based) ─────────────────────────────────────
    if (credentials.discord_webhooks && organizationId) {
      try {
        const webhooks = JSON.parse(credentials.discord_webhooks.token);
        if (Array.isArray(webhooks) && webhooks.length > 0) {
          dynamicTools.post_to_discord = createDiscordPostTool(webhooks, {
            organizationId: organizationId as string, convex
          });
        }
      } catch (err) {
        console.error("[chat/route] failed to parse Discord webhooks credential:", err);
      }
    }

    // ── Quora (find-only, uses Firecrawl) ─────────────────────────────────
    if (firecrawlKey && organizationId) {
      dynamicTools.find_quora_questions = createFindQuoraQuestionsTool(firecrawlKey, {
        organizationId: organizationId as string, convex
      });
    }

    // ── Nextdoor (find-only, uses Firecrawl) ──────────────────────────────
    if (firecrawlKey && organizationId) {
      dynamicTools.find_nextdoor_communities = createFindNextdoorCommunitiesTool(firecrawlKey, {
        organizationId: organizationId as string, convex
      });
    }

    // ── City campaign progress tools (lead gen agent city tracking) ─────
    if (organizationId) {
      const { get_city_campaign_progress, mark_city_status } = createCityCampaignTools({
        organizationId: organizationId as any,
        convex,
      });
      dynamicTools.get_city_campaign_progress = get_city_campaign_progress;
      dynamicTools.mark_city_status = mark_city_status;
    }

    // ── Insights tool (insights agent writes recommendations to DB) ─────
    if (organizationId) {
      dynamicTools.save_insight = createSaveInsightTool(organizationId);
    }

    // ── Decision logging tool (tracks sent/skipped/deferred per business) ─────
    if (organizationId) {
      dynamicTools.log_decision = createLogDecisionTool({
        organizationId: organizationId as string,
        convex,
      });
    }

    // ── Business query & campaign summary tools ─────────────────────────────
    if (organizationId) {
      dynamicTools.get_businesses_by_status = createGetBusinessesByStatusTool({
        organizationId: organizationId as string, convex
      });
      dynamicTools.get_campaign_summary = createGetCampaignSummaryTool({
        organizationId: organizationId as string, convex
      });
    }

    // ── Firecrawl org-level override ────────────────────────────────────
    if (credentials.firecrawl) {
      (process.env as any).__FIRECRAWL_ORG_OVERRIDE = credentials.firecrawl.token;
    }

    // ── Team delegation tool (MUST be after all dynamic tools are populated) ──
    // This ensures sub-agents inherit credential-based tools (google_places_search, etc.)
    if (teamConfig && teamSubAgents.length > 0 && _delegationDepth === 0) {
      dynamicTools.delegate_to_team_agent = createTeamDelegationTool(convex, {
        organizationId,
        projectId,
        sessionId,
        taskId,
        agentTeamId: teamConfig._id,
        mainAgentName: teamConfig.name,
        parentDynamicTools: dynamicTools,
        subAgents: teamSubAgents,
      });
    }

    // ── Resolve tools (after all dynamic tools are built) ─────────────
    const tools = resolveTools(
      agent.defaultProfile,
      enabledTools,
      { textAccumulator, dynamicTools }
    );

    // Pure orchestrator mode: strip direct-execution tools when team is configured
    if (isOrchestrator) {
      const ORCHESTRATOR_ALLOWED = new Set([
        'delegate_to_team_agent', 'agent_plan', 'update_plan', 'agent_reflect',
        'save_artifact', 'memory_save', 'memory_search', 'calculator'
      ]);
      for (const toolId of Object.keys(tools)) {
        if (!ORCHESTRATOR_ALLOWED.has(toolId)) {
          delete tools[toolId];
        }
      }
    }

    // ── Execute with resilience (retry + model failover) ─────────────
    console.log(`[chat] Credentials available: ${Object.keys(credentials).join(", ") || "NONE"}`, `openai type: ${credentials.openai ? (typeof credentials.openai === "string" ? "string" : JSON.stringify({type: (credentials.openai as any).type, hasToken: !!(credentials.openai as any).token, tokenPrefix: (credentials.openai as any).token?.substring(0,8)})) : "MISSING"}`);
    const result = await executeWithResilience(
      {
        model: modelId,
        fallbackModels: modelConfig?.fallbackChain ?? [],
        maxRetries: 1,
        credentials,
      },
      {
        system: systemPrompt,
        messages: chatMessages,
        tools,
        maxSteps,
        maxTokens: isTestMode ? 800 : (modelConfig?.maxOutputTokens ?? 8192),
        temperature: 0.7,
        toolCallStreaming: true,
        abortSignal: req.signal,
      onChunk: ({ chunk }) => {
        // Feed the text accumulator so save_artifact can extract HTML
        // from code blocks when the model omits inline content.
        if (chunk.type === "text-delta") {
          textAccumulator.current += chunk.textDelta;
        }
      },
      onStepFinish: ({ stepType, toolCalls, toolResults, usage }) => {
        console.log(`[chat] Step finished: type=${stepType}, toolCalls=${toolCalls?.length ?? 0}, toolResults=${toolResults?.length ?? 0}, tokens=${JSON.stringify(usage)}`);
      },
      onError: ({ error }) => {
        console.error("[chat] Mid-stream error:", error);
      },
      onFinish: async ({ text, usage, steps }) => {
        console.log("Token usage:", usage);

        // Clean up any stale browser sessions from this invocation
        await cleanupStaleSessions().catch((err) =>
          console.error("[chat] Failed to cleanup browser sessions:", err)
        );

        if (!projectId || !sessionId || !organizationId) return;

        // 1. Save the user message (last user message from the request)
        const lastUserMessage = messages?.findLast?.(
          (m: any) => m.role === "user"
        );
        if (lastUserMessage?.content) {
          const userContent =
            typeof lastUserMessage.content === "string"
              ? lastUserMessage.content
              : JSON.stringify(lastUserMessage.content);
          try {
            await convex.mutation(api.messages.saveFromServer, {
              sessionId,
              projectId,
              organizationId,
              role: "user",
              content: userContent,
              model: modelId,
            });
          } catch (err) {
            console.error("Failed to save user message:", err);
          }

          // Auto-rename project on the first message
          const userMessages = messages?.filter?.(
            (m: any) => m.role === "user"
          );
          if (userMessages?.length === 1) {
            try {
              await convex.mutation(api.projects.autoRename, {
                projectId,
                firstMessage: userContent,
              });
            } catch (err) {
              console.error("Failed to auto-rename project:", err);
            }
          }
        }

        // 2. Save the assistant response
        if (text) {
          try {
            await convex.mutation(api.messages.saveFromServer, {
              sessionId,
              projectId,
              organizationId,
              role: "assistant",
              content: text,
              model: modelId,
            });
          } catch (err) {
            console.error("Failed to save assistant message:", err);
          }
        }

        // 3. Persist artifacts from save_artifact tool calls across all steps.
        if (steps) {
          for (const step of steps) {
            if (!step.toolResults) continue;
            for (const toolResult of step.toolResults) {
              if (
                toolResult.toolName === "save_artifact" &&
                toolResult.result &&
                typeof toolResult.result === "object" &&
                (toolResult.result as any).__artifact
              ) {
                const artifact = toolResult.result as any;
                const cacheId = artifact._cacheId as string | undefined;

                // Retrieve the FULL content from the server-side cache
                const fullContent = cacheId
                  ? getArtifactContent(cacheId)
                  : artifact.content;

                try {
                  await convex.mutation(api.artifacts.createFromServer, {
                    organizationId,
                    projectId,
                    sessionId,
                    title: artifact.title,
                    type: artifact.type,
                    language: artifact.language,
                    mimeType: artifact.mimeType,
                    content: fullContent || artifact.content,
                    sizeBytes: artifact.sizeBytes,
                  });
                } catch (err) {
                  console.error("Failed to persist artifact:", err);
                }

                // Clean up cache
                if (cacheId) clearArtifactContent(cacheId);
              }
            }
          }

          // 4. Persist agent plans from agent_plan tool calls
          for (const step of steps) {
            if (!step.toolResults) continue;
            for (const toolResult of step.toolResults) {
              if (
                toolResult.toolName === "agent_plan" &&
                toolResult.result &&
                typeof toolResult.result === "object" &&
                (toolResult.result as any).__agentPlan
              ) {
                const planResult = toolResult.result as any;
                const finalState = getPlanState(planResult.planId);
                if (finalState) {
                  try {
                    await convex.mutation(api.agentPlans.saveFromServer, {
                      sessionId,
                      projectId,
                      organizationId,
                      planId: finalState.planId,
                      goal: finalState.goal,
                      steps: finalState.steps.map((s) => ({
                        id: s.id,
                        description: s.description,
                        status: s.status,
                        result: s.result,
                      })),
                      status: finalState.status,
                      reflections: finalState.reflections,
                    });
                  } catch (err) {
                    console.error("Failed to persist agent plan:", err);
                  }
                  clearPlanState(finalState.planId);
                }
              }
            }
          }
        }

        // 5. Reset team agent status back to idle
        if (teamConfig) {
          try {
            await convex.mutation(api.agentTeams.updateStatus, {
              teamId: teamConfig._id,
              status: "idle",
            });
          } catch (err) {
            console.error("[chat] Failed to reset team status:", err);
          }
        }

        // 6. Auto-save session summary (every 10 messages or at significant milestones)
        try {
          const session = await convex.query(api.sessions.getById, {
            sessionId,
          });
          if (session && session.messageCount > 0 && session.messageCount % 10 === 0) {
            const summaryText = text
              ? `Session with ${session.messageCount} messages. Latest topic: ${text.slice(0, 200)}`
              : undefined;
            if (summaryText) {
              await convex.mutation(api.sessions.saveSummary, {
                sessionId,
                summary: summaryText,
              });
            }
          }
        } catch (err) {
          console.error("[chat] Failed to save session summary:", err);
        }
      },
    });

    // Determine the provider label for error messages
    const providerLabel = modelConfig?.provider
      ? (modelConfig.provider.charAt(0).toUpperCase() + modelConfig.provider.slice(1))
      : "AI Provider";

    return result.toDataStreamResponse({
      getErrorMessage: (error: unknown) => {
        try {
          const classified = classifyProviderError(error, providerLabel);
          return JSON.stringify({
            error: classified.userMessage,
            category: classified.category,
            suggestion: classified.suggestion,
          });
        } catch (e) {
          console.error("[chat] getErrorMessage failed:", e);
          return JSON.stringify({
            error: "An unexpected error occurred during generation.",
            category: "unknown",
            suggestion: "Try again or switch to a different model.",
          });
        }
      },
    });
  } catch (error: any) {
    // Always log the full error for debugging
    console.error("Chat API error:", error?.message || error, error?.status, error?.cause);

    // Handle missing API key explicitly
    if (error.message?.includes("API key") || error.message?.includes("No API key")) {
      return new Response(
        JSON.stringify({
          error: "No API key available for the selected model.",
          category: "invalid_key",
          suggestion:
            "Connect a provider key in Settings, or ensure OPENROUTER_API_KEY is set in .env.local.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Handle timeout / abort errors
    if (error.name === "AbortError" || error.message?.includes("aborted")) {
      return new Response(
        JSON.stringify({
          error: "Request timed out — the AI provider took too long to respond.",
          category: "network_error",
          suggestion:
            "Try again or switch to a different model. Some providers are slower for large outputs like full web pages.",
        }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }

    const classified = classifyProviderError(error, "AI Provider");

    return new Response(
      JSON.stringify({
        error: classified.userMessage,
        category: classified.category,
        suggestion: classified.suggestion,
        technicalDetail: error.message,
      }),
      {
        status: classified.httpStatus,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
