import { tool } from "ai";
import { z } from "zod";

export function createHunterDomainSearchTool(apiKey: string) {
  return tool({
    description: "Search Hunter.io for email addresses associated with a domain. Returns emails, names, and positions found at the company.",
    parameters: z.object({
      domain: z.string().describe("Website domain to search (e.g., 'rescueplumbing.com')"),
    }),
    execute: async ({ domain }) => {
      try {
        const res = await fetch(
          `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}`,
        );
        if (!res.ok) {
          return { success: false, error: `Hunter.io: HTTP ${res.status}`, emails: [] };
        }
        const data = await res.json();
        const emails = (data.data?.emails || []).map((e: any) => ({
          email: e.value,
          firstName: e.first_name,
          lastName: e.last_name,
          position: e.position,
          confidence: e.confidence,
          type: e.type, // "personal" or "generic"
        }));
        return { success: true, emails, domain, organization: data.data?.organization };
      } catch (err: any) {
        return { success: false, error: err.message, emails: [] };
      }
    },
  });
}

export function createHunterEmailFinderTool(apiKey: string) {
  return tool({
    description: "Find a specific person's email address given their name and company domain.",
    parameters: z.object({
      domain: z.string().describe("Company website domain"),
      firstName: z.string().describe("Person's first name"),
      lastName: z.string().describe("Person's last name"),
    }),
    execute: async ({ domain, firstName, lastName }) => {
      try {
        const params = new URLSearchParams({
          domain,
          first_name: firstName,
          last_name: lastName,
          api_key: apiKey,
        });
        const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
        if (!res.ok) {
          return { success: false, error: `Hunter.io: HTTP ${res.status}` };
        }
        const data = await res.json();
        return {
          success: true,
          email: data.data?.email,
          confidence: data.data?.score,
          firstName,
          lastName,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}
