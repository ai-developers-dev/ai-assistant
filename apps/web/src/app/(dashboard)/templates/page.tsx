"use client";

import { Badge } from "@/components/ui/badge";
import { LayoutTemplate } from "lucide-react";

export default function TemplatesPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-muted-foreground mt-1">
          Quick-start your projects with pre-built agent templates.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border">
        <LayoutTemplate className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="font-semibold mb-1">Templates coming soon</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          We&apos;re building a library of agent templates to help you get
          started faster. Stay tuned!
        </p>
      </div>
    </div>
  );
}
