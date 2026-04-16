"use client";

import type { Doc } from "../../../convex/_generated/dataModel";
import { MainAgentCard } from "./main-agent-card";
import { SubAgentCard } from "./sub-agent-card";
import { useEffect, useState, useRef, useCallback } from "react";

interface AgentMeta {
  credentialStatus?: "connected" | "missing";
  taskSummary?: string;
}

interface SwarmVisualizationProps {
  team: Doc<"agentTeams">;
  subAgents: Doc<"teamAgents">[];
  onAgentClick?: (agent: Doc<"teamAgents">) => void;
  onMainClick?: () => void;
  /** Per-agent metadata keyed by agent name */
  agentMeta?: Record<string, AgentMeta>;
}

export function SwarmVisualization({
  team,
  subAgents,
  onAgentClick,
  agentMeta,
}: SwarmVisualizationProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [arrows, setArrows] = useState<
    { x1: number; y1: number; x2: number; y2: number }[]
  >([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mainCardRef = useRef<HTMLDivElement>(null);
  const subCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 480);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const visibleAgents = subAgents.filter((a) => !a.isHidden && a.specialty !== "prompt_engineer");
  const enabledAgents = visibleAgents.filter((a) => a.isEnabled);
  const disabledAgents = visibleAgents.filter((a) => !a.isEnabled);
  const agentCount = enabledAgents.length;

  const enabledIds = enabledAgents.map((a) => a._id).join(",");

  const measureArrows = useCallback(() => {
    if (!containerRef.current || !mainCardRef.current || agentCount === 0)
      return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const mainRect = mainCardRef.current.getBoundingClientRect();

    const x1 = mainRect.left + mainRect.width / 2 - containerRect.left;
    const y1 = mainRect.bottom - containerRect.top;

    const newArrows: { x1: number; y1: number; x2: number; y2: number }[] = [];

    subCardRefs.current.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const x2 = rect.left + rect.width / 2 - containerRect.left;
      const y2 = rect.top - containerRect.top;
      newArrows.push({ x1, y1, x2, y2 });
    });

    setArrows(newArrows);
  }, [enabledIds, agentCount]);

  useEffect(() => {
    measureArrows();
    window.addEventListener("resize", measureArrows);
    return () => window.removeEventListener("resize", measureArrows);
  }, [measureArrows]);

  // Re-measure after paint
  useEffect(() => {
    const timer = setTimeout(measureArrows, 100);
    return () => clearTimeout(timer);
  }, [measureArrows]);

  if (agentCount === 0 && disabledAgents.length === 0) return null;

  if (isMobile) {
    return (
      <div className="space-y-3">
        <MainAgentCard team={team} />
        {enabledAgents.map((agent) => (
          <SubAgentCard
            key={agent._id}
            agent={agent}
            onClick={() => onAgentClick?.(agent)}
            credentialStatus={agentMeta?.[agent.name]?.credentialStatus}
            taskSummary={agentMeta?.[agent.name]?.taskSummary}
          />
        ))}
        {disabledAgents.map((agent) => (
          <SubAgentCard
            key={agent._id}
            agent={agent}
            onClick={() => onAgentClick?.(agent)}
            credentialStatus={agentMeta?.[agent.name]?.credentialStatus}
            taskSummary={agentMeta?.[agent.name]?.taskSummary}
          />
        ))}
      </div>
    );
  }

  // Pick a Tailwind grid class that caps columns at the actual agent count
  const colClass = (count: number) => {
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count === 3) return "grid-cols-2 lg:grid-cols-3";
    return "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  };

  return (
    <div ref={containerRef} className="relative w-full py-4 overflow-x-hidden">
      {/* SVG arrows */}
      {arrows.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 0 }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon
                points="0 0, 8 3, 0 6"
                className="fill-muted-foreground/30"
              />
            </marker>
          </defs>
          {arrows.map((a, i) => (
            <line
              key={i}
              x1={a.x1}
              y1={a.y1}
              x2={a.x2}
              y2={a.y2}
              className="stroke-muted-foreground/20"
              strokeWidth={1.5}
              markerEnd="url(#arrowhead)"
            />
          ))}
        </svg>
      )}

      {/* Main agent card - centered */}
      <div className="flex justify-center mb-8" ref={mainCardRef}>
        <div className="w-full max-w-lg">
          <MainAgentCard team={team} />
        </div>
      </div>

      {/* Sub-agent grid — responsive columns */}
      <div className={`grid gap-3 relative ${colClass(agentCount)}`} style={{ zIndex: 1 }}>
        {enabledAgents.map((agent) => (
          <div
            key={agent._id}
            ref={(el) => {
              if (el) subCardRefs.current.set(agent._id, el);
              else subCardRefs.current.delete(agent._id);
            }}
          >
            <SubAgentCard
              agent={agent}
              onClick={() => onAgentClick?.(agent)}
              credentialStatus={agentMeta?.[agent.name]?.credentialStatus}
              taskSummary={agentMeta?.[agent.name]?.taskSummary}
            />
          </div>
        ))}
      </div>

      {/* Disabled agents */}
      {disabledAgents.length > 0 && (
        <div className={`grid gap-3 mt-3 ${colClass(disabledAgents.length)}`}>
          {disabledAgents.map((agent) => (
            <SubAgentCard
              key={agent._id}
              agent={agent}
              onClick={() => onAgentClick?.(agent)}
              credentialStatus={agentMeta?.[agent.name]?.credentialStatus}
              taskSummary={agentMeta?.[agent.name]?.taskSummary}
            />
          ))}
        </div>
      )}
    </div>
  );
}
