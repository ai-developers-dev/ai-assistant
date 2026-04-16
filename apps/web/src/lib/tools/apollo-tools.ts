import { tool } from "ai";
import { z } from "zod";

// Search Apollo.io for people at a company (owner/CEO/founder)
export function createApolloPersonSearchTool(apiKey: string) {
  return tool({
    description: "Search Apollo.io for owner/CEO/founder of a business. Returns name, email, phone, LinkedIn, and title.",
    parameters: z.object({
      organizationName: z.string().describe("Business name"),
      location: z.string().describe("City, State (e.g. 'Chicago, Illinois')"),
    }),
    execute: async ({ organizationName, location }) => {
      try {
        const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
          body: JSON.stringify({
            q_organization_name: organizationName,
            person_locations: [location],
            person_seniorities: ["owner", "founder", "c_suite", "partner", "director"],
            page: 1,
            per_page: 5,
          }),
        });
        if (!res.ok) {
          const err = await res.text().catch(() => "");
          return { success: false, error: `Apollo: HTTP ${res.status} — ${err.slice(0, 200)}`, people: [] };
        }
        const data = await res.json();
        const people = (data.people || []).map((p: any) => ({
          firstName: p.first_name,
          lastName: p.last_name,
          name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
          email: p.email,
          phone: p.phone_numbers?.[0]?.sanitized_number || p.phone_numbers?.[0]?.raw_number,
          title: p.title,
          linkedinUrl: p.linkedin_url,
          city: p.city,
          state: p.state,
          organization: p.organization?.name,
        }));
        return { success: true, people, count: people.length };
      } catch (err: any) {
        return { success: false, error: err.message, people: [] };
      }
    },
  });
}

// Standalone helper (not a tool) for use inside enrichment
export async function apolloSearchOwner(
  businessName: string,
  city: string,
  state: string,
  apiKey: string,
  log: string[]
): Promise<{ name?: string; email?: string; phone?: string; linkedinUrl?: string; title?: string } | null> {
  try {
    log.push(`  Searching Apollo.io for owner/CEO...`);
    const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({
        q_organization_name: businessName,
        person_locations: [`${city}, ${state}`],
        person_seniorities: ["owner", "founder", "c_suite", "partner"],
        page: 1,
        per_page: 5,
      }),
    });
    if (!res.ok) {
      log.push(`  → Apollo.io: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const people = data.people || [];
    log.push(`  → Apollo.io returned ${people.length} people`);

    if (people.length === 0) {
      log.push("  ✗ No people found in Apollo.io");
      return null;
    }

    // Prefer owner/founder, then CEO, then any C-level
    const ownerKeywords = ["owner", "founder", "co-founder", "proprietor"];
    const ceoKeywords = ["ceo", "chief executive", "president"];

    let best = people.find((p: any) =>
      p.title && ownerKeywords.some((k: string) => p.title.toLowerCase().includes(k))
    );
    if (!best) {
      best = people.find((p: any) =>
        p.title && ceoKeywords.some((k: string) => p.title.toLowerCase().includes(k))
      );
    }
    if (!best) best = people[0]; // fallback to first result

    const result = {
      name: `${best.first_name || ""} ${best.last_name || ""}`.trim() || undefined,
      email: best.email || undefined,
      phone: best.phone_numbers?.[0]?.sanitized_number || best.phone_numbers?.[0]?.raw_number || undefined,
      linkedinUrl: best.linkedin_url || undefined,
      title: best.title || undefined,
    };

    if (result.name) log.push(`  ✓ Owner: ${result.name} (${result.title || "no title"})`);
    if (result.email) log.push(`  ✓ Email: ${result.email}`);
    if (result.phone) log.push(`  ✓ Phone: ${result.phone}`);
    if (result.linkedinUrl) log.push(`  ✓ LinkedIn: ${result.linkedinUrl}`);

    return result;
  } catch (err: any) {
    log.push(`  → Apollo.io error: ${err.message?.slice(0, 100)}`);
    return null;
  }
}
