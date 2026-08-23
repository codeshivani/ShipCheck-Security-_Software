// Demo configuration uses environment-provided credentials only.
export const internalConfig = {
  internalApiKey: process.env.INTERNAL_API_KEY ?? "",
  reportSigningSecret: process.env.REPORT_SIGNING_SECRET ?? "",
};
