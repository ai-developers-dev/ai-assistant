"use client";

import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";

export default function ShowcasePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Showcase</h1>
        <p className="text-muted-foreground mt-1">
          Discover what the community is building with AI agents.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border">
        <Trophy className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="font-semibold mb-1">Showcase coming soon</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Share your best agent creations with the community. Browse, like, and
          get inspired by others.
        </p>
      </div>
    </div>
  );
}
