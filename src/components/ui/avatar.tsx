import { cn, colorFor, initials } from "@/lib/utils";

const sizes = { xs: "h-5 w-5 text-[9px]", sm: "h-6 w-6 text-[10px]", md: "h-7 w-7 text-[11px]", lg: "h-9 w-9 text-sm" };

export function Avatar({
  user,
  size = "md",
  ring = false,
}: {
  user?: { firstName: string; lastName: string; avatarUrl?: string | null; id?: string } | null;
  size?: keyof typeof sizes;
  ring?: boolean;
}) {
  const name = user ? `${user.firstName} ${user.lastName}` : "Unassigned";
  const color = colorFor(user?.id ?? name);
  if (!user) {
    return (
      <span title="Unassigned" className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground", sizes[size])}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3"><circle cx="8" cy="5.5" r="2.4" /><path d="M3.3 13a4.8 4.8 0 0 1 9.4 0" /></svg>
      </span>
    );
  }
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt={name} title={name} className={cn("shrink-0 rounded-full object-cover", sizes[size], ring && "ring-2 ring-card")} />;
  }
  return (
    <span
      title={name}
      style={{ backgroundColor: `${color}22`, color }}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", sizes[size], ring && "ring-2 ring-card")}
    >
      {initials(user.firstName, user.lastName)}
    </span>
  );
}

export function AvatarStack({ users, max = 4 }: { users: ({ firstName: string; lastName: string; avatarUrl?: string | null; id?: string })[]; max?: number }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex -space-x-1.5">
      {shown.map((u, i) => (
        <Avatar key={`${u.id}-${i}`} user={u} size="sm" ring />
      ))}
      {rest > 0 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">+{rest}</span>
      )}
    </span>
  );
}
