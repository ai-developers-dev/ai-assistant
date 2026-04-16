"use client";

import { MODELS, getModelsForPlan, type ModelConfig } from "@/lib/agents/models";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Cpu, Lock } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  plan?: string;
  hasByok?: boolean;
}

const TIER_COLORS: Record<string, string> = {
  free: "text-zinc-400",
  starter: "text-blue-700",
  pro: "text-violet-400",
  byok: "text-amber-700",
};

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  byok: "BYOK",
};

export function ModelSelector({ value, onChange, plan = "free", hasByok = false }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = MODELS.find((m) => m.id === value);

  const availableModels = getModelsForPlan(plan);
  const availableIds = new Set(availableModels.map((m) => m.id));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isAvailable = (model: ModelConfig) => {
    if (hasByok) return true; // BYOK users can use all models
    return availableIds.has(model.id);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
      >
        <Cpu className={cn("h-3.5 w-3.5", TIER_COLORS[selected?.tier || "free"])} />
        <span className="font-medium">{selected?.name || "Select model"}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 rounded-lg border border-border bg-card shadow-lg z-50">
          <div className="p-1">
            {MODELS.map((model) => {
              const available = isAvailable(model);
              return (
                <button
                  key={model.id}
                  onClick={() => {
                    if (!available) return;
                    onChange(model.id);
                    setOpen(false);
                  }}
                  disabled={!available}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    !available
                      ? "opacity-40 cursor-not-allowed"
                      : model.id === value
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted"
                  )}
                >
                  <Cpu className={cn("h-4 w-4 shrink-0", TIER_COLORS[model.tier])} />
                  <div className="flex-1 text-left">
                    <p className="font-medium">{model.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {model.contextWindow >= 1_000_000
                        ? `${(model.contextWindow / 1_000_000).toFixed(0)}M`
                        : `${(model.contextWindow / 1000).toFixed(0)}K`}{" "}
                      context
                    </p>
                  </div>
                  {!available ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 text-muted-foreground gap-1">
                      <Lock className="h-2.5 w-2.5" />
                      {TIER_LABELS[model.tier]}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] px-1.5", TIER_COLORS[model.tier])}
                    >
                      {TIER_LABELS[model.tier]}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
