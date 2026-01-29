-- PFR Insights Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ideas table
CREATE TABLE IF NOT EXISTS ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'planned', 'in_progress', 'complete', 'closed')),
  category TEXT,
  tags TEXT[],
  vote_count INTEGER DEFAULT 0,
  feedback_count INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  effort TEXT CHECK (effort IN ('small', 'medium', 'large', 'xlarge')),
  impact TEXT CHECK (impact IN ('low', 'medium', 'high')),
  total_arr NUMERIC DEFAULT 0,
  owner TEXT
);

CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_vote_count ON ideas(vote_count DESC);

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT NOT NULL,
  feedback_date TEXT,
  importance TEXT,
  account_name TEXT,
  account_segment TEXT,
  account_status TEXT,
  account_arr TEXT,
  account_created_date TEXT,
  potential_arr TEXT,
  active_opportunities TEXT,
  created_by TEXT,
  pfr_id TEXT,
  source TEXT DEFAULT 'csv_import',
  triage_status TEXT DEFAULT 'new' CHECK (triage_status IN ('new', 'triaged', 'linked', 'archived')),
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_triage_status ON feedback(triage_status);
CREATE INDEX IF NOT EXISTS idx_feedback_idea_id ON feedback(idea_id);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_identifier TEXT NOT NULL,
  UNIQUE(idea_id, user_identifier)
);

CREATE INDEX IF NOT EXISTS idx_votes_idea_id ON votes(idea_id);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false
);

-- Function to update vote count
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

-- Function to update feedback count
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
