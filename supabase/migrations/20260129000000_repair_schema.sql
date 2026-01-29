-- Repair migration: fixes database schema to match 001_schema.sql
-- This handles the case where tables were created with different schemas

-- Add missing columns to ideas table
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS vote_count INTEGER DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS feedback_count INTEGER DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS effort TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS impact TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS total_arr NUMERIC DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Add constraints if they don't exist (will fail silently if they do)
DO $$ BEGIN
  ALTER TABLE ideas ADD CONSTRAINT ideas_status_check CHECK (status IN ('open', 'under_review', 'planned', 'in_progress', 'complete', 'closed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ideas ADD CONSTRAINT ideas_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ideas ADD CONSTRAINT ideas_effort_check CHECK (effort IN ('small', 'medium', 'large', 'xlarge'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ideas ADD CONSTRAINT ideas_impact_check CHECK (impact IN ('low', 'medium', 'high'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add missing columns to feedback table
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS triage_status TEXT DEFAULT 'new';
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'csv_import';
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS title TEXT;

-- Add constraint for triage_status if it doesn't exist
DO $$ BEGIN
  ALTER TABLE feedback ADD CONSTRAINT feedback_triage_status_check CHECK (triage_status IN ('new', 'triaged', 'linked', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_vote_count ON ideas(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_triage_status ON feedback(triage_status);
CREATE INDEX IF NOT EXISTS idx_feedback_idea_id ON feedback(idea_id);

-- Create votes table if not exists
CREATE TABLE IF NOT EXISTS votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_identifier TEXT NOT NULL,
  UNIQUE(idea_id, user_identifier)
);
CREATE INDEX IF NOT EXISTS idx_votes_idea_id ON votes(idea_id);

-- Create comments table if not exists
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false
);

-- Create/update triggers
CREATE OR REPLACE FUNCTION update_idea_vote_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE ideas SET vote_count = vote_count + 1 WHERE id = NEW.idea_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE ideas SET vote_count = vote_count - 1 WHERE id = OLD.idea_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_vote_count ON votes;
CREATE TRIGGER trigger_update_vote_count AFTER INSERT OR DELETE ON votes FOR EACH ROW EXECUTE FUNCTION update_idea_vote_count();

CREATE OR REPLACE FUNCTION update_idea_feedback_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.idea_id IS NOT NULL THEN UPDATE ideas SET feedback_count = feedback_count + 1 WHERE id = NEW.idea_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.idea_id IS NOT NULL AND (NEW.idea_id IS NULL OR NEW.idea_id != OLD.idea_id) THEN UPDATE ideas SET feedback_count = feedback_count - 1 WHERE id = OLD.idea_id; END IF;
    IF NEW.idea_id IS NOT NULL AND (OLD.idea_id IS NULL OR NEW.idea_id != OLD.idea_id) THEN UPDATE ideas SET feedback_count = feedback_count + 1 WHERE id = NEW.idea_id; END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.idea_id IS NOT NULL THEN UPDATE ideas SET feedback_count = feedback_count - 1 WHERE id = OLD.idea_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_feedback_count ON feedback;
CREATE TRIGGER trigger_update_feedback_count AFTER INSERT OR UPDATE OR DELETE ON feedback FOR EACH ROW EXECUTE FUNCTION update_idea_feedback_count();
