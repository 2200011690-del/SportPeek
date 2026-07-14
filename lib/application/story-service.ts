import { storyRepository } from "@/lib/stories/repository";

export class StoryApplicationService {
  getFeed() { return storyRepository.getStoryFeed(); }
  getLatest(limit = 60) { return storyRepository.getLatestStories(limit); }
  getBySlug(slug: string) { return storyRepository.getStoryBySlug(slug); }
  getById(id: string) { return storyRepository.getStoryById(id); }
  getSources(id: string) { return storyRepository.getStorySources(id); }
  getRelated(id: string, limit = 4) { return storyRepository.getRelatedStories(id, limit); }
}

export const storyService = new StoryApplicationService();

