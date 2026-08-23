"use client";

import { useState } from "react";
import Link from "next/link";
import { Reply as ReplyIcon, Pencil, Trash2, Send } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/tickets/rich-text-editor";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";
import { timeAgo } from "@/lib/utils";

type CommentRow = {
  id: string; body: string; authorId: string; parentId: string | null;
  editedAt: string | null; createdAt: string;
  author: { id: string; firstName: string; lastName: string; avatarUrl: string | null; jobTitle?: string | null };
  attachments: unknown[];
};

export default function CommentSection({
  ticketKey,
  comments,
  canComment,
  me,
  onChange,
}: {
  ticketKey: string;
  comments: CommentRow[];
  canComment: boolean;
  me: { id: string };
  onChange: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  const submit = async () => {
    if (!stripTags(draft).trim()) return;
    setSending(true);
    try {
      await api(`/api/tickets/${ticketKey}/comments`, { method: "POST", json: { body: draft } });
      setDraft("");
      await onChange();
      window.dispatchEvent(new CustomEvent("strike:tickets-updated"));
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Could not post comment", variant: "error" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {canComment && (
        <div>
          <RichTextEditor value={draft} onChange={setDraft} placeholder="Add a comment... type @ to mention someone" minHeight={90} />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">Mentioned users get an immediate notification.</p>
            <Button size="sm" onClick={() => void submit()} loading={sending}>
              <Send className="h-3.5 w-3.5" /> Comment
            </Button>
          </div>
        </div>
      )}

      {roots.length === 0 && canComment === false && (
        <p className="py-6 text-center text-xs text-muted-foreground">No comments yet.</p>
      )}
      {roots.length === 0 && canComment && draft === "" && null}

      <ul className="space-y-5">
        {roots.map((c) => (
          <li key={c.id} className="flex gap-3">
            <Link href={`/users/${c.author.id}`}><Avatar user={c.author} size="md" /></Link>
            <div className="min-w-0 flex-1">
              <CommentBubble
                comment={c}
                ticketKey={ticketKey}
                mine={c.author.id === me.id}
                onChange={onChange}
              />
              {repliesOf(c.id).length > 0 && (
                <ul className="mt-2 space-y-2 border-l-2 pl-3">
                  {repliesOf(c.id).map((r) => (
                    <li key={r.id}>
                      <CommentBubble comment={r} ticketKey={ticketKey} mine={r.author.id === me.id} onChange={onChange} compact />
                    </li>
                  ))}
                </ul>
              )}
              {canComment && !c.parentId && <ReplyBox ticketKey={ticketKey} parentId={c.id} onChange={onChange} />}
            </div>
          </li>
        ))}
      </ul>

      {roots.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Be the first to comment.</p> : null}
    </div>
  );
}

function CommentBubble({
  comment, ticketKey, mine, onChange, compact,
}: {
  comment: CommentRow; ticketKey: string; mine: boolean; onChange: () => Promise<void>; compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api(`/api/comments/${comment.id}`, { method: "PATCH", json: { body: draft } });
      setEditing(false);
      await onChange();
      toast({ title: "Comment updated", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Update failed", variant: "error" });
    } finally { setBusy(false); }
  };

  const del = async () => {
    setBusy(true);
    try {
      await api(`/api/comments/${comment.id}`, { method: "DELETE" });
      await onChange();
      toast({ title: "Comment deleted" });
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : "Delete failed", variant: "error" });
    } finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="space-y-1.5">
        <RichTextEditor value={draft} onChange={setDraft} minHeight={70} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(comment.body); }}>Cancel</Button>
          <Button size="sm" loading={busy} onClick={() => void saveEdit()}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={"rounded-xl border px-3.5 py-2.5 " + (compact ? "bg-muted/40" : "bg-background")}>
        <div className="mb-1 flex items-center gap-2">
          {compact && <Avatar user={comment.author} size="xs" />}
          <span className="text-xs font-semibold">{comment.author.firstName} {comment.author.lastName}</span>
          <span className="text-[10px] text-muted-foreground" title={comment.createdAt}>
            {timeAgo(comment.createdAt)}{comment.editedAt ? " · edited" : ""}
          </span>
          {mine && (
            <span className="ml-auto flex gap-0.5">
              <button onClick={() => setEditing(true)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Edit comment"><Pencil className="h-3 w-3" /></button>
              <button onClick={() => setConfirmDel(true)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete comment"><Trash2 className="h-3 w-3" /></button>
            </span>
          )}
        </div>
        <div className="rte-content text-sm" dangerouslySetInnerHTML={{ __html: comment.body }} />
      </div>
      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => void del()}
        title="Delete this comment?"
        message="The comment will be removed but the action stays in the audit history."
        confirmLabel="Delete"
        danger
      />
    </>
  );
}

function ReplyBox({ ticketKey, parentId, onChange }: { ticketKey: string; parentId: string; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 pt-0.5 text-[11px] font-medium text-muted-foreground hover:text-primary">
        <ReplyIcon className="h-3 w-3" /> Reply
      </button>
    );
  }
  return (
    <div className="mt-1.5 space-y-1.5">
      <RichTextEditor value={draft} onChange={setDraft} placeholder="Write a reply..." minHeight={60} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" loading={busy} disabled={!stripTags(draft).trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/tickets/${ticketKey}/comments`, { method: "POST", json: { body: draft, parentId } });
              setOpen(false); setDraft("");
              await onChange();
            } catch (e) {
              toast({ title: e instanceof ApiError ? e.message : "Failed", variant: "error" });
            } finally { setBusy(false); }
          }}>
          Reply
        </Button>
      </div>
    </div>
  );
}

function stripTags(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent?.trim() ?? "";
}
