"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  padding?: "sm" | "md" | "lg";
}

export function GlassCard({
  children,
  className,
  hover = true,
  glow = false,
  padding = "md",
  ...props
}: GlassCardProps) {
  const paddings = {
    sm: "p-4",
    md: "p-6",
    lg: "p-8 md:p-12",
  };

  return (
    <motion.div
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
      {...props}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/50 bg-background/45 backdrop-blur-2xl",
        "transition-all duration-300",
        hover && "hover:border-border/60 hover:shadow-lg hover:shadow-black/5",
        glow && "shadow-[0_0_40px_rgba(124,58,237,0.06)]",
        paddings[padding],
        className,
      )}
    >
      {/* Glass gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.03] via-transparent to-transparent pointer-events-none" />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

export function GlassSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/40">
        {title}
      </p>
      {children}
    </div>
  );
}

export function GlassStat({
  label,
  value,
  icon,
  color = "text-foreground",
  subtitle,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="rounded-2xl border border-border/40 bg-background/60 p-4 backdrop-blur transition-all hover:border-border/60 hover:shadow-md"
    >
      <div className="flex items-center gap-2 text-xs text-foreground/40 uppercase tracking-[0.2em]">
        {icon}
        {label}
      </div>
      <div className={cn("text-2xl font-semibold mt-1.5 tracking-tight", color)}>
        {value}
      </div>
      {subtitle && (
        <div className="text-[11px] text-foreground/40 mt-0.5">{subtitle}</div>
      )}
    </motion.div>
  );
}

export function GlassInnerCard({
  children,
  className,
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <motion.div
      whileHover={hover ? { y: -2 } : undefined}
      className={cn(
        "rounded-2xl border border-border/40 bg-background/60 p-5 backdrop-blur",
        "transition-all hover:border-border/60",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function GlassTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border/40 bg-background/60 backdrop-blur overflow-hidden", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  badge,
  title,
  subtitle,
  actions,
}: {
  badge?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-2"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          {badge && (
            <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/55 px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] text-foreground/60 backdrop-blur">
              {badge}
            </span>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-foreground/60 leading-relaxed max-w-xl">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </motion.div>
  );
}
