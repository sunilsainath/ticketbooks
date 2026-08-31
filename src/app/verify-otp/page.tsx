"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { api, ApiError } from "@/lib/client";

function VerifyOtpContent() {
  const search = useSearchParams();
  const initialEmail = search.get("email") ?? "";
  const initialPurpose = (search.get("purpose") as "email_verification" | "password_reset") ?? "email_verification";

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [purpose, setPurpose] = useState<"email_verification" | "password_reset">(initialPurpose);
  const [step, setStep] = useState<"request" | "verify" | "reset">(initialEmail ? "verify" : "request");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api<{ success: boolean; expiresAt?: string; devOtp?: string; reason?: string }>(
        "/api/auth/send-otp",
        { method: "POST", json: { email, purpose } }
      );
      if (res.success) {
        setStep("verify");
        setCooldown(60);
        setMessage(
          res.devOtp
            ? `Code sent to ${email}. (Dev mode: ${res.devOtp}) Expires in 10 min.`
            : `Code sent to ${email}. Check your inbox. Expires in 10 min.`
        );
      } else {
        setError(res.reason ?? "Failed to send code");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api<{ success: boolean; verified?: boolean; reason?: string }>("/api/auth/verify-otp", {
        method: "POST",
        json: { email, otp, purpose },
      });
      if (res.success && res.verified) {
        setMessage("Email verified successfully! Redirecting to login...");
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
      } else {
        setError(res.reason ?? "Verification failed");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const resetWithOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Need a fresh OTP token because previous verify already consumed it.
      // Re-send OTP flow: we verified code already, but our verify consumed the token.
      // To avoid complexity, call reset-password-otp with the same otp; if token already verified,
      // this will fail, so we handle by sending a new OTP first then verify+reset together.
      // Simpler: call reset-password-otp directly with email/otp/newPassword (it verifies internally)
      const res = await api<{ success: boolean; reason?: string }>("/api/auth/reset-password-otp", {
        method: "POST",
        json: { email, otp, newPassword },
      });
      if (res.success) {
        setMessage("Password reset successful! Redirecting to login...");
        setTimeout(() => (window.location.href = "/login"), 1500);
      } else {
        setError(res.reason ?? "Failed to reset password. Request a new code.");
        setStep("verify");
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to reset";
      // If token already verified, offer to resend
      if (msg.includes("No reset code") || msg.includes("No verification")) {
        setError("Code already used. Please request a new code.");
        setStep("verify");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-8 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <BookText className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-semibold tracking-tight">TicketBooks</span>
        </Link>

        <h1 className="text-xl font-bold tracking-tight">
          {purpose === "password_reset" ? "Reset with OTP" : "Verify your email"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {step === "request"
            ? "Enter your email to receive a 6-digit verification code."
            : `Enter the 6-digit code sent to ${email}.`}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setPurpose("email_verification")}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${purpose === "email_verification" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            Email verification
          </button>
          <button
            onClick={() => setPurpose("password_reset")}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${purpose === "password_reset" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            Password reset
          </button>
        </div>

        {step === "request" ? (
          <form onSubmit={sendOtp} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email" required>
                Work email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoFocus
              />
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            {message && <p className="text-xs text-green-600">{message}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full justify-center">
              Send verification code
            </Button>
            <p className="text-xs text-muted-foreground">Code expires in 10 minutes. Check spam folder if not received.</p>
          </form>
        ) : step === "reset" ? (
          <form onSubmit={resetWithOtp} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="otp" required>
                6-digit code
              </Label>
              <Input
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="tracking-[0.3em] text-center text-lg font-mono"
                disabled
              />
            </div>
            <div>
              <Label htmlFor="newPassword" required>
                New password
              </Label>
              <Input id="newPassword" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div>
              <Label htmlFor="confirmPassword" required>
                Confirm password
              </Label>
              <Input id="confirmPassword" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" />
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            {message && <p className="text-xs text-green-600">{message}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full justify-center">
              Reset password
            </Button>
          </form>
        ) : purpose === "password_reset" ? (
          <form onSubmit={resetWithOtp} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <Label htmlFor="otp" required>
                6-digit code
              </Label>
              <Input
                id="otp"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                autoFocus
                className="tracking-[0.3em] text-center text-lg font-mono"
              />
            </div>
            <div>
              <Label htmlFor="newPassword" required>
                New password
              </Label>
              <Input id="newPassword" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div>
              <Label htmlFor="confirmPassword" required>
                Confirm password
              </Label>
              <Input id="confirmPassword" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" />
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            {message && <p className="text-xs text-green-600">{message}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full justify-center">
              Verify & reset password
            </Button>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setStep("request")} className="text-xs font-medium text-primary hover:underline">
                Change email
              </button>
              <button type="button" disabled={cooldown > 0 || loading} onClick={() => sendOtp()} className="text-xs font-medium text-primary hover:underline disabled:opacity-50">
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <Label htmlFor="otp" required>
                6-digit code
              </Label>
              <Input
                id="otp"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                autoFocus
                className="tracking-[0.3em] text-center text-lg font-mono"
              />
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            {message && <p className="text-xs text-green-600">{message}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full justify-center">
              Verify code
            </Button>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep("request")}
                className="text-xs font-medium text-primary hover:underline"
              >
                Change email
              </button>
              <button
                type="button"
                disabled={cooldown > 0 || loading}
                onClick={() => sendOtp()}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}

        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-6">Loading...</div>}>
      <VerifyOtpContent />
    </Suspense>
  );
}
