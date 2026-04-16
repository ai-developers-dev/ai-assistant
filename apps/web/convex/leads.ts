import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Queries ──

/** List leads for an org, optional status/source filter */
export const list = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("contacted"),
        v.literal("qualified"),
        v.literal("converted"),
        v.literal("rejected")
      )
    ),
    source: v.optional(
      v.union(
        v.literal("google"),
        v.literal("meta"),
        v.literal("linkedin"),
        v.literal("manual")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q;

    if (args.status) {
      q = ctx.db
        .query("leads")
        .withIndex("by_organizationId_status", (idx) =>
          idx.eq("organizationId", args.organizationId).eq("status", args.status!)
        );
    } else if (args.source) {
      q = ctx.db
        .query("leads")
        .withIndex("by_organizationId_source", (idx) =>
          idx.eq("organizationId", args.organizationId).eq("source", args.source!)
        );
    } else {
      q = ctx.db
        .query("leads")
        .withIndex("by_organizationId", (idx) =>
          idx.eq("organizationId", args.organizationId)
        );
    }

    const limit = args.limit ?? 100;
    return await q.order("desc").take(limit);
  },
});

/** Get a single lead by ID */
export const getById = query({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Filter leads by status within org */
export const listByStatus = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("converted"),
      v.literal("rejected")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("leads")
      .withIndex("by_organizationId_status", (idx) =>
        idx.eq("organizationId", args.organizationId).eq("status", args.status)
      )
      .order("desc")
      .take(limit);
  },
});

/** Search leads by name/company/email (simple text match) */
export const search = query({
  args: {
    organizationId: v.id("organizations"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const searchLower = args.query.toLowerCase();

    const allLeads = await ctx.db
      .query("leads")
      .withIndex("by_organizationId", (idx) =>
        idx.eq("organizationId", args.organizationId)
      )
      .take(500);

    return allLeads
      .filter(
        (lead) =>
          lead.name.toLowerCase().includes(searchLower) ||
          lead.company?.toLowerCase().includes(searchLower) ||
          lead.email?.toLowerCase().includes(searchLower)
      )
      .slice(0, limit);
  },
});

// ── Mutations ──

/** Create a single lead (used by prospecting tools) */
export const createFromServer = mutation({
  args: {
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
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("contacted"),
        v.literal("qualified"),
        v.literal("converted"),
        v.literal("rejected")
      )
    ),
    notes: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Dedup: check email first, then phone, then name+company
    if (args.email) {
      const existing = await ctx.db
        .query("leads")
        .withIndex("by_email", (idx) => idx.eq("email", args.email!))
        .first();

      if (existing && existing.organizationId === args.organizationId) {
        return existing._id;
      }
    }

    if (args.phone) {
      const existing = await ctx.db
        .query("leads")
        .withIndex("by_phone", (idx) => idx.eq("phone", args.phone!))
        .first();

      if (existing && existing.organizationId === args.organizationId) {
        return existing._id;
      }
    }

    // Fallback: name + company match (for LinkedIn leads with no email/phone)
    if (args.name && args.company) {
      const orgLeads = await ctx.db
        .query("leads")
        .withIndex("by_organizationId", (idx) =>
          idx.eq("organizationId", args.organizationId)
        )
        .collect();

      const nameLower = args.name.toLowerCase();
      const companyLower = args.company.toLowerCase();
      const match = orgLeads.find(
        (l) =>
          l.name.toLowerCase() === nameLower &&
          l.company?.toLowerCase() === companyLower
      );
      if (match) return match._id;
    }

    const now = Date.now();
    return await ctx.db.insert("leads", {
      organizationId: args.organizationId,
      agentId: args.agentId,
      name: args.name,
      email: args.email,
      phone: args.phone,
      company: args.company,
      title: args.title,
      source: args.source,
      sourceUrl: args.sourceUrl,
      status: args.status ?? "new",
      notes: args.notes,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Bulk insert leads (dedup by email within org) */
export const batchCreateFromServer = mutation({
  args: {
    organizationId: v.id("organizations"),
    agentId: v.optional(v.string()),
    leads: v.array(
      v.object({
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
        notes: v.optional(v.string()),
        metadata: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const created: string[] = [];
    const skipped: string[] = [];

    for (const lead of args.leads) {
      // Dedup: check email, then phone, then name+company
      let isDuplicate = false;

      if (lead.email) {
        const existing = await ctx.db
          .query("leads")
          .withIndex("by_email", (idx) => idx.eq("email", lead.email!))
          .first();
        if (existing && existing.organizationId === args.organizationId) {
          skipped.push(lead.email ?? lead.name);
          isDuplicate = true;
        }
      }

      if (!isDuplicate && lead.phone) {
        const existing = await ctx.db
          .query("leads")
          .withIndex("by_phone", (idx) => idx.eq("phone", lead.phone!))
          .first();
        if (existing && existing.organizationId === args.organizationId) {
          skipped.push(lead.phone ?? lead.name);
          isDuplicate = true;
        }
      }

      if (!isDuplicate && lead.name && lead.company) {
        const orgLeads = await ctx.db
          .query("leads")
          .withIndex("by_organizationId", (idx) =>
            idx.eq("organizationId", args.organizationId)
          )
          .collect();
        const nameLower = lead.name.toLowerCase();
        const companyLower = lead.company.toLowerCase();
        const match = orgLeads.find(
          (l) =>
            l.name.toLowerCase() === nameLower &&
            l.company?.toLowerCase() === companyLower
        );
        if (match) {
          skipped.push(lead.name);
          isDuplicate = true;
        }
      }

      if (isDuplicate) continue;

      const id = await ctx.db.insert("leads", {
        organizationId: args.organizationId,
        agentId: args.agentId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        company: lead.company,
        title: lead.title,
        source: lead.source,
        sourceUrl: lead.sourceUrl,
        status: "new",
        notes: lead.notes,
        metadata: lead.metadata,
        createdAt: now,
        updatedAt: now,
      });
      created.push(id);
    }

    return { created: created.length, skipped: skipped.length };
  },
});

/** Update lead status */
export const updateStatus = mutation({
  args: {
    id: v.id("leads"),
    status: v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("converted"),
      v.literal("rejected")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new Error("Lead not found");

    const patch: any = { status: args.status, updatedAt: Date.now() };
    if (args.notes !== undefined) patch.notes = args.notes;

    await ctx.db.patch(args.id, patch);
    return { success: true };
  },
});
