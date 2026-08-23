"use client";

import { useState } from "react";
import Link from "next/link";
import { BookText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { api, ApiError } from "@/lib/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/forgot-password", { method: "POST", json: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-8 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary"><BookText className="h-5 w-5 text-white" /></span>
          <span className="text-lg font-semibold tracking-tight">TicketBooks</span>
        </Link>

        {sent ? (
          <>
            <h1 className="text-xl font-bold tracking-tight">Check your inbox</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              If an account exists for <b>{email}</b>, we have sent a password reset link. The link expires in one hour.
            </p>
            <p className="mt-3 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              With the default &quot;console&quot; email provider, the reset link is printed to the server log.
            </p>
            <Link href="/login" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">Back to sign in</Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold tracking-tight">Forgot your password?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">We will email you a secure reset link.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="email" required>Work email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
              </div>
              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
              <Button type="submit" size="lg" loading={loading} className="w-full justify-center">Send reset link</Button>
            </form>
            <Link href="/login" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}
