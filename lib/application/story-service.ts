import { storyRepository } from "@/lib/stories/repository";
import type { StoryArchiveFilters } from "@/lib/stories/persisted-repository";

export class StoryApplicationService {
  getFeed() { return storyRepository.getStoryFeed(); }
  getLatest(limit = 60) { return storyRepository.getLatestStories(limit); }
  getArchive(page = 1, pageSize = 12, filters: StoryArchiveFilters = {}) { return storyRepository.getStoryArchive(page, pageSize, filters); }
  getBySlug(slug: string) { return storyRepository.getStoryBySlug(slug); }
  getById(id: string) { return storyRepository.getStoryById(id); }
  getSources(id: string) { return storyRepository.getStorySources(id); }
  getRelated(id: string, limit = 4) { return storyRepository.getRelatedStories(id, limit); }
}

export const storyService = new StoryApplicationService();
