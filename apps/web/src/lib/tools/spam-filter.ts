/**
 * Email Spam Filter — validates outgoing emails for spam trigger words,
 * formatting issues, and deliverability red flags BEFORE sending.
 */

// Spam trigger words organized by category with severity weights
const SPAM_TRIGGERS: Array<{ words: string[]; category: string; weight: number }> = [
  // Urgency (weight: 3 per match)
  { words: ["act now", "limited time", "urgent", "expires", "deadline", "last chance", "hurry", "don't miss", "before it's too late", "only today", "time is running out"], category: "urgency", weight: 3 },
  // Free stuff (weight: 4 per match — heavily flagged)
  { words: ["free", "no cost", "no obligation", "complimentary", "bonus", "gift", "giveaway", "at no charge", "free trial", "free consultation", "zero cost"], category: "free_stuff", weight: 4 },
  // Money/pricing (weight: 3)
  { words: ["discount", "save money", "cheap", "bargain", "lowest price", "best price", "profit", "cash", "earnings", "make money", "double your", "increase revenue", "roi"], category: "money", weight: 3 },
  // Guarantees (weight: 4)
  { words: ["guarantee", "guaranteed", "no risk", "risk-free", "satisfaction guaranteed", "money back", "100%", "promise"], category: "guarantee", weight: 4 },
  // Sales pressure (weight: 3)
  { words: ["buy now", "order now", "click here", "click below", "sign up", "subscribe now", "apply now", "get started now", "don't wait", "call now", "limited offer"], category: "sales_pressure", weight: 3 },
  // Hype words (weight: 2)
  { words: ["amazing", "incredible", "unbelievable", "revolutionary", "breakthrough", "exclusive", "special offer", "once in a lifetime", "never before", "miracle"], category: "hype", weight: 2 },
  // Spam patterns (weight: 5 — instant red flag)
  { words: ["dear friend", "dear sir", "congratulations", "you've been selected", "winner", "prize", "you won", "claim your", "as seen on", "this isn't spam"], category: "spam_pattern", weight: 5 },
  // Financial (weight: 3)
  { words: ["no credit check", "credit card", "wire transfer", "bitcoin", "cryptocurrency", "investment opportunity", "earn extra", "extra income"], category: "financial", weight: 3 },
  // Deceptive (weight: 4)
  { words: ["act immediately", "do it today", "what are you waiting for", "don't delete", "not junk", "this is not spam", "read this", "important information regarding"], category: "deceptive", weight: 4 },
];

// Additional single-word triggers with lower weight
const SINGLE_WORD_TRIGGERS = new Set([
  "free", "guarantee", "guaranteed", "winner", "prize", "congratulations",
  "urgent", "discount", "exclusive", "limited", "offer",
]);

export interface SpamCheckResult {
  pass: boolean;
  score: number;        // 0-100 (0 = clean, 100 = pure spam)
  issues: string[];     // List of problems found
  suggestions: string[]; // How to fix
}

export function validateEmailContent(subject: string, body: string): SpamCheckResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  const fullText = `${subject} ${body}`.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();

  // --- Check spam trigger phrases ---
  const matchedCategories = new Set<string>();
  for (const group of SPAM_TRIGGERS) {
    for (const word of group.words) {
      if (fullText.includes(word)) {
        score += group.weight;
        if (!matchedCategories.has(group.category)) {
          matchedCategories.add(group.category);
          issues.push(`Spam trigger: "${word}" (${group.category})`);
          suggestions.push(`Remove or rephrase "${word}" — spam filters flag this`);
        }
        break; // Only count once per category
      }
    }
  }

  // --- Check ALL CAPS words ---
  const capsWords = (subject + " " + body).match(/\b[A-Z]{3,}\b/g) || [];
  const realCapsWords = capsWords.filter(w => !["USA", "LLC", "CEO", "CTO", "CRM", "SEO", "HVAC", "FBI", "CIA", "HTML", "CSS", "API", "SMS", "DM", "FB"].includes(w));
  if (realCapsWords.length > 0) {
    score += realCapsWords.length * 2;
    issues.push(`ALL CAPS words found: ${realCapsWords.slice(0, 3).join(", ")}`);
    suggestions.push("Avoid ALL CAPS — use normal capitalization");
  }

  // --- Check excessive punctuation ---
  const exclamations = (subject + body).match(/!{2,}/g);
  if (exclamations) {
    score += exclamations.length * 3;
    issues.push(`Excessive exclamation marks: ${exclamations.length} instance(s)`);
    suggestions.push("Use at most one ! per email");
  }

  const questions = (subject + body).match(/\?{2,}/g);
  if (questions) {
    score += questions.length * 2;
    issues.push("Multiple question marks in a row");
    suggestions.push("Use single ? only");
  }

  // --- Check $ symbols ---
  const dollarSigns = (subject + body).match(/\$/g);
  if (dollarSigns && dollarSigns.length > 1) {
    score += dollarSigns.length * 2;
    issues.push(`Multiple $ symbols (${dollarSigns.length})`);
    suggestions.push("Avoid dollar signs — spell out amounts or remove pricing");
  }

  // --- Check link count ---
  const links = body.match(/https?:\/\//g) || [];
  if (links.length > 2) {
    score += (links.length - 2) * 5;
    issues.push(`Too many links (${links.length}) — max 1-2 recommended`);
    suggestions.push("Remove extra links. One CTA link is ideal");
  }

  // --- Subject line checks ---
  if (subject.length > 60) {
    score += 3;
    issues.push(`Subject too long (${subject.length} chars) — 40-60 is optimal`);
    suggestions.push("Shorten subject to under 60 characters");
  }
  if (subject.length < 10) {
    score += 2;
    issues.push("Subject too short — looks suspicious");
    suggestions.push("Make subject 20-50 characters");
  }
  if (/^[A-Z\s!]+$/.test(subject)) {
    score += 5;
    issues.push("Subject is ALL CAPS");
    suggestions.push("Use normal sentence case in subject");
  }
  if (subject.includes("RE:") || subject.includes("FW:")) {
    score += 3;
    issues.push("Fake RE:/FW: prefix in subject");
    suggestions.push("Remove fake reply/forward prefix");
  }

  // --- Body checks ---
  const wordCount = body.split(/\s+/).length;
  if (wordCount < 30) {
    score += 3;
    issues.push(`Body too short (${wordCount} words) — looks like spam`);
    suggestions.push("Write at least 50-100 words for a natural email");
  }
  if (wordCount > 500) {
    score += 3;
    issues.push(`Body too long (${wordCount} words) — reduces engagement`);
    suggestions.push("Keep under 250 words for cold outreach");
  }

  // --- Check for personalization (positive signal) ---
  const hasName = /\b(hi|hey|hello)\s+[A-Z][a-z]+/i.test(body);
  if (hasName) score -= 5; // Bonus for personalization

  const hasSpecificDetail = body.includes("review") || body.includes("rating") || body.includes("stars");
  if (hasSpecificDetail) score -= 3; // Bonus for specific references

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  return {
    pass: score <= 40,
    score,
    issues,
    suggestions,
  };
}
