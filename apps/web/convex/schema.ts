import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── Multi-tenant Organizations (synced from Clerk) ──
  organizations: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    plan: v.string(), // "free" | "starter" | "pro" | "enterprise" (relaxed for migration from old "team" values)
    // Monthly request quota (new system)
    monthlyRequestCount: v.optional(v.number()),
    monthlyRequestLimit: v.optional(v.number()),
    currentBillingPeriodStart: v.optional(v.number()), // timestamp
    // Legacy credit fields — DEPRECATED. Not read anywhere in the codebase
    // (replaced by monthlyRequestCount/monthlyRequestLimit). Kept optional
    // so stored rows from before the migration don't fail schema validation.
    //
    // To remove: (1) confirm migrateToRequestQuotas has run on prod,
    // (2) delete these fields + the `undefined` patches in
    // organizations.ts::migrateToRequestQuotas.
    creditBalance: v.optional(v.number()),
    dailyCreditAllowance: v.optional(v.number()),
    lastDailyReset: v.optional(v.number()),
    totalCreditsUsed: v.optional(v.number()),
    // Stripe
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    stripeCurrentPeriodEnd: v.optional(v.number()),
    // Provider keys — accepts both old (anthropic/openai/google/nvidia) and new (openrouter)
    providerKeys: v.optional(v.any()),
    // Settings
    settings: v.optional(
      v.object({
        defaultModel: v.optional(v.string()),
        maxProjectsOverride: v.optional(v.number()),
      })
    ),
    // Webhook URLs for external integrations (Zapier, Make, etc.)
    webhooks: v.optional(v.array(v.object({
      event: v.string(), // "lead.scraped" | "lead.enriched" | "lead.emailed" | "lead.replied"
      url: v.string(),
      enabled: v.boolean(),
    }))),
    // Limits based on plan
    maxProjects: v.number(),
    maxStorageBytes: v.number(),
    maxTeamMembers: v.number(),
    maxScheduledTasks: v.number(),
    // Onboarding
    onboardingCompleted: v.optional(v.boolean()),
    onboardingConfig: v.optional(v.object({
      states: v.array(v.string()),
      verticals: v.array(v.string()),
      dailyLeads: v.number(),
      emailLimit: v.number(),
      metaLimit: v.number(),
      linkedinLimit: v.number(),
      // Calendly/Cal.com link injected into hot-lead follow-up emails
      bookingLink: v.optional(v.string()),
    })),
    // Trial
    trialEndsAt: v.optional(v.number()),
    // Promo code tracking
    promoCodeId: v.optional(v.id("promoCodes")),
    promoExpiresAt: v.optional(v.number()),
    isPromoUpgrade: v.optional(v.boolean()),
    previousPlan: v.optional(v.string()),
  })
    .index("by_clerkOrgId", ["clerkOrgId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_plan", ["plan"]),

  // ── Users (synced from Clerk) ──
  users: defineTable({
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    role: v.union(
      v.literal("admin"),
      v.literal("member"),
      v.literal("viewer")
    ),
    preferences: v.optional(
      v.object({
        defaultModel: v.optional(v.string()),
        theme: v.optional(v.string()),
      })
    ),
    lastActiveAt: v.optional(v.number()),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_clerkUserId_organizationId", ["clerkUserId", "organizationId"]),

  // ── Projects (Agent workspaces) ──
  projects: defineTable({
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    agentType: v.union(
      v.literal("general"),
      v.literal("images"),
      v.literal("documents"),
      v.literal("slides"),
      v.literal("chat"),
      v.literal("sheets"),
      v.literal("websites"),
      v.literal("videos"),
      v.literal("tools"),
      v.literal("lead_gen")
    ),
    agentConfig: v.optional(
      v.object({
        model: v.optional(v.string()),
        systemPrompt: v.optional(v.string()),
        temperature: v.optional(v.number()),
        maxSteps: v.optional(v.number()),
        enabledTools: v.optional(v.array(v.string())),
        proMode: v.optional(v.boolean()),
        // Heartbeat configuration
        heartbeatEnabled: v.optional(v.boolean()),
        heartbeatIntervalMinutes: v.optional(v.number()), // default 60
        heartbeatChecklist: v.optional(v.string()), // user-editable checklist text
        heartbeatActiveHours: v.optional(
          v.object({
            start: v.number(), // hour 0-23
            end: v.number(),
            timezone: v.string(),
          })
        ),
      })
    ),
    status: v.union(
      v.literal("active"),
      v.literal("archived"),
      v.literal("deleted")
    ),
    isPinned: v.optional(v.boolean()),
    lastActivityAt: v.number(),
    messageCount: v.number(),
    // For showcase
    isPublic: v.optional(v.boolean()),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_status", ["organizationId", "status"])
    .index("by_createdBy", ["createdBy"])
    .index("by_lastActivityAt", ["lastActivityAt"]),

  // ── Sessions (conversation threads within projects) ──
  sessions: defineTable({
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    title: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("archived")
    ),
    messageCount: v.number(),
    lastMessageAt: v.optional(v.number()),
    model: v.optional(v.string()),
    summary: v.optional(v.string()), // Auto-generated session summary for cross-session recall
  })
    .index("by_projectId", ["projectId"])
    .index("by_organizationId", ["organizationId"]),

  // ── Messages ──
  messages: defineTable({
    sessionId: v.id("sessions"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("tool")
    ),
    content: v.string(),
    // Tool call info
    toolCalls: v.optional(
      v.array(
        v.object({
          id: v.string(),
          toolName: v.string(),
          args: v.string(), // JSON string
          result: v.optional(v.string()), // JSON string
          status: v.optional(
            v.union(
              v.literal("pending"),
              v.literal("success"),
              v.literal("error")
            )
          ),
        })
      )
    ),
    // Attachments (file references)
    attachments: v.optional(
      v.array(
        v.object({
          fileId: v.id("files"),
          name: v.string(),
          mimeType: v.string(),
        })
      )
    ),
    // Linked artifacts
    artifactIds: v.optional(v.array(v.id("artifacts"))),
    // Token usage
    tokenUsage: v.optional(
      v.object({
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
    model: v.optional(v.string()),
    creditCost: v.optional(v.number()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_projectId", ["projectId"])
    .index("by_organizationId", ["organizationId"]),

  // ── Artifacts (generated content: code, docs, spreadsheets, HTML) ──
  artifacts: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    sessionId: v.id("sessions"),
    messageId: v.optional(v.id("messages")),
    createdBy: v.optional(v.id("users")),
    title: v.string(),
    type: v.union(
      v.literal("code"),
      v.literal("document"),
      v.literal("spreadsheet"),
      v.literal("html"),
      v.literal("slides"),
      v.literal("diagram"),
      v.literal("other")
    ),
    language: v.optional(v.string()),
    mimeType: v.string(),
    content: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fileId: v.optional(v.id("files")),
    sizeBytes: v.number(),
    version: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_sessionId", ["sessionId"])
    .index("by_messageId", ["messageId"])
    .index("by_organizationId", ["organizationId"]),

  // ── Files ──
  files: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    uploadedBy: v.id("users"),
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    source: v.union(
      v.literal("upload"),
      v.literal("generated")
    ),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_projectId", ["projectId"]),

  // ── Embeddings (vector memory for RAG) ──
  embeddings: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    sessionId: v.optional(v.id("sessions")),
    content: v.string(),
    embedding: v.array(v.float64()),
    metadata: v.optional(
      v.object({
        source: v.optional(v.string()),
        type: v.optional(v.string()),
      })
    ),
    createdAt: v.optional(v.number()), // for temporal decay in hybrid search
    importance: v.optional(v.string()), // "high" | "medium" | "low"
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_projectId", ["projectId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["organizationId", "projectId"],
    })
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["organizationId", "projectId"],
    }),

  // ── Scheduled Tasks ──
  scheduledTasks: defineTable({
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    description: v.optional(v.string()),
    prompt: v.string(),
    agentConfig: v.object({
      agentType: v.string(),
      model: v.optional(v.string()),
      enabledTools: v.optional(v.array(v.string())),
    }),
    teamAgentId: v.optional(v.id("teamAgents")),
    schedule: v.object({
      type: v.union(v.literal("cron"), v.literal("once")),
      cronExpression: v.optional(v.string()),
      runAt: v.optional(v.number()),
    }),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("failed")
    ),
    isRunning: v.optional(v.boolean()),
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    runCount: v.number(),
    campaignConfig: v.optional(v.object({
      vertical: v.optional(v.string()),
      verticals: v.optional(v.array(v.string())),
      serviceOffering: v.optional(v.string()),
      serviceOfferingDetails: v.optional(v.string()),
      states: v.optional(v.array(v.string())),
      cityCount: v.optional(v.number()),
      dailyResults: v.number(),
      dataFields: v.array(v.string()),
      outreachChannels: v.array(v.string()),
      channelConfig: v.optional(v.object({
        email: v.optional(v.object({
          enabled: v.optional(v.boolean()),
          dailyLimit: v.optional(v.number()),
          selectedAccounts: v.optional(v.array(v.string())),
        })),
        meta: v.optional(v.object({
          enabled: v.optional(v.boolean()),
          dailyLimit: v.optional(v.number()),
          selectedAccounts: v.optional(v.array(v.string())),
        })),
        linkedin: v.optional(v.object({
          enabled: v.optional(v.boolean()),
          dailyLimit: v.optional(v.number()),
          selectedAccounts: v.optional(v.array(v.string())),
        })),
      })),
      agentModels: v.optional(v.any()),
      bookingLink: v.optional(v.string()), // Calendly/Cal.com URL for hot-lead follow-ups
      emailTemplate: v.optional(v.string()),
      socialPresence: v.optional(v.object({
        findRedditGroups: v.optional(v.boolean()),
        joinRedditGroups: v.optional(v.boolean()),
        postToReddit: v.optional(v.boolean()),
        redditPostCount: v.optional(v.number()),
        redditPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
        findMetaGroups: v.optional(v.boolean()),
        joinMetaGroups: v.optional(v.boolean()),
        postToMetaGroups: v.optional(v.boolean()),
        metaPostCount: v.optional(v.number()),
        metaPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
        findLinkedinGroups: v.optional(v.boolean()),
        joinLinkedinGroups: v.optional(v.boolean()),
        postToLinkedinGroups: v.optional(v.boolean()),
        linkedinPostCount: v.optional(v.number()),
        linkedinPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
        // Nextdoor
        findNextdoor: v.optional(v.boolean()),
        joinNextdoor: v.optional(v.boolean()),
        postToNextdoor: v.optional(v.boolean()),
        nextdoorPostCount: v.optional(v.number()),
        nextdoorPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
        // Quora
        findQuora: v.optional(v.boolean()),
        followQuora: v.optional(v.boolean()),
        postToQuora: v.optional(v.boolean()),
        quoraPostCount: v.optional(v.number()),
        quoraPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
        // X / Twitter
        findTwitter: v.optional(v.boolean()),
        followTwitter: v.optional(v.boolean()),
        postToTwitter: v.optional(v.boolean()),
        twitterPostCount: v.optional(v.number()),
        twitterPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
        // Discord
        findDiscord: v.optional(v.boolean()),
        joinDiscord: v.optional(v.boolean()),
        postToDiscord: v.optional(v.boolean()),
        discordPostCount: v.optional(v.number()),
        discordPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
        // YouTube
        findYoutube: v.optional(v.boolean()),
        subscribeYoutube: v.optional(v.boolean()),
        postToYoutube: v.optional(v.boolean()),
        youtubePostCount: v.optional(v.number()),
        youtubePostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
      })),
    })),
    currentPipelineStep: v.optional(v.number()),
    pipelineSteps: v.optional(v.array(v.object({
      step: v.number(),
      agentName: v.string(),
      status: v.union(v.literal("pending"), v.literal("running"), v.literal("done"), v.literal("failed"), v.literal("skipped")),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      result: v.optional(v.string()),
    }))),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_status", ["status"])
    .index("by_nextRunAt", ["nextRunAt"]),

  // ── Task Execution Results ──
  taskExecutionResults: defineTable({
    taskId: v.id("scheduledTasks"),
    organizationId: v.id("organizations"),
    status: v.union(v.literal("success"), v.literal("failed")),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    executedAt: v.number(),
    durationMs: v.optional(v.number()),
  })
    .index("by_taskId", ["taskId"])
    .index("by_organizationId", ["organizationId"]),

  // ── Agent Insights / Recommendations ──
  agentInsights: defineTable({
    organizationId: v.id("organizations"),
    generatedBy: v.optional(v.id("teamAgents")),
    category: v.union(
      v.literal("performance"),
      v.literal("optimization"),
      v.literal("failure_analysis"),
      v.literal("new_automation"),
      v.literal("general")
    ),
    title: v.string(),
    summary: v.string(),
    details: v.string(),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
    status: v.union(
      v.literal("new"),
      v.literal("acknowledged"),
      v.literal("applied"),
      v.literal("dismissed")
    ),
    relatedTaskId: v.optional(v.id("scheduledTasks")),
    relatedAgentId: v.optional(v.id("teamAgents")),
    dataSnapshot: v.optional(v.string()),
    generatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_status", ["organizationId", "status"])
    .index("by_organizationId_category", ["organizationId", "category"]),

  // ── Usage Records ──
  usageRecords: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    type: v.union(
      v.literal("chat"),
      v.literal("image_generation"),
      v.literal("embedding"),
      v.literal("tool_execution")
    ),
    model: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    creditCost: v.number(),
    date: v.string(), // YYYY-MM-DD for aggregation
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_date", ["organizationId", "date"])
    .index("by_userId", ["userId"]),

  // ── API Keys ──
  apiKeys: defineTable({
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    name: v.string(),
    keyPrefix: v.string(), // First 8 chars for identification
    keyHash: v.string(), // SHA-256 hash of full key
    scopes: v.array(v.string()),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("revoked")),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_keyHash", ["keyHash"]),

  // ── Showcase Entries ──
  showcaseEntries: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    userId: v.id("users"),
    title: v.string(),
    description: v.string(),
    tags: v.array(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
    likes: v.number(),
    featured: v.boolean(),
    status: v.union(
      v.literal("published"),
      v.literal("pending"),
      v.literal("rejected")
    ),
  })
    .index("by_status", ["status"])
    .index("by_featured", ["featured"])
    .index("by_likes", ["likes"]),

  // ── Templates ──
  templates: defineTable({
    name: v.string(),
    description: v.string(),
    agentType: v.string(),
    category: v.string(),
    agentConfig: v.object({
      model: v.optional(v.string()),
      systemPrompt: v.optional(v.string()),
      enabledTools: v.optional(v.array(v.string())),
    }),
    starterPrompt: v.string(),
    iconName: v.optional(v.string()),
    useCount: v.number(),
    featured: v.boolean(),
  })
    .index("by_agentType", ["agentType"])
    .index("by_category", ["category"])
    .index("by_featured", ["featured"]),

  // ── Audit Log ──
  auditLog: defineTable({
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_action", ["action"]),

  // ── Promo Codes ──
  promoCodes: defineTable({
    code: v.string(),
    type: v.union(v.literal("trial_30d"), v.literal("unlimited")),
    plan: v.union(
      v.literal("starter"),
      v.literal("pro"),
      v.literal("enterprise")
    ),
    maxRedemptions: v.number(),
    currentRedemptions: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("revoked"),
      v.literal("exhausted")
    ),
    createdBy: v.string(),
    note: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  // ── Promo Redemptions ──
  promoRedemptions: defineTable({
    promoCodeId: v.id("promoCodes"),
    organizationId: v.id("organizations"),
    redeemedBy: v.string(),
    redeemedAt: v.number(),
    planGranted: v.string(),
    expiresAt: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("superseded")
    ),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_promoCodeId", ["promoCodeId"])
    .index("by_status", ["status"]),

  // ── Platform Users (super admins) ──
  platformUsers: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("super_admin"),
      v.literal("platform_staff")
    ),
  })
    .index("by_clerkUserId", ["clerkUserId"]),

  // ── Credentials (encrypted service credentials for booking/automation) ──
  credentials: defineTable({
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    serviceName: v.string(), // "opentable" | "resy" | "expedia" | "booking_com" | "custom"
    serviceLabel: v.string(), // User-friendly: "OpenTable - John's Account"
    encryptedUsername: v.string(),
    encryptedPassword: v.string(),
    encryptedExtra: v.optional(v.string()), // JSON blob for additional fields
    lastUsedAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("revoked")),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_serviceName", ["organizationId", "serviceName"]),

  // ── Agent Plans (agentic loop plan tracking) ──
  agentPlans: defineTable({
    sessionId: v.id("sessions"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    planId: v.string(),
    goal: v.string(),
    steps: v.array(
      v.object({
        id: v.string(),
        description: v.string(),
        status: v.string(),
        result: v.optional(v.string()),
      })
    ),
    status: v.string(), // "active" | "completed" | "revised"
    reflections: v.array(v.string()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_projectId", ["projectId"])
    .index("by_organizationId", ["organizationId"]),

  // ── Subagent Runs (delegation tracking) ──
  subagentRuns: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    sessionId: v.optional(v.id("sessions")),
    parentAgentType: v.string(),
    childAgentType: v.string(),
    depth: v.number(),
    task: v.string(),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_projectId_status", ["projectId", "status"]),

  // ── Agent Teams (main/lead agent config, one per org) ──
  agentTeams: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    avatar: v.optional(v.string()), // Lucide icon name or emoji
    modelId: v.string(),
    personality: v.optional(v.string()),
    status: v.union(
      v.literal("idle"),
      v.literal("working"),
      v.literal("delegating")
    ),
    currentTask: v.optional(v.string()),
    lastActiveAt: v.optional(v.number()),
  })
    .index("by_organizationId", ["organizationId"]),

  // ── Team Agents (sub-agents, up to 8 per org) ──
  teamAgents: defineTable({
    organizationId: v.id("organizations"),
    agentTeamId: v.id("agentTeams"),
    name: v.string(),
    specialty: v.string(),
    modelId: v.string(),
    toolProfile: v.string(), // minimal | standard | research | automation | full
    customPrompt: v.optional(v.string()),
    status: v.union(
      v.literal("idle"),
      v.literal("working"),
      v.literal("waiting"),
      v.literal("error")
    ),
    currentTask: v.optional(v.string()),
    currentProjectId: v.optional(v.id("projects")),
    lastActiveAt: v.optional(v.number()),
    order: v.number(),
    isEnabled: v.boolean(),
    isHidden: v.optional(v.boolean()),
    reportsTo: v.optional(v.id("teamAgents")),
    minCollaboration: v.optional(v.array(v.id("teamAgents"))),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_agentTeamId", ["agentTeamId"])
    .index("by_status", ["status"]),

  // ── Agent Communications (inter-agent message log) ──
  agentCommunications: defineTable({
    organizationId: v.id("organizations"),
    agentTeamId: v.id("agentTeams"),
    projectId: v.optional(v.id("projects")),
    sessionId: v.optional(v.id("sessions")),
    fromType: v.union(v.literal("main"), v.literal("sub")),
    fromAgentId: v.optional(v.id("teamAgents")),
    fromName: v.string(),
    toType: v.union(v.literal("main"), v.literal("sub")),
    toAgentId: v.optional(v.id("teamAgents")),
    toName: v.string(),
    messageType: v.union(
      v.literal("delegation"),
      v.literal("result"),
      v.literal("question"),
      v.literal("info"),
      v.literal("error")
    ),
    content: v.string(),
    metadata: v.optional(v.any()),
    delegationChainId: v.optional(v.string()),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_agentTeamId", ["agentTeamId"])
    .index("by_projectId", ["projectId"])
    .index("by_sessionId", ["sessionId"])
    .index("by_delegationChainId", ["delegationChainId"]),

  // ── Leads (prospecting results) ──
  leads: defineTable({
    organizationId: v.id("organizations"),
    agentId: v.optional(v.string()),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    title: v.optional(v.string()),
    source: v.union(
      v.literal("google"),
      v.literal("meta"),
      v.literal("linkedin"),
      v.literal("manual")
    ),
    sourceUrl: v.optional(v.string()),
    status: v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("converted"),
      v.literal("rejected")
    ),
    notes: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_status", ["organizationId", "status"])
    .index("by_organizationId_source", ["organizationId", "source"])
    .index("by_email", ["email"])
    .index("by_phone", ["phone"]),

  // ── Home Services Campaign: City Tracking ──
  cityCampaigns: defineTable({
    organizationId: v.id("organizations"),
    cityName: v.string(),
    stateCode: v.string(),
    cityIndex: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("scraping"),
      v.literal("done"),
      v.literal("failed")
    ),
    businessesFound: v.optional(v.number()),
    lastRunAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_status", ["organizationId", "status"])
    .index("by_organizationId_cityIndex", ["organizationId", "cityIndex"]),

  // ── Home Services Campaign: Business Records ──
  businesses: defineTable({
    organizationId: v.id("organizations"),
    googlePlaceId: v.string(),
    name: v.string(),
    address: v.object({
      street: v.optional(v.string()),
      city: v.string(),
      state: v.string(),
      zip: v.optional(v.string()),
      formatted: v.string(),
    }),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    categories: v.array(v.string()),
    rating: v.optional(v.number()),
    reviewCount: v.optional(v.number()),
    reviews: v.optional(v.array(v.object({
      reviewerName: v.string(),
      text: v.string(),
      rating: v.number(),
      relativeTime: v.string(),
    }))),
    ownerName: v.optional(v.string()),
    ownerTitle: v.optional(v.string()),
    metaPageUrl: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    linkedinOwnerUrl: v.optional(v.string()),
    vertical: v.optional(v.string()),
    cityId: v.optional(v.id("cityCampaigns")),
    status: v.union(
      v.literal("new"),
      v.literal("enriching"),
      v.literal("ready"),
      v.literal("all_sent")
    ),
    outreachStatus: v.optional(v.object({
      emailSentAt: v.optional(v.number()),
      metaSentAt: v.optional(v.number()),
      linkedinSentAt: v.optional(v.number()),
      emailRepliedAt: v.optional(v.number()),
      metaRepliedAt: v.optional(v.number()),
      linkedinRepliedAt: v.optional(v.number()),
      emailRepliedBy: v.optional(v.string()),
      metaRepliedBy: v.optional(v.string()),
      linkedinRepliedBy: v.optional(v.string()),
      formSubmittedAt: v.optional(v.number()),
    })),
    // Email tracking (Resend integration)
    emailStatus: v.optional(v.union(v.literal("active"), v.literal("bounced"), v.literal("unsubscribed"))),
    emailOpenedAt: v.optional(v.number()),
    emailOpenCount: v.optional(v.number()),
    lastEmailMessageId: v.optional(v.string()),
    // Lead scoring
    leadScore: v.optional(v.number()),
    leadScoreVersion: v.optional(v.number()),
    // Outreach sequences
    outreachSequenceStep: v.optional(v.number()),
    outreachSequenceStartedAt: v.optional(v.number()),
    outreachLastStepAt: v.optional(v.number()),
    outreachNextStepAt: v.optional(v.number()),
    outreachRetryCount: v.optional(v.number()),
    outreachLastFailedAt: v.optional(v.number()),
    lastFollowUpAt: v.optional(v.number()),
    reactivatedAt: v.optional(v.number()),
    // Scraped social profile data for outreach personalization
    facebookData: v.optional(v.object({
      about: v.optional(v.string()),
      recentPosts: v.optional(v.array(v.object({
        text: v.string(),
        date: v.optional(v.string()),
      }))),
    })),
    linkedinData: v.optional(v.object({
      headline: v.optional(v.string()),
      about: v.optional(v.string()),
      recentPosts: v.optional(v.array(v.object({
        text: v.string(),
        date: v.optional(v.string()),
      }))),
    })),
    // Sent emails log — track what was actually sent
    sentEmails: v.optional(v.array(v.object({
      subject: v.string(),
      body: v.string(),
      sentAt: v.number(),
      provider: v.string(),
      messageId: v.optional(v.string()),
    }))),
    // Website quality assessment — does this business NEED a new website?
    websiteQuality: v.optional(v.object({
      score: v.number(),
      mobile: v.boolean(),
      ssl: v.boolean(),
      platform: v.optional(v.string()),
      speed: v.optional(v.string()),
      hasContactForm: v.boolean(),
      lastUpdated: v.optional(v.string()),
      needsUpgrade: v.union(v.literal("critical"), v.literal("recommended"), v.literal("good")),
    })),
    // Contact form URL (when no email found but form exists)
    contactFormUrl: v.optional(v.string()),
    // Email replies (from IMAP polling)
    emailReplies: v.optional(v.array(v.object({
      text: v.string(),
      receivedAt: v.number(),
      classification: v.string(),
      from: v.string(),
    }))),
    // Review insights — extracted themes for personalization
    reviewInsights: v.optional(v.object({
      strengths: v.array(v.string()),
      weaknesses: v.array(v.string()),
      customerType: v.optional(v.string()),
      sentimentScore: v.number(),
      bestQuote: v.optional(v.string()),
      bestQuoteAuthor: v.optional(v.string()),
      painPoints: v.optional(v.array(v.object({
        theme: v.string(),
        evidence: v.string(),
        solution: v.string(),
        emailHook: v.string(),
      }))),
    })),
    // A/B subject line test tracking
    subjectLineTests: v.optional(v.array(v.object({
      variant: v.string(),
      sentCount: v.number(),
      openCount: v.number(),
      replyCount: v.number(),
    }))),
    // CRM pipeline stage
    pipelineStage: v.optional(v.union(
      v.literal("scraped"),
      v.literal("enriched"),
      v.literal("contacted"),
      v.literal("opened"),
      v.literal("replied"),
      v.literal("qualified"),
      v.literal("proposal"),
      v.literal("won"),
      v.literal("lost"),
    )),
    // Reply classification
    replyClassification: v.optional(v.union(
      v.literal("hot"),
      v.literal("warm"),
      v.literal("objection"),
      v.literal("cold"),
      v.literal("auto_reply"),
    )),
    // Enrichment quality (0–4: how many of email/owner/fb/linkedin were found)
    enrichmentQuality: v.optional(v.number()),
    // Enrichment process log — what was searched and found/not found
    enrichmentLog: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_status", ["organizationId", "status"])
    .index("by_googlePlaceId", ["googlePlaceId"])
    .index("by_cityId", ["cityId"])
    .index("by_lastEmailMessageId", ["lastEmailMessageId"])
    .index("by_organizationId_email", ["organizationId", "email"])
    .index("by_organizationId_outreachNextStepAt", ["organizationId", "outreachNextStepAt"])
    .index("by_organizationId_emailStatus", ["organizationId", "emailStatus"])
    .index("by_organizationId_createdAt", ["organizationId", "createdAt"]),

  // ── Outreach Daily Counts (atomic counters per org/date/channel) ──
  outreachDailyCounts: defineTable({
    organizationId: v.id("organizations"),
    date: v.string(),      // "YYYY-MM-DD"
    channel: v.string(),   // "email" | "meta" | "linkedin"
    count: v.number(),
  })
    .index("by_org_date_channel", ["organizationId", "date", "channel"]),

  // ── Business Aggregates (pre-computed per-org stats, updated on status changes) ──
  businessAggregates: defineTable({
    organizationId: v.id("organizations"),
    scraped: v.number(),
    enriched: v.number(),
    scored: v.number(),
    contacted: v.number(),
    opened: v.number(),
    replied: v.number(),
    emailSent: v.number(),
    emailBounced: v.number(),
    emailUnsubscribed: v.number(),
    lastUpdated: v.number(),
  })
    .index("by_organizationId", ["organizationId"]),

  // ── Rate limits (per-user + per-org, per-minute counters) ──
  // Used by /api/chat (and potentially other expensive endpoints) to cap
  // request volume. Row layout: one per (scope, key, minute) bucket.
  // Entries are naturally evicted on next write to the same bucket once the
  // minute rolls over — no separate cleanup cron needed if reads always use
  // the current minute as part of the lookup key.
  rateLimits: defineTable({
    scope: v.string(),        // e.g. "chat:user" | "chat:org"
    key: v.string(),          // clerk user id or Convex org id
    minute: v.number(),       // Math.floor(Date.now() / 60000)
    count: v.number(),
  })
    .index("by_scope_key_minute", ["scope", "key", "minute"]),

  // ── Lead Gen: Social Group Posts ──
  leadGenPosts: defineTable({
    organizationId: v.id("organizations"),
    platform: v.union(
      v.literal("reddit"),
      v.literal("meta_group"),
      v.literal("linkedin_group"),
      v.literal("youtube"),
      v.literal("discord"),
      v.literal("twitter"),
      v.literal("quora"),
      v.literal("nextdoor")
    ),
    // Legacy fields (kept for backward compat)
    groupName: v.optional(v.string()),
    groupUrl: v.optional(v.string()),
    // New unified target fields
    targetId: v.optional(v.string()),
    targetName: v.optional(v.string()),
    content: v.optional(v.string()),
    vertical: v.optional(v.string()),
    postedAt: v.optional(v.number()),
    status: v.union(v.literal("posted"), v.literal("failed"), v.literal("logged")),
    error: v.optional(v.string()),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_platform", ["organizationId", "platform"])
    .index("by_organizationId_postedAt", ["organizationId", "postedAt"]),

  // ── Tasks (Kanban board items managed by lead agent) ──
  tasks: defineTable({
    organizationId: v.id("organizations"),
    title: v.string(),
    description: v.optional(v.string()),
    stage: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("quality_review"),
      v.literal("done")
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent")
    ),
    assignedAgentId: v.optional(v.id("teamAgents")),
    assignedAgentName: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    sessionId: v.optional(v.id("sessions")),
    createdBy: v.optional(v.string()), // "user" | "agent" | agent name
    tags: v.optional(v.array(v.string())),
    dueAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_stage", ["organizationId", "stage"]),

  // ── Agent Decision Log (tracks sent/skipped/deferred per business) ──
  agentDecisionLog: defineTable({
    organizationId: v.id("organizations"),
    agentName: v.string(),
    businessId: v.optional(v.id("businesses")),
    decision: v.union(v.literal("sent"), v.literal("skipped"), v.literal("deferred")),
    reason: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_agentName", ["organizationId", "agentName"])
    .index("by_businessId", ["businessId"]),

  // ── Platform Config (per-agent-type build criteria, editable by super admins) ──
  platformConfig: defineTable({
    agentType: v.string(),
    buildCriteria: v.string(),
    isOverride: v.boolean(),
    enabled: v.boolean(),
    updatedBy: v.string(),
    notes: v.optional(v.string()),
  })
    .index("by_agentType", ["agentType"]),

  // ── Email Warmup Tracking ──
  emailWarmup: defineTable({
    organizationId: v.id("organizations"),
    accountEmail: v.string(),
    stage: v.union(
      v.literal("week1"),
      v.literal("week2"),
      v.literal("week3"),
      v.literal("week4"),
      v.literal("warmed"),
      v.literal("paused"),
    ),
    startedAt: v.number(),
    dailyLimit: v.number(),
    sentToday: v.number(),
    lastSentAt: v.optional(v.number()),
    lastResetDate: v.optional(v.string()),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_accountEmail", ["accountEmail"]),

  // ── Send Timing Analytics ──
  sendTimingAnalytics: defineTable({
    organizationId: v.id("organizations"),
    hourUTC: v.number(),
    dayOfWeek: v.number(),
    sentCount: v.number(),
    openCount: v.number(),
    replyCount: v.number(),
  })
    .index("by_organizationId", ["organizationId"]),

});
