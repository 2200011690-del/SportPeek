# NewsPeek product specification

NewsPeek is a Vietnamese-first reader that aggregates public RSS metadata from Vietnam and the world. Its primary content unit is a story: one event, all retained source articles and one readable Vietnamese summary.

## Product rules

1. Show the newest material update first; repeated syndication must not make an old event appear new.
2. Merge shared facts and remove repeated wording across publishers.
3. Never invent details that are absent from source metadata.
4. Keep publisher images at a clear responsive size.
5. The article reader shows the image, a full summary and outbound source links.
6. International stories are processed through the same AI failover chain as Vietnamese stories.
7. Keep older stories addressable and paginated instead of deleting them the next day.
8. Search and filters operate on categories, topics, regions and publishers.
9. Personalization may reorder stories but may not change reliability or conceal source attribution.
10. Sport is a normal editorial category; there is no separate match-data product.

## Editorial categories

- Việt Nam
- Thế giới
- Kinh tế
- Công nghệ
- Chính trị
- Sức khỏe
- Khoa học
- Văn hóa & Giải trí
- Thể thao

## AI availability

Remote providers are tried in configured order. Quota, timeout or malformed output triggers provider cooldown and failover. When every remote provider is unavailable, the site keeps the last source-backed summary or produces a conservative heuristic summary so reading never depends on a single paid service.
