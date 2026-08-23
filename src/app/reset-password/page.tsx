"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { api, ApiError } from "@/lib/client";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords do not match");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/reset-password", { method: "POST", json: { token, newPassword: password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <>
        <h1 className="text-xl font-bold tracking-tight">Invalid reset link</h1>
        <p className="mt-2 text-sm text-muted-foreground">This link is missing its token. Request a new one.</p>
        <Link href="/forgot-password" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">Request new link</Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="text-xl font-bold tracking-tight">Password updated</h1>
        <p className="mt-2 text-sm text-muted-foreground">You can now sign in with your new password.</p>
        <Link href="/login" className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary/90">Go to sign in</Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">Choose a new password</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="pw" required>New password</Label>
          <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pw2" required>Confirm new password</Label>
          <Input id="pw2" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <Button type="submit" size="lg" loading={loading} className="w-full justify-center">Update password</Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-8 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary"><BookText className="h-5 w-5 text-white" /></span>
          <span className="text-lg font-semibold tracking-tight">TicketBooks</span>
        </Link>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted" />}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
