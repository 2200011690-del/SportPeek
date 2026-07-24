import { z } from "zod";

const optionalString = z.string().trim().optional().default("");
const booleanString = z.enum(["true", "false"]).optional().default("false");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional().default("development"),
  INTERNAL_MODE: booleanString,
  ALLOW_PUBLIC_SIGNUP: booleanString,
  ALLOWED_EMAILS: optionalString,
  ADMIN_EMAILS: optionalString,
  ENABLE_DEVELOPMENT_FIXTURES: booleanString,
  NEWS_PROVIDER: optionalString,
  AI_PROVIDER: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
});

export type RuntimeEnvironment = z.infer<typeof environmentSchema>;

export function getRuntimeEnvironment(source: NodeJS.ProcessEnv = process.env): RuntimeEnvironment {
  return environmentSchema.parse(source);
}

export function parseEmailList(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function isInternalMode(source: NodeJS.ProcessEnv = process.env): boolean {
  return getRuntimeEnvironment(source).INTERNAL_MODE === "true";
}

export function isPublicSignupAllowed(source: NodeJS.ProcessEnv = process.env): boolean {
  const config = getRuntimeEnvironment(source);
  return config.INTERNAL_MODE !== "true" && config.ALLOW_PUBLIC_SIGNUP === "true";
}

export function developmentFixturesEnabled(source: NodeJS.ProcessEnv = process.env): boolean {
  const config = getRuntimeEnvironment(source);
  return config.NODE_ENV !== "production" && config.ENABLE_DEVELOPMENT_FIXTURES === "true";
}

export function isAllowedEmail(email: string | null | undefined, source: NodeJS.ProcessEnv = process.env): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const config = getRuntimeEnvironment(source);
  return [...parseEmailList(config.ALLOWED_EMAILS), ...parseEmailList(config.ADMIN_EMAILS)].includes(normalized);
}
