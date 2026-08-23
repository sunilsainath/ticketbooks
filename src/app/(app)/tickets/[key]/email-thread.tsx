"use client";

import { Mail, MailOpen } from "lucide-react";
import { useState } from "react";
import { cn, fmtDateTime } from "@/lib/utils";
import type { EmailRow } from "./page";

export default function EmailThread({ emails }: { emails: EmailRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!emails.length) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        No email communication on this ticket yet.
      </p>
    );
  }
  return (
    <ul className="divide-y p-2">
      {emails.map((e) => {
        const inbound = e.direction === "INBOUND";
        const open = openId === e.id;
        return (
          <li key={e.id}>
            <button onClick={() => setOpenId(open ? null : e.id)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/60">
              {inbound ? <Mail className="h-4 w-4 shrink-0 text-success" /> : <MailOpen className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{e.subject}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {inbound ? `From ${e.sender}` : `To ${e.recipients}`} · {fmtDateTime(e.createdAt)}
                  {!inbound && e.status !== "SENT" ? ` · ${e.status.toLowerCase()}` : ""}
                </span>
              </span>
            </button>
            {open && (
              <div className={cn("mx-3 mb-3 rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed")}>
                <div className="rte-content" dangerouslySetInnerHTML={{ __html: e.body ?? "(no content)" }} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
