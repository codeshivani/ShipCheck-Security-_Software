import { Rule } from "./types";
import { r1AuthorizationRule } from "./r1-authorization";
import { r2SecretsRule } from "./r2-secrets";
import { r3JwtRule } from "./r3-jwt";
import { r4IdorRule } from "./r4-idor";
import { r5DynamicExecRule } from "./r5-dynamic-exec";
import { r6SqlInjectionRule } from "./r6-sql-injection";
import { r7PathTraversalRule } from "./r7-path-traversal";
import { r8SsrfRule } from "./r8-ssrf";

export const ALL_RULES: Rule[] = [
  r1AuthorizationRule,
  r2SecretsRule,
  r3JwtRule,
  r4IdorRule,
  r5DynamicExecRule,
  r6SqlInjectionRule,
  r7PathTraversalRule,
  r8SsrfRule,
];

export {
  r1AuthorizationRule,
  r2SecretsRule,
  r3JwtRule,
  r4IdorRule,
  r5DynamicExecRule,
  r6SqlInjectionRule,
  r7PathTraversalRule,
  r8SsrfRule,
};
