"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Image,
  FileText,
  Presentation,
  MessageCircle,
  Table,
  Globe,
  Video,
  Wrench,
  ArrowRight,
  Check,
  Cpu,
  Brain,
  Zap,
  Shield,
  RefreshCw,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";

const AGENT_TYPES = [
  { name: "General", icon: Sparkles, color: "text-violet-400", bg: "bg-violet-400/10", desc: "General-purpose AI for any task" },
  { name: "Images", icon: Image, color: "text-pink-400", bg: "bg-pink-400/10", desc: "Create and edit visual content" },
  { name: "Documents", icon: FileText, color: "text-blue-700", bg: "bg-blue-400/10", desc: "Draft and analyze documents" },
  { name: "Slides", icon: Presentation, color: "text-orange-700", bg: "bg-orange-400/10", desc: "Build compelling presentations" },
  { name: "Chat", icon: MessageCircle, color: "text-green-700", bg: "bg-green-400/10", desc: "Conversational AI companion" },
  { name: "Sheets", icon: Table, color: "text-emerald-700", bg: "bg-emerald-400/10", desc: "Data analysis and insights" },
  { name: "Websites", icon: Globe, color: "text-cyan-400", bg: "bg-cyan-400/10", desc: "Web content and code generation" },
  { name: "Videos", icon: Video, color: "text-red-600", bg: "bg-red-400/10", desc: "Video scripts and planning" },
  { name: "Tools", icon: Wrench, color: "text-amber-700", bg: "bg-amber-400/10", desc: "Custom automation workflows" },
];

const FEATURES = [
  {
    icon: Cpu,
    title: "Multi-Model Intelligence",
    desc: "Switch between Claude, GPT-4o, and Gemini in one click. Use the best model for each task, or bring your own API keys.",
  },
  {
    icon: Zap,
    title: "Real-Time Streaming",
    desc: "Watch your agents think and work in real-time with live streaming responses, tool execution visualization, and step-by-step reasoning.",
  },
  {
    icon: Brain,
    title: "Memory That Learns",
    desc: "Agents remember context across conversations with built-in RAG memory. The more you use them, the better they get.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    desc: "SOC2-ready architecture with team management, role-based access, SSO support, and encrypted API key storage.",
  },
  {
    icon: RefreshCw,
    title: "Automated Workflows",
    desc: "Schedule agents to run on autopilot. Daily reports, weekly summaries, and custom cron jobs with one-click setup.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    desc: "Share projects, manage permissions, and collaborate with your team in real-time on shared agent workspaces.",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Get started with AI agents",
    features: [
      "500 daily credits",
      "3 projects",
      "Mini/Flash models",
      "Basic tools",
      "100MB storage",
    ],
    cta: "Start Free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    desc: "For power users and creators",
    features: [
      "10,000 daily credits",
      "Unlimited projects",
      "All models (Claude, GPT, Gemini)",
      "All tools + Pro Mode",
      "5GB storage",
      "5 scheduled tasks",
      "API access",
    ],
    cta: "Start Pro Trial",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$49",
    period: "/month",
    desc: "For teams building together",
    features: [
      "50,000 daily credits",
      "Unlimited projects",
      "All models + custom",
      "All tools + custom",
      "25GB storage",
      "Up to 10 members",
      "Unlimited scheduled tasks",
      "Priority support",
    ],
    cta: "Start Team Trial",
    highlighted: false,
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

export default function LandingPage() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 text-center">
          <motion.div {...fadeUp}>
            <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1">
              <Sparkles className="h-3 w-3" />
              Now in Public Beta
            </Badge>
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight">
              Your AI Workforce,
              <br />
              <span className="gradient-text">Ready to Deploy</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              9 specialized AI agents for every task. Multi-model support, real-time
              streaming, and team collaboration. Ship faster with AI that works for you.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link href="/sign-up">
                <Button size="lg" className="gap-2 glow">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="#features">
                <Button size="lg" variant="outline">
                  See How It Works
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Dashboard Mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-16 rounded-2xl border border-border bg-card/50 p-2 shadow-2xl shadow-primary/5 max-w-5xl mx-auto"
          >
            <div className="rounded-xl bg-background border border-border overflow-hidden">
              {/* Fake browser bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/60" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
                  <div className="h-3 w-3 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 mx-8">
                  <div className="h-6 rounded-md bg-muted max-w-xs mx-auto" />
                </div>
              </div>
              {/* Fake dashboard */}
              <div className="flex h-80">
                <div className="w-56 border-r border-border p-3 space-y-2 hidden sm:block">
                  <div className="h-8 rounded-md bg-primary/20 mb-4" />
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-7 rounded-md bg-muted/50" />
                  ))}
                </div>
                <div className="flex-1 p-4 space-y-3">
                  <div className="h-8 rounded-md bg-muted/30 w-1/3" />
                  <div className="grid grid-cols-3 gap-3 mt-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className="h-24 rounded-lg border border-border bg-muted/20"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="border-y border-border/40 bg-muted/10 py-8">
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-center text-sm text-muted-foreground mb-6">
            Powered by the world&apos;s leading AI models
          </p>
          <div className="flex items-center justify-center gap-12">
            {["Anthropic", "OpenAI", "Google AI"].map((name) => (
              <span
                key={name}
                className="text-lg font-semibold text-muted-foreground/60"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Agent Categories Grid ── */}
      <section id="agents" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">
              9 Specialized Agents for Every Task
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Each agent is purpose-built with specialized tools and
              instructions. Pick the right agent and get expert-level results.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto">
            {AGENT_TYPES.map((agent, i) => (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center hover:border-primary/50 transition-colors"
              >
                <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", agent.bg)}>
                  <agent.icon className={cn("h-6 w-6", agent.color)} />
                </div>
                <h3 className="font-semibold">{agent.name}</h3>
                <p className="text-xs text-muted-foreground">{agent.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 bg-muted/5">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold">
              Everything You Need to Ship with AI
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              A complete platform for building, deploying, and managing AI agent
              workflows.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold">How It Works</h2>
            <p className="mt-4 text-muted-foreground">
              Three simple steps to deploy your AI workforce.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: "1",
                title: "Describe Your Task",
                desc: "Choose an agent type and describe what you need. Upload files, set context, and configure tools.",
              },
              {
                step: "2",
                title: "Agent Works",
                desc: "Your agent searches, analyzes, creates, and iterates. Watch it work in real-time with full transparency.",
              },
              {
                step: "3",
                title: "Review & Deploy",
                desc: "Review the results, iterate as needed, and deploy. Save as templates for your team to reuse.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.15 }}
                className="text-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-lg mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 bg-muted/5">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold">Simple, Transparent Pricing</h2>
            <p className="mt-4 text-muted-foreground">
              Start free. Upgrade when you&apos;re ready.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "rounded-xl border p-6 flex flex-col",
                  plan.highlighted
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/10 relative"
                    : "border-border bg-card"
                )}
              >
                {plan.highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Most Popular
                  </Badge>
                )}
                <div className="mb-6">
                  <h3 className="font-semibold text-lg">{plan.name}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">
                      {plan.period}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {plan.desc}
                  </p>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up">
                  <Button
                    className="w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">
            Start building with AI agents today
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
            Join thousands of creators and teams using AI agents to ship faster
            and build better.
          </p>
          <div className="mt-8">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2 glow">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
