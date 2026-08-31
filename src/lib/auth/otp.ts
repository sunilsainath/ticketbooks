import crypto from "crypto";
import { sha256 } from "./password";

export function generateOtp(length = 6): string {
  const digits = "0123456789";
  let otp = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    otp += digits[bytes[i] % 10];
  }
  // Ensure no leading zero issues? Keep as string
  return otp;
}

export function hashOtp(otp: string): string {
  return sha256(otp);
}

export function otpExpiryMinutes(minutes = 10): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000; // 1 min between sends per email
export const OTP_PURPOSES = ["email_verification", "password_reset"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];
