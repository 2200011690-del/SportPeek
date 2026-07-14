export interface ClassifiedArticle { sport: string; competition: string | null; teams: string[]; players: string[]; topics: string[]; articleType: string; language: string; }
export interface ClusterSummary { title: string; summary: string; keyPoints: string[]; sourceIds: string[]; }
export type ClusterArticleInput = { id: string; title: string; excerpt: string; publishedAt?: string; sourceName?: string };
export interface ClusterMatchEvaluation { sameEvent: boolean; confidence: number; reason: string; }
export interface TimelineItem { occurredAt: string; content: string; updateType: string; supportingArticleIds: string[]; }
export interface AgreementItem { text: string; sourceArticleIds: string[]; }
export interface DisputeItem { topic: string; positions: Array<{ claim: string; sourceArticleIds: string[] }> }
export interface AIProvider {
  readonly name: string;
  classifyArticle(input: { title: string; excerpt: string }): Promise<ClassifiedArticle>;
  summarizeCluster(input: { articles: Array<{ id: string; title: string; excerpt: string }> }): Promise<ClusterSummary>;
  extractEntities(input: { title: string; excerpt: string }): Promise<{ teams: string[]; players: string[]; competitions: string[] }>;
  evaluateClusterMatch(input: { article: ClusterArticleInput; candidate: ClusterArticleInput[] }): Promise<ClusterMatchEvaluation>;
  generateTimeline(input: { articles: ClusterArticleInput[] }): Promise<TimelineItem[]>;
  identifyAgreements(input: { articles: ClusterArticleInput[] }): Promise<AgreementItem[]>;
  identifyDisputes(input: { articles: ClusterArticleInput[] }): Promise<DisputeItem[]>;
  answerFromClusterContext(input: { question: string; articles: ClusterArticleInput[] }): Promise<string>;
  createMatchPreview(input: Record<string, unknown>): Promise<string>;
  createMatchRecap(input: Record<string, unknown>): Promise<string>;
}
