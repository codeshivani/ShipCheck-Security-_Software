// NOTE (demo): hardcoded internal-tools API key, intentionally left in
// source so ShipCheck's R2 rule has something to find.

export const internalConfig = {
  internalApiKey: "ghp_9fA2bK7mQeR4tYvXcZ1nL8sD3wJpH6gU0iOe", // R2 target
  reportSigningSecret: process.env.REPORT_SIGNING_SECRET ?? "change-me-in-prod",
};
