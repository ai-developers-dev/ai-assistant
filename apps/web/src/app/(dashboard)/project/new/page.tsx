"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { api } from "../../../../../convex/_generated/api";
import { AgentCategoryCard } from "@/components/dashboard/agent-category-card";
import { AGENT_CATEGORIES, type AgentType } from "@/lib/agents/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function NewProjectPage() {
  const router = useRouter();
  const { org, effectiveClerkOrgId, isImpersonating } = useEffectiveOrg();
  const { user } = useUser();
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null);
  const [projectName, setProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const currentUser = useQuery(
    api.users.getCurrent,
    user?.id && effectiveClerkOrgId
      ? { clerkUserId: user.id, clerkOrgId: effectiveClerkOrgId }
      : "skip"
  );

  const createProject = useMutation(api.projects.create);

  const handleCreate = async () => {
    if (!org?._id || (!currentUser?._id && !isImpersonating) || !selectedAgent) return;

    setIsCreating(true);
    try {
      const name =
        projectName.trim() ||
        `${selectedAgent.charAt(0).toUpperCase() + selectedAgent.slice(1)} Project`;

      const projectId = await createProject({
        organizationId: org._id,
        createdBy: currentUser!._id,
        name,
        agentType: selectedAgent,
      });
      router.push(`/project/${projectId}`);
    } catch (error: any) {
      console.error("Failed to create project:", error);
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/home">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">New Project</h1>
          <p className="text-sm text-muted-foreground">
            Choose an agent type and give your project a name
          </p>
        </div>
      </div>

      {/* Project Name */}
      <div>
        <label className="text-sm font-medium mb-2 block">
          Project Name{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="My awesome project..."
          className="max-w-md"
        />
      </div>

      {/* Agent Selection */}
      <div>
        <label className="text-sm font-medium mb-3 block">
          Select Agent Type
        </label>
        <div className="grid grid-cols-3 gap-3">
          {AGENT_CATEGORIES.map((agent) => (
            <div
              key={agent.type}
              className={
                selectedAgent === agent.type
                  ? "rounded-xl ring-2 ring-primary"
                  : ""
              }
            >
              <AgentCategoryCard
                agent={agent}
                onClick={() => setSelectedAgent(agent.type)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Create Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleCreate}
          disabled={!selectedAgent || isCreating}
          size="lg"
          className="gap-2"
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Project"
          )}
        </Button>
      </div>
    </div>
  );
}
