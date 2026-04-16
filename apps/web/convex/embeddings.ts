import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";

// ── insertMemory ─────────────────────────────────────────────────────
// Store a memory with its embedding vector for later semantic search.

export const insertMemory = mutation({
  args: {
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
    importance: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("embeddings", {
      organizationId: args.organizationId,
      projectId: args.projectId,
      sessionId: args.sessionId,
      content: args.content,
      embedding: args.embedding,
      metadata: args.metadata,
      importance: args.importance,
      createdAt: Date.now(),
    });
  },
});

// ── searchMemories ───────────────────────────────────────────────────
// Semantic search over stored memories using vector similarity.
// Must be an action (not query) because vectorSearch requires it.

export const searchMemories = action({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<{
    _id: string;
    _score: number;
    content: string;
    metadata: { source?: string; type?: string } | undefined;
    projectId: string | undefined;
  }>> => {
    const results = await ctx.vectorSearch("embeddings", "by_embedding", {
      vector: args.embedding,
      limit: args.limit ?? 5,
      filter: (q) => q.eq("organizationId", args.organizationId),
    });

    // Fetch full documents for the matched IDs
    const docs: Array<{
      _id: string;
      _score: number;
      content: string;
      metadata: { source?: string; type?: string } | undefined;
      projectId: string | undefined;
    }> = [];

    for (const result of results) {
      const doc = await ctx.runQuery(api.embeddings.getById, {
        id: result._id,
      });
      if (doc) {
        docs.push({
          _id: result._id as string,
          _score: result._score,
          content: doc.content,
          metadata: doc.metadata,
          projectId: doc.projectId as string | undefined,
        });
      }
    }

    return docs;
  },
});

// ── hybridSearchMemories ─────────────────────────────────────────────
// Hybrid BM25 + vector search with temporal decay and MMR deduplication.
// Combines keyword (full-text) and semantic (vector) results via Reciprocal
// Rank Fusion, then re-ranks with recency bias and diversity filtering.

export const hybridSearchMemories = action({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    embedding: v.array(v.float64()),
    query: v.string(), // raw text for full-text search
    limit: v.optional(v.number()),
    halfLifeDays: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<{
    _id: string;
    _score: number;
    content: string;
    metadata: { source?: string; type?: string } | undefined;
    projectId: string | undefined;
  }>> => {
    const limit = args.limit ?? 5;
    const halfLifeDays = args.halfLifeDays ?? 30;
    const lambda = Math.log(2) / halfLifeDays;
    const fetchLimit = Math.max(limit * 2, 10);

    // 1. Vector search (semantic)
    const vectorResults = await ctx.vectorSearch("embeddings", "by_embedding", {
      vector: args.embedding,
      limit: fetchLimit,
      filter: (q) => q.eq("organizationId", args.organizationId),
    });

    // 2. Full-text search (keyword / BM25 via Convex's Tantivy-based searchIndex)
    let ftsResults: Array<{ _id: any; _score: number }> = [];
    if (args.query && args.query.trim().length > 0) {
      const ftsQuery = ctx.runQuery(api.embeddings.fullTextSearch, {
        organizationId: args.organizationId,
        projectId: args.projectId,
        query: args.query,
        limit: fetchLimit,
      });
      const ftsDocs = await ftsQuery;
      // Assign decreasing scores by rank position
      ftsResults = ftsDocs.map((doc: any, idx: number) => ({
        _id: doc._id,
        _score: 1 / (idx + 1), // rank-based score
      }));
    }

    // 3. Reciprocal Rank Fusion (k=60)
    const k = 60;
    const fusedScores = new Map<string, number>();
    const allIds = new Set<string>();

    for (let i = 0; i < vectorResults.length; i++) {
      const id = vectorResults[i]._id as string;
      allIds.add(id);
      fusedScores.set(id, (fusedScores.get(id) || 0) + 1 / (k + i + 1));
    }

    for (let i = 0; i < ftsResults.length; i++) {
      const id = ftsResults[i]._id as string;
      allIds.add(id);
      fusedScores.set(id, (fusedScores.get(id) || 0) + 1 / (k + i + 1));
    }

    // 4. Fetch full documents
    const docMap = new Map<string, any>();
    for (const id of allIds) {
      const doc = await ctx.runQuery(api.embeddings.getById, { id: id as any });
      if (doc) docMap.set(id, doc);
    }

    // 5. Apply temporal decay: score × e^(-λ × ageDays)
    const now = Date.now();
    const scoredResults: Array<{ id: string; score: number; doc: any }> = [];

    for (const [id, rrfScore] of fusedScores) {
      const doc = docMap.get(id);
      if (!doc) continue;

      let decayMultiplier = 1;
      if (doc.createdAt) {
        const ageDays = (now - doc.createdAt) / (1000 * 60 * 60 * 24);
        decayMultiplier = Math.exp(-lambda * ageDays);
      }

      scoredResults.push({
        id,
        score: rrfScore * decayMultiplier,
        doc,
      });
    }

    // Sort by score descending
    scoredResults.sort((a, b) => b.score - a.score);

    // 6. MMR deduplication: iteratively select results maximizing diversity
    // λ_mmr × relevance - (1 - λ_mmr) × maxJaccardSimilarity
    const lambdaMmr = 0.7;
    const selected: typeof scoredResults = [];
    const remaining = [...scoredResults];

    while (selected.length < limit && remaining.length > 0) {
      let bestIdx = 0;
      let bestMmrScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const relevance = candidate.score;

        // Find max Jaccard similarity to already-selected results
        let maxJaccard = 0;
        const candidateWords = tokenize(candidate.doc.content);

        for (const sel of selected) {
          const selWords = tokenize(sel.doc.content);
          const jaccard = jaccardSimilarity(candidateWords, selWords);
          if (jaccard > maxJaccard) maxJaccard = jaccard;
        }

        const mmrScore = lambdaMmr * relevance - (1 - lambdaMmr) * maxJaccard;
        if (mmrScore > bestMmrScore) {
          bestMmrScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push(remaining[bestIdx]);
      remaining.splice(bestIdx, 1);
    }

    // 7. Return final results
    return selected.map((r) => ({
      _id: r.id,
      _score: r.score,
      content: r.doc.content,
      metadata: r.doc.metadata,
      projectId: r.doc.projectId as string | undefined,
    }));
  },
});

// Helper: tokenize content into a word set for Jaccard similarity
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
}

// Helper: Jaccard similarity between two word sets
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── fullTextSearch ───────────────────────────────────────────────────
// Query used by hybridSearchMemories for the keyword (BM25) leg.

export const fullTextSearch = query({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("embeddings")
      .withSearchIndex("search_content", (s) => {
        let search = s.search("content", args.query)
          .eq("organizationId", args.organizationId);
        if (args.projectId) {
          search = search.eq("projectId", args.projectId);
        }
        return search;
      });

    return await q.take(args.limit ?? 10);
  },
});

// ── getById ──────────────────────────────────────────────────────────
// Helper query to fetch a single embedding doc (used by searchMemories action).

export const getById = query({
  args: { id: v.id("embeddings") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ── listByProject ────────────────────────────────────────────────────
// Non-vector list of recent memories for a project (for UI display).

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("embeddings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 20);
  },
});

// ── deleteMemory ─────────────────────────────────────────────────────
// Remove a memory by ID.

export const deleteMemory = mutation({
  args: { id: v.id("embeddings") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
