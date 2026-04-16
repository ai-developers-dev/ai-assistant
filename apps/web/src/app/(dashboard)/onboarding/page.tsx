"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../../convex/_generated/api";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { useImpersonation } from "@/hooks/use-impersonation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Rocket, Mail, Key, MapPin, Settings2, CheckCircle,
  ArrowRight, ArrowLeft, ExternalLink, Loader2,
} from "lucide-react";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia",
  "Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland",
  "Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
  "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming",
];

const VERTICALS = [
  "Plumber","HVAC Contractor","Electrician","Roofing Contractor","Landscaping Company",
  "Painting Contractor","General Contractor","Pest Control","Cleaning Service","Garage Door Company",
  "Gutter Company","Lawn Care Service","Fencing Company","Tree Service","Pool Service",
];

const STEPS = [
  { icon: Rocket, title: "Welcome" },
  { icon: Mail, title: "Email" },
  { icon: Key, title: "APIs" },
  { icon: MapPin, title: "Market" },
  { icon: Settings2, title: "Limits" },
  { icon: CheckCircle, title: "Launch" },
];

export default function OnboardingPage() {
  const { org } = useEffectiveOrg();
  const { orgId: impersonatedOrgId } = useImpersonation();
  const effectiveOrgId = org?._id || (impersonatedOrgId as any) || null;
  const { user } = useUser();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  // Launch resume state: which step we're on (1-4) and the last error if any.
  // If launch fails at step 3, clicking "Retry Launch" resumes from step 3.
  const [launchStep, setLaunchStep] = useState(1);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const completeOnboarding = useMutation(api.organizations.completeOnboarding);
  const setupLeadGenHierarchy = useMutation(api.agentTeams.setupLeadGenHierarchy);
  const reinitializeCities = useMutation(api.cityCampaigns.reinitialize);
  const createTask = useMutation(api.scheduledTaskRunner.createTask);

  const currentUser = useQuery(
    api.users.getCurrent,
    user?.id && org?.clerkOrgId
      ? { clerkUserId: user.id, clerkOrgId: org.clerkOrgId }
      : "skip"
  );
  const orgUsers = useQuery(
    api.users.getByOrganization,
    effectiveOrgId ? { organizationId: effectiveOrgId } : "skip"
  );
  const fallbackUserId = orgUsers?.[0]?._id;

  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailPassword, setGmailPassword] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);

  const [outscraperKey, setOutscraperKey] = useState("");
  const [firecrawlKey, setFirecrawlKey] = useState("");
  const [apolloKey, setApolloKey] = useState("");
  const [hunterKey, setHunterKey] = useState("");
  const [apisSaved, setApisSaved] = useState({ outscraper: false, firecrawl: false, apollo: false, hunter: false });

  const [selectedStates, setSelectedStates] = useState<string[]>(["Illinois"]);
  const [selectedVerticals, setSelectedVerticals] = useState<string[]>(["Plumber", "HVAC Contractor", "Electrician"]);
  const [emailLimit, setEmailLimit] = useState(25);
  const [metaLimit, setMetaLimit] = useState(10);
  const [linkedinLimit, setLinkedinLimit] = useState(10);
  const [dailyLeads, setDailyLeads] = useState(100);

  // Per-provider error messages, shown inline when a save fails.
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  const saveKey = useCallback(
    async (provider: string, apiKey: string): Promise<{ ok: boolean; error?: string }> => {
      if (!effectiveOrgId) return { ok: false, error: "No organization" };
      if (!apiKey.trim()) return { ok: false, error: "API key is empty" };
      try {
        const res = await fetch("/api/provider-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey, organizationId: effectiveOrgId }),
        });
        if (res.ok) return { ok: true };
        // Try to surface the server's error message.
        let msg = `Save failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch { /* non-JSON response */ }
        return { ok: false, error: msg };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? "Network error — please try again" };
      }
    },
    [effectiveOrgId]
  );

  const handleSaveEmail = async () => {
    setSaving(true);
    const result = await saveKey("gmail_smtp_accounts", `${gmailEmail}|${gmailPassword}`);
    setEmailSaved(result.ok);
    setSaveErrors((p) => ({ ...p, gmail_smtp_accounts: result.error ?? "" }));
    setSaving(false);
  };

  const handleSaveApi = async (provider: string, key: string) => {
    setSaving(true);
    const result = await saveKey(provider, key);
    setApisSaved((p) => ({ ...p, [provider]: result.ok }));
    setSaveErrors((p) => ({ ...p, [provider]: result.error ?? "" }));
    setSaving(false);
  };

  if (!effectiveOrgId) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Steps */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <button onClick={() => setStep(i)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-green-500/20 text-green-700" : "bg-muted text-muted-foreground"}`}>
              <s.icon className="h-3 w-3" />{s.title}
            </button>
            {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/30" />}
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center space-y-4 py-8">
            <Rocket className="h-12 w-12 mx-auto text-primary" />
            <h1 className="text-2xl font-bold">Welcome to Lead Generation</h1>
            <p className="text-muted-foreground max-w-md mx-auto">Set up your AI-powered lead gen pipeline in 5 minutes. Connect email, APIs, choose your market, and launch.</p>
            <div className="grid grid-cols-3 gap-3 pt-4 text-xs">
              {[
                { title: "8 AI Agents", desc: "Scrape, enrich, email, social" },
                { title: "Rich Personalization", desc: "Reviews, FB, LinkedIn data" },
                { title: "Multi-Channel", desc: "Email, FB DM, LinkedIn" },
              ].map((f) => (
                <div key={f.title} className="p-3 rounded-lg border border-border">
                  <div className="font-medium">{f.title}</div>
                  <div className="text-muted-foreground">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Email */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Connect Your Email</h2>
            <p className="text-sm text-muted-foreground">Connect a Gmail account with an App Password for sending outreach emails.</p>
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">Get Gmail App Password <ExternalLink className="h-3 w-3" /></a>
            <Input placeholder="your-email@gmail.com" value={gmailEmail} onChange={(e) => setGmailEmail(e.target.value)} />
            <Input type="password" placeholder="Gmail App Password (16 chars)" value={gmailPassword} onChange={(e) => setGmailPassword(e.target.value)} />
            <Button onClick={handleSaveEmail} disabled={!gmailEmail || !gmailPassword || saving || emailSaved}>
              {emailSaved ? <><CheckCircle className="h-4 w-4 mr-1" /> Connected</> : saving ? "Saving..." : "Connect Gmail"}
            </Button>
            {saveErrors.gmail_smtp_accounts && !emailSaved && (
              <p className="text-xs text-red-600" role="alert">{saveErrors.gmail_smtp_accounts}</p>
            )}
          </div>
        )}

        {/* Step 2: APIs */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Connect API Keys</h2>
            <p className="text-sm text-muted-foreground">These services power lead scraping and enrichment.</p>
            {[
              { key: "outscraper", label: "Outscraper (Google Maps)", url: "https://outscraper.com", required: true, value: outscraperKey, set: setOutscraperKey },
              { key: "firecrawl", label: "Firecrawl (Web Scraping)", url: "https://www.firecrawl.dev", required: true, value: firecrawlKey, set: setFirecrawlKey },
              { key: "apollo", label: "Apollo.io (Contact Data)", url: "https://app.apollo.io", required: false, value: apolloKey, set: setApolloKey },
              { key: "hunter", label: "Hunter.io (Email Finder)", url: "https://hunter.io", required: false, value: hunterKey, set: setHunterKey },
            ].map((api) => (
              <div key={api.key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{api.label}</span>
                  {api.required && <Badge variant="outline" className="text-[10px]">Required</Badge>}
                  {apisSaved[api.key as keyof typeof apisSaved] && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="API key" value={api.value} onChange={(e) => api.set(e.target.value)} className="text-xs" />
                  <Button size="sm" onClick={() => handleSaveApi(api.key, api.value)} disabled={!api.value.trim() || saving || apisSaved[api.key as keyof typeof apisSaved]}>
                    {apisSaved[api.key as keyof typeof apisSaved] ? "Saved" : "Save"}
                  </Button>
                </div>
                {saveErrors[api.key] && !apisSaved[api.key as keyof typeof apisSaved] && (
                  <p className="text-[11px] text-red-600" role="alert">{saveErrors[api.key]}</p>
                )}
                <a href={api.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary flex items-center gap-0.5 hover:underline">Get key <ExternalLink className="h-2.5 w-2.5" /></a>
              </div>
            ))}
          </div>
        )}

        {/* Step 3: Market */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Target Market</h2>
            <div>
              <label className="text-sm font-medium">States ({selectedStates.length} selected)</label>
              <div className="flex flex-wrap gap-1.5 mt-1 max-h-40 overflow-y-auto">
                {US_STATES.map((s) => (
                  <button key={s} onClick={() => setSelectedStates((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])}
                    className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${selectedStates.includes(s) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Verticals ({selectedVerticals.length} selected)</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {VERTICALS.map((v) => (
                  <button key={v} onClick={() => setSelectedVerticals((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v])}
                    className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${selectedVerticals.includes(v) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Limits */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Daily Limits</h2>
            {[
              { label: "Leads to scrape/day", value: dailyLeads, set: setDailyLeads, options: [50, 100, 200, 300, 500] },
              { label: "Emails/day", value: emailLimit, set: setEmailLimit, options: [10, 25, 50, 100] },
              { label: "Facebook DMs/day", value: metaLimit, set: setMetaLimit, options: [5, 10, 20] },
              { label: "LinkedIn connections/day", value: linkedinLimit, set: setLinkedinLimit, options: [5, 10, 20] },
            ].map((l) => (
              <div key={l.label}>
                <label className="text-sm font-medium">{l.label}</label>
                <div className="flex gap-2 mt-1">
                  {l.options.map((o) => (
                    <button key={o} onClick={() => l.set(o)}
                      className={`px-3 py-1.5 rounded text-xs border transition-colors ${l.value === o ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 5: Launch */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Ready to Launch!</h2>
            <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
              <div><span className="text-muted-foreground">Email:</span> {emailSaved ? <span className="text-green-700">Connected</span> : <span className="text-red-600">Not connected</span>}</div>
              <div><span className="text-muted-foreground">APIs:</span> {Object.entries(apisSaved).filter(([, v]) => v).map(([k]) => k).join(", ") || "None"}</div>
              <div><span className="text-muted-foreground">States:</span> {selectedStates.join(", ")}</div>
              <div><span className="text-muted-foreground">Verticals:</span> {selectedVerticals.join(", ")}</div>
              <div><span className="text-muted-foreground">Leads/day:</span> {dailyLeads} | <span className="text-muted-foreground">Emails:</span> {emailLimit} | <span className="text-muted-foreground">FB:</span> {metaLimit} | <span className="text-muted-foreground">LI:</span> {linkedinLimit}</div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              Your <span className="text-primary font-medium">14-day Pro trial</span> is active — 2,000 requests included. Create your first campaign now!
            </div>
            {launchError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">
                <p className="font-medium">Launch failed on step {launchStep}: {launchError}</p>
                <p className="mt-1 text-xs text-red-700">
                  Your earlier steps were saved — click "Retry Launch" to resume from step {launchStep}.
                </p>
              </div>
            )}
            <Button size="lg" className="w-full" disabled={launching} onClick={async () => {
              if (!effectiveOrgId) return;
              setLaunching(true);
              setLaunchError(null);
              // Resume from last failed step on retry (each step is idempotent).
              let step = launchStep;
              try {
                // 1. Save onboarding config + mark complete
                if (step <= 1) {
                  setLaunchStep(1);
                  await completeOnboarding({
                    organizationId: effectiveOrgId,
                    onboardingConfig: {
                      states: selectedStates,
                      verticals: selectedVerticals,
                      dailyLeads,
                      emailLimit,
                      metaLimit,
                      linkedinLimit,
                    },
                  });
                  step = 2;
                }

                // 2. Create agent team
                if (step <= 2) {
                  setLaunchStep(2);
                  await setupLeadGenHierarchy({
                    organizationId: effectiveOrgId,
                    modelId: "openai/gpt-4o",
                  });
                  step = 3;
                }

                // 3. Initialize cities for selected states
                if (step <= 3) {
                  setLaunchStep(3);
                  await reinitializeCities({
                    organizationId: effectiveOrgId,
                    states: selectedStates,
                  });
                  step = 4;
                }

                // 4. Create first scheduled task
                if (step <= 4) {
                  setLaunchStep(4);
                  const creatorId = currentUser?._id || fallbackUserId;
                  if (!creatorId) {
                    throw new Error("Unable to resolve a user for scheduled task creation.");
                  }
                  await createTask({
                    organizationId: effectiveOrgId,
                    createdBy: creatorId,
                    name: "Lead Gen Campaign",
                    prompt: `You are the Lead Generation Agent. Execute the campaign for ${selectedVerticals.join(", ")} in ${selectedStates.join(", ")}.`,
                    agentConfig: { agentType: "lead_gen_agent" },
                    schedule: { type: "cron", cronExpression: "every_1h" },
                    campaignConfig: {
                      dailyResults: dailyLeads,
                      verticals: selectedVerticals,
                      states: selectedStates,
                      dataFields: ["name", "phone", "reviews", "ownerName", "email", "website", "linkedin", "metaPage"],
                      outreachChannels: ["email"],
                      channelConfig: {
                        email: { enabled: true, dailyLimit: emailLimit, selectedAccounts: [] },
                      },
                    },
                  });
                }

                // 5. Redirect to scheduled tasks
                router.push("/scheduled");
              } catch (err: any) {
                setLaunchError(err?.message ?? "Unknown error");
                setLaunching(false);
              }
            }}>
              {launching ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating your campaign...</>
              ) : launchError ? (
                <><Rocket className="h-4 w-4 mr-2" /> Retry Launch</>
              ) : (
                <><Rocket className="h-4 w-4 mr-2" /> Launch Campaign</>
              )}
            </Button>
          </div>
        )}

        {/* Nav */}
        <div className="flex justify-between pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ArrowLeft className="h-3 w-3 mr-1" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep(step + 1)}>Next <ArrowRight className="h-3 w-3 ml-1" /></Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
