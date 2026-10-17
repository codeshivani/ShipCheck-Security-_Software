import { describe, expect, it } from "vitest";
import { signupErrorMessage } from "@/lib/supabase/auth-errors";

describe("signup error messages", () => {
  it("explains a rejected confirmation redirect", () => {
    expect(signupErrorMessage("redirect URL not allowed", "redirect_to_not_allowed"))
      .toContain("Authentication → URL Configuration → Redirect URLs");
  });

  it("explains disabled signups", () => {
    expect(signupErrorMessage("Signups not allowed for this instance", "signup_disabled"))
      .toContain("Enable email signups");
  });

  it("explains Supabase email throttling", () => {
    expect(signupErrorMessage("Email rate limit exceeded", "over_email_send_rate_limit"))
      .toContain("Wait a few minutes");
  });

  it("preserves an actionable message for unknown signup failures", () => {
    expect(signupErrorMessage("Database error saving new user"))
      .toContain("Auth logs and database triggers");
  });
});
