import { tool } from "ai";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";

export function createDiscordPostTool(webhooks: Array<{ serverName: string; channelName: string; webhookUrl: string }>, config: { organizationId: string; convex: any }) {
  return tool({
    description: "Post a message to a Discord channel via webhook. Available servers: " + webhooks.map(w => `${w.serverName}/#${w.channelName}`).join(", "),
    parameters: z.object({
      serverName: z.string().describe("Name of the Discord server to post to"),
      content: z.string().max(2000).describe("Message content (max 2000 chars)"),
      username: z.string().optional().describe("Display name for the bot (optional)"),
    }),
    execute: async ({ serverName, content, username }) => {
      const webhook = webhooks.find(w => w.serverName.toLowerCase() === serverName.toLowerCase());
      if (!webhook) {
        return { success: false, error: `No webhook configured for server "${serverName}". Available: ${webhooks.map(w => w.serverName).join(", ")}` };
      }
      const res = await fetch(webhook.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, username: username || "Lead Gen Bot" }),
      });
      if (!res.ok) {
        return { success: false, error: `Discord webhook failed: ${res.status}` };
      }
      try {
        await config.convex.mutation(api.leadGenPosts.create, {
          organizationId: config.organizationId,
          platform: "discord",
          targetId: webhook.serverName,
          targetName: `${webhook.serverName}/#${webhook.channelName}`,
          content,
          status: "posted",
        });
      } catch (err) {
        console.error("[discord-tool] leadGenPosts.create failed:", err);
      }
      return { success: true, server: webhook.serverName, channel: webhook.channelName };
    },
  });
}
