-- Add fixture_ids column to global_palettes if it doesn't exist
ALTER TABLE global_palettes ADD COLUMN IF NOT EXISTS fixture_ids TEXT DEFAULT NULL;
