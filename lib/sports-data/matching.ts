import type { NormalizedMatch } from "./models";

export function normalizeEntityName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(fc|cf|afc|club|football|the)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export type EntityCandidate = { id: string; name: string; country?: string | null; competitionId?: string | null; aliases?: string[] };
export function matchEntity(input: { externalId?: string; name: string; country?: string | null; competitionId?: string | null }, candidates: EntityCandidate[], existingMapping?: string): { id: string | null; confidence: number; reason: string } {
  if (existingMapping) return { id: existingMapping, confidence: 1, reason: "mapping" };
  const target = normalizeEntityName(input.name);
  const exact = candidates.find((candidate) => candidate.aliases?.some((alias) => normalizeEntityName(alias) === target));
  if (exact) return { id: exact.id, confidence: 0.98, reason: "alias" };
  const named = candidates.filter((candidate) => normalizeEntityName(candidate.name) === target);
  const contextual = named.find((candidate) => (!input.country || normalizeEntityName(candidate.country ?? "") === normalizeEntityName(input.country)) && (!input.competitionId || candidate.competitionId === input.competitionId));
  if (contextual) return { id: contextual.id, confidence: 0.95, reason: "name_context" };
  if (named.length === 1) return { id: named[0].id, confidence: 0.82, reason: "normalized_name" };
  return { id: null, confidence: 0, reason: "unresolved" };
}

export function sameMatch(a: NormalizedMatch, b: NormalizedMatch, toleranceMinutes = 30): boolean {
  if (a.competitionExternalId !== b.competitionExternalId || a.season !== b.season) return false;
  if (a.homeTeamExternalId !== b.homeTeamExternalId || a.awayTeamExternalId !== b.awayTeamExternalId) return false;
  if (Math.abs(Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt)) > toleranceMinutes * 60_000) return false;
  if (a.stage && b.stage && a.stage !== b.stage) return false;
  if (a.matchday !== null && b.matchday !== null && a.matchday !== b.matchday) return false;
  return true;
}
