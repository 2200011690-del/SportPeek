export interface ClassifiedArticle { sport: string; competition: string | null; teams: string[]; players: string[]; topics: string[]; articleType: string; language: string; }
export interface ClusterSummary { title: string; summary: string; keyPoints: string[]; sourceIds: string[]; }
export interface AIProvider {
  readonly name: string;
  classifyArticle(input: { title: string; excerpt: string }): Promise<ClassifiedArticle>;
  summarizeCluster(input: { articles: Array<{ id: string; title: string; excerpt: string }> }): Promise<ClusterSummary>;
  extractEntities(input: { title: string; excerpt: string }): Promise<{ teams: string[]; players: string[]; competitions: string[] }>;
  createMatchPreview(input: Record<string, unknown>): Promise<string>;
  createMatchRecap(input: Record<string, unknown>): Promise<string>;
}
