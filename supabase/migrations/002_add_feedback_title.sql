-- Add title field to feedback table
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS title TEXT;
