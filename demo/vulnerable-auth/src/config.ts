// Demo configuration uses environment-provided secrets only.
export const config = {
  port: 3000,
  jwtSecret: process.env.JWT_SECRET ?? "",
  dbUrl: process.env.DATABASE_URL ?? "mongodb://localhost:27017/vulnerable-auth-demo",
};
