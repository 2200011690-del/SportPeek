export interface ClassifiedArticle {
  category: string;
  topics: string[];
  people: string[];
  organizations: string[];
  locations: string[];
  countries: string[];
  articleType: string;
  language: string;
}
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
  extractEntities(input: { title: string; excerpt: string }): Promise<{ people: string[]; organizations: string[]; locations: string[]; countries: string[] }>;
  evaluateClusterMatch(input: { article: ClusterArticleInput; candidate: ClusterArticleInput[] }): Promise<ClusterMatchEvaluation>;
  generateTimeline(input: { articles: ClusterArticleInput[] }): Promise<TimelineItem[]>;
  identifyAgreements(input: { articles: ClusterArticleInput[] }): Promise<AgreementItem[]>;
  identifyDisputes(input: { articles: ClusterArticleInput[] }): Promise<DisputeItem[]>;
  answerFromClusterContext(input: { question: string; articles: ClusterArticleInput[] }): Promise<string>;
}
