"use client";

import { Avatar } from "@/components/ui/avatar";
import { fmtDateTime, timeAgo } from "@/lib/utils";

type HistoryRow = {
  id: string; field: string; oldValue: string | null; newValue: string | null;
  message: string | null; createdAt: string;
  user?: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
};

const FIELD_VERBS: Record<string, string> = {
  created: "created the ticket",
  assignee: "changed assignee",
  status: "changed status",
  priority: "changed priority",
  "due date": "changed due date",
  "start date": "changed start date",
  title: "changed title",
  description: "updated description",
  type: "changed type",
  sprint: "changed sprint",
  labels: "changed labels",
  comment: "",
  attachment: "added an attachment",
  deleted: "archived the ticket",
  "story points": "changed story points",
  sla: "SLA state",
};

function describe(h: HistoryRow): React.ReactNode {
  const verb = FIELD_VERBS[h.field] ?? `updated ${h.field}`;
  switch (h.field) {
    case "assignee":
    case "status":
    case "priority":
    case "sprint":
      return (
        <>
          {verb}{h.oldValue && <> from <b>{h.oldValue}</b></>} to <b>{h.newValue ?? "-"}</b>
        </>
      );
    case "comment":
      return h.newValue === null
        ? <>deleted a comment{h.oldValue ? ` ("${truncate(h.oldValue)}")` : ""}</>
        : <>commented: &ldquo;{truncate(h.newValue ?? "")}&rdquo;</>;
    default:
      return (
        <>
          {verb}
          {h.message ? <> - {h.message}</> : h.newValue ? <> to <b>{truncate(h.newValue)}</b></> : null}
        </>
      );
  }
}

function truncate(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n).trimEnd() + "..." : s;
}

export default function ActivityTimeline({ history }: { history: HistoryRow[] }) {
  if (!history.length) return <p className="py-8 text-center text-xs text-muted-foreground">No activity recorded yet.</p>;

  // group by day
  const groups: { day: string; rows: HistoryRow[] }[] = [];
  for (const h of history) {
    const day = new Date(h.createdAt).toDateString();
    const g = groups.find((x) => x.day === day);
    if (g) g.rows.push(h); else groups.push({ day, rows: [h] });
  }

  return (
    <div className="max-h-[520px] space-y-5 overflow-y-auto p-4">
      {groups.map((g) => (
        <div key={g.day}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.day}</p>
          <ol className="relative space-y-3.5 border-l pl-5">
            {g.rows.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[26px] top-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-card bg-primary/70" />
                <div className="flex items-start gap-2">
                  {h.user && <Avatar user={h.user} size="xs" />}
                  <p className="text-xs leading-relaxed">
                    <b>{h.user ? `${h.user.firstName} ${h.user.lastName}` : "System"}</b> {describe(h)}
                    <span className="ml-1.5 whitespace-nowrap text-[10px] text-muted-foreground" title={fmtDateTime(h.createdAt)}>{timeAgo(h.createdAt)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
