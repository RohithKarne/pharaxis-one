-- O1: per-integration MIMS case URL base for the T2 deep link (replaces the single
-- global CP_MIMS_CASE_URL_BASE env). Nullable — falls back to the env when unset.
ALTER TABLE cp_integration_config ADD COLUMN mims_case_url_base VARCHAR(500) NULL AFTER extra_headers;
