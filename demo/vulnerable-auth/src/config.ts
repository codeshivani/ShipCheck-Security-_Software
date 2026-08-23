// Application configuration.
//
// NOTE (demo): this file intentionally hardcodes a secret so ShipCheck's R2
// rule has something realistic to find. In a real project this would come
// from an environment variable or secret manager.

export const config = {
  port: 3000,
  jwtSecret: "sk-abcdE7fGhijKLmn0pQrStuVwxYz123", // hardcoded secret literal — R2 target
  dbUrl: process.env.DATABASE_URL ?? "mongodb://localhost:27017/vulnerable-auth-demo",
};
