export interface ExternalArticle { externalId: string; url: string; title: string; excerpt: string; author?: string; imageUrl?: string; publishedAt: string; }
export interface NormalizedArticle extends ExternalArticle { sourceId: string; contentHash: string; language: string; }
export interface NewsProvider { readonly name: string; fetchArticles(): Promise<ExternalArticle[]>; normalizeArticle(article: ExternalArticle, sourceId: string): Promise<NormalizedArticle>; }
