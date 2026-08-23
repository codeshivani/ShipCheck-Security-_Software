# ShipCheck Authentication Hardening

This build replaces the localStorage demo login with Supabase Auth and cookie-based SSR sessions.

## Covered
- Missing authentication: protected application pages and API routes require an authenticated Supabase user.
- Broken authentication flow: email/password sign-up and sign-in use Supabase Auth with PKCE/SSR cookies.
- Weak passwords: UI requires 12+ characters with upper/lowercase letters and a number; configure the stronger server-side Supabase password policy too.
- Weak password reset: reset flow uses Supabase Auth and a generic response that does not reveal whether an email exists.
- Account enumeration: login/reset UI uses generic errors; Supabase reset is designed not to reveal account existence.
- Session fixation/hijacking: Auth session is managed by Supabase SSR with refresh-token rotation and server-side validation.
- Improper logout: global sign-out is used.
- Token expiration/JWT validation: server uses Supabase Auth `getUser()` for current-user validation and the Next.js proxy uses `getClaims()` to validate/refresh sessions.
- MFA: optional TOTP enrollment and login challenge are implemented. Protected APIs reject an AAL1 session when a verified factor requires AAL2.
- Authorization boundary: scan sessions are bound to the authenticated user ID; rescan, patch, explain, share, history and batch APIs verify ownership.
- CSRF: state-changing application APIs enforce same-origin requests.
- RLS: scans and batches have owner policies; shared reports have bounded public read access by token and expiry.

## Still required in Supabase Dashboard
1. Keep email confirmation enabled for production.
2. Set a strong password policy; enable leaked-password protection if the plan supports it.
3. Enable CAPTCHA/Turnstile for public signup, sign-in and password reset when exposed to the internet.
4. Configure Site URL and Redirect URLs for localhost and the production domain.
5. Configure custom SMTP before public launch.
6. Review Auth session/JWT expiry and rate-limit settings.

## Important
`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never expose it as a `NEXT_PUBLIC_*` variable or commit it. The browser uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Remaining gaps
- WebAuthn/passkeys are not implemented.
- Enterprise SSO is not implemented.
- Full production rate limiting for application APIs should move from process-local controls to a shared limiter before high-scale deployment.
