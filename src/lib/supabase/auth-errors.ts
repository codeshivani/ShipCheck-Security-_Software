export function signupErrorMessage(message: string, code?: string): string {
  const normalizedCode = code?.toLowerCase() ?? "";
  const normalizedMessage = message.toLowerCase();

  if (normalizedCode.includes("redirect") || normalizedMessage.includes("redirect") && normalizedMessage.includes("allow")) {
    return "Supabase rejected the email confirmation URL. Add this app's origin under Authentication → URL Configuration → Redirect URLs, then try again.";
  }
  if (normalizedCode.includes("signup") && normalizedCode.includes("disabled") || normalizedMessage.includes("signups not allowed")) {
    return "New accounts are disabled for this Supabase project. Enable email signups under Authentication → Providers → Email.";
  }
  if (normalizedCode.includes("already") || normalizedMessage.includes("already registered") || normalizedMessage.includes("already been registered")) {
    return "An account may already exist for this email. Try signing in or use Forgot Password.";
  }
  if (normalizedCode.includes("weak_password") || normalizedMessage.includes("password")) {
    return "Supabase rejected the password. Use at least 12 characters with uppercase and lowercase letters and a number, and check the project's password policy.";
  }
  if (normalizedCode.includes("invalid_email") || normalizedMessage.includes("invalid email")) {
    return "Enter a valid email address and try again.";
  }
  if (normalizedCode.includes("rate_limit") || normalizedMessage.includes("rate limit") || normalizedMessage.includes("email rate")) {
    return "Supabase's email limit was reached. Wait a few minutes before trying again.";
  }
  if (normalizedMessage.includes("database error saving new user")) {
    return "Supabase could not save the new account. Check the project's Auth logs and database triggers, then try again.";
  }

  return `Account creation failed: ${message}`;
}
