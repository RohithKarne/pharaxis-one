-- CPPM-122 (approved by Rohith 3 Oct 2026): an admin may tag a news post, a document
-- or an event with one of the client's therapeutic areas, so "For you" (CPPM-116)
-- can match on the area rather than on words in the title. NULL means untagged.
-- No foreign key: an area can be removed while content still mentions it; the tag
-- then simply stops matching.
ALTER TABLE cp_news_posts ADD COLUMN therapeutic_area_id INT NULL, ADD KEY idx_news_area (therapeutic_area_id);
ALTER TABLE cp_documents  ADD COLUMN therapeutic_area_id INT NULL, ADD KEY idx_docs_area (therapeutic_area_id);
ALTER TABLE cp_events     ADD COLUMN therapeutic_area_id INT NULL, ADD KEY idx_events_area (therapeutic_area_id);
