-- migration 007: add records_skipped to scrape_logs
-- Tracks how many offers were blocked by the source-priority guard
-- (existing row had equal or higher trust, so content was not overwritten).

ALTER TABLE scrape_logs
  ADD COLUMN IF NOT EXISTS records_skipped INTEGER NOT NULL DEFAULT 0;
