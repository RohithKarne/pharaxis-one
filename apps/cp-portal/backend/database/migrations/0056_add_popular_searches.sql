-- Rohith, 27 Oct 2026 (CP Portal review, row 3). The words under the home-page search
-- were fixed in code. Each client's admin now sets them on Branding, one per line;
-- empty keeps the built-in words.
ALTER TABLE cp_branding
  ADD COLUMN popular_searches TEXT NULL;
