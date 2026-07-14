import { ConfigurationError } from "@/lib/core/errors";
import type { AIProvider, AgreementItem, ClassifiedArticle, ClusterMatchEvaluation, ClusterSummary, DisputeItem, TimelineItem } from "./types";

export class DisabledAIProvider implements AIProvider {
  readonly name = "disabled";
  private unavailable(): never { throw new ConfigurationError("AI provider chưa được cấu hình.", "ai"); }
  async classifyArticle(): Promise<ClassifiedArticle> { return this.unavailable(); }
  async summarizeCluster(): Promise<ClusterSummary> { return this.unavailable(); }
  async extractEntities(): Promise<{ teams: string[]; players: string[]; competitions: string[] }> { return this.unavailable(); }
  async evaluateClusterMatch(): Promise<ClusterMatchEvaluation> { return this.unavailable(); }
  async generateTimeline(): Promise<TimelineItem[]> { return this.unavailable(); }
  async identifyAgreements(): Promise<AgreementItem[]> { return this.unavailable(); }
  async identifyDisputes(): Promise<DisputeItem[]> { return this.unavailable(); }
  async answerFromClusterContext(): Promise<string> { return this.unavailable(); }
  async createMatchPreview(): Promise<string> { return this.unavailable(); }
  async createMatchRecap(): Promise<string> { return this.unavailable(); }
}
