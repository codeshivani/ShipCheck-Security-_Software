import { Rule } from "./types";
import { r1AuthorizationRule } from "./r1-authorization";
import { r2SecretsRule } from "./r2-secrets";
import { r3JwtRule } from "./r3-jwt";
import { r4IdorRule } from "./r4-idor";
import { r5DynamicExecRule } from "./r5-dynamic-exec";

export const ALL_RULES: Rule[] = [
  r1AuthorizationRule,
  r2SecretsRule,
  r3JwtRule,
  r4IdorRule,
  r5DynamicExecRule,
];

export {
  r1AuthorizationRule,
  r2SecretsRule,
  r3JwtRule,
  r4IdorRule,
  r5DynamicExecRule,
};
