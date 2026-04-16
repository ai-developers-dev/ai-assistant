import { describe, it, expect } from "vitest";
import { validateEmailContent } from "./spam-filter";

const CLEAN_SUBJECT = "Quick question about your roofing business";
const CLEAN_BODY = [
  "Hi Mike,",
  "",
  "I noticed your company has been getting great reviews in Chicago —",
  "congrats on the 4.8 average rating. I help local service businesses like",
  "yours automate their lead follow-up. Would you be open to a 10-min call",
  "next week to see if there is a fit?",
  "",
  "Thanks,",
  "Doug",
].join("\n");

const SPAMMY_SUBJECT = "ACT NOW - FREE GIFT - 100% GUARANTEED!!!";
const SPAMMY_BODY =
  "Dear friend, congratulations! You've been selected as a winner! " +
  "Click here NOW to claim your free prize. Limited time offer, don't miss out! " +
  "Risk-free, money back guarantee. ACT IMMEDIATELY before this AMAZING offer expires! " +
  "$$$ make money fast $$$ cash prize guaranteed!!!";

describe("validateEmailContent", () => {
  it("passes a normal, personalized outreach email", () => {
    const result = validateEmailContent(CLEAN_SUBJECT, CLEAN_BODY);
    expect(result.pass).toBe(true);
  });

  it("assigns a significantly higher score to obvious spam than to a clean email", () => {
    // Rather than guess the exact threshold (which evolves as the filter is
    // tuned), assert the behavioral guarantee: spammy > clean by a wide margin.
    const clean = validateEmailContent(CLEAN_SUBJECT, CLEAN_BODY);
    const spammy = validateEmailContent(SPAMMY_SUBJECT, SPAMMY_BODY);
    expect(spammy.score).toBeGreaterThan(clean.score + 20);
  });

  it("reports specific issues when an email contains spam triggers", () => {
    const result = validateEmailContent(SPAMMY_SUBJECT, SPAMMY_BODY);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
    // We expect at least one of the categories to be flagged
    const joined = result.issues.join(" ").toLowerCase();
    expect(joined).toMatch(/spam trigger|caps|exclamation|subject/);
  });

  it("returns a numeric score clamped between 0 and 100", () => {
    const result = validateEmailContent(SPAMMY_SUBJECT, SPAMMY_BODY);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
