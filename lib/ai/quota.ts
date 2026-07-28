function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
}

export function isAIQuotaExceeded(error: unknown): boolean {
  return /(?:\b4006\b|daily free allocation|insufficient[_ -]?quota|quota exceeded)/i.test(errorText(error));
}

export function safeAIErrorMessage(error: unknown): string {
  return errorText(error).replace(/\s+/g, " ").trim().slice(0, 500) || "AI request failed";
}
