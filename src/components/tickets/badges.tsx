import { cn } from "@/lib/utils";
import {
  CheckSquare, Bug, BookOpen, ArrowUpRight, Sparkles, LifeBuoy, Inbox, Milestone, GitBranch, Circle, Flag, CheckCircle2, Clock,
} from "lucide-react";

export type SlaInfo = { status: "breached" | "at_risk" | "on_track" | "met" | "none"; hoursOverdue: number | null; hoursLeft: number | null };

function fmtHours(h: number): string {
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`;
}

/** SLA state badge: breached (red), at risk (amber), met (green). Hidden for on_track/none. */
export function SlaBadge({ sla, size = "md" }: { sla?: SlaInfo | null; size?: "sm" | "md" }) {
  if (!sla || sla.status === "none" || sla.status === "on_track") return null;
  if (sla.status === "breached") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 font-semibold text-destructive",
          size === "sm" ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]"
        )}
        title={`SLA breached - due date passed${sla.hoursOverdue != null ? ` (${fmtHours(sla.hoursOverdue)} ago)` : ""}`}
      >
        <Flag className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
        SLA BREACHED{sla.hoursOverdue != null && size === "md" ? ` · ${fmtHours(sla.hoursOverdue)} late` : ""}
      </span>
    );
  }
  if (sla.status === "at_risk") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 font-medium text-warning",
          size === "sm" ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]"
        )}
        title="Due within 24 hours"
      >
        <Clock className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
        AT RISK{sla.hoursLeft != null && size === "md" ? ` · ${fmtHours(sla.hoursLeft)} left` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success" title="Completed within the due date">
      <CheckCircle2 className="h-3 w-3" /> Met
    </span>
  );
}

const TYPE_ICONS: Record<string, { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }> = {
  Task: { icon: CheckSquare, color: "#2563eb" },
  Bug: { icon: Bug, color: "#dc2626" },
  Story: { icon: BookOpen, color: "#059669" },
  Improvement: { icon: ArrowUpRight, color: "#7c3aed" },
  Feature: { icon: Sparkles, color: "#c026d3" },
  Support: { icon: LifeBuoy, color: "#0891b2" },
  Request: { icon: Inbox, color: "#64748b" },
  Epic: { icon: Milestone, color: "#4f46e5" },
  "Sub-task": { icon: GitBranch, color: "#64748b" },
};

export function TypeIcon({ name, size = "md", withLabel }: { name: string; size?: "sm" | "md"; withLabel?: boolean }) {
  const t = TYPE_ICONS[name] ?? { icon: Circle, color: "#64748b" };
  const Icon = t.icon;
  return (
    <span className="inline-flex items-center gap-1.5" title={name}>
      <Icon className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} style={{ color: t.color }} />
      {withLabel && <span className="text-xs font-medium">{name}</span>}
    </span>
  );
}

export function StatusBadge({ name, color, size = "md" }: { name: string; color: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      )}
      style={{ borderColor: `${color}55`, backgroundColor: `${color}18`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

export function PriorityBadge({ name, color, compact }: { name: string; color: string; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={`Priority: ${name}`}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill={color} aria-hidden>
        <rect x="7.2" y="8.5" width="1.6" height="6" rx="0.8" />
        <rect x="4.8" y="5.5" width="1.6" height="9" rx="0.8" opacity="0.75" />
        <rect x="2.4" y="2.5" width="1.6" height="12" rx="0.8" opacity="0.45" />
        {!compact && <path d="M10.5 11.5 14 8l-3.5-3.5v7z" opacity="0.85" />}
      </svg>
      {!compact && <span>{name}</span>}
    </span>
  );
}

export function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `${color}1c`, color }}
    >
      {name}
    </span>
  );
}

export function DueBadge({ text, tone }: { text: string; tone: "overdue" | "today" | "soon" | "normal" | "none" }) {
  if (tone === "none") return <span className="text-xs text-muted-foreground">-</span>;
  const cls =
    tone === "overdue" ? "bg-destructive/10 text-destructive"
    : tone === "today" ? "bg-warning/10 text-warning"
    : tone === "soon" ? "bg-primary/10 text-primary"
    : "text-muted-foreground";
  return <span className={cn("text-xs", tone !== "normal" && cn("rounded-md px-1.5 py-0.5 font-medium", cls))}>{tone === "overdue" || tone === "today" || tone === "soon" ? text : text.replace(/^Due /, "")}</span>;
}
