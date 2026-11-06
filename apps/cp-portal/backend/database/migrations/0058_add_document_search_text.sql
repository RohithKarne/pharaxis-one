-- Rohith, 27 Oct 2026 (CP Portal review, row 4). The portal search matched a
-- document by its title only, so a word inside a prescribing information leaflet
-- was never found. The text of each PDF is read once at upload and kept here for
-- the search. NULL for files with no text layer (scans) and for non-PDF files.
ALTER TABLE cp_documents
  ADD COLUMN search_text MEDIUMTEXT NULL;
