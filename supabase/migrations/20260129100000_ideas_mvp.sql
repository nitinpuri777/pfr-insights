-- Ideas MVP: Many-to-many feedback linking + status updates

-- 0. Update the status check constraint to allow new statuses
ALTER TABLE ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE ideas ADD CONSTRAINT ideas_status_check 
  CHECK (status IN ('backlog', 'under_consideration', 'planned', 'in_progress', 'shipped', 'wont_do', 
                    'open', 'under_review', 'complete', 'closed'));

-- Migrate old statuses to new ones
UPDATE ideas SET status = 'backlog' WHERE status = 'open';
UPDATE ideas SET status = 'under_consideration' WHERE status = 'under_review';
UPDATE ideas SET status = 'shipped' WHERE status = 'complete';
UPDATE ideas SET status = 'wont_do' WHERE status = 'closed';

-- 1. Create junction table for many-to-many feedback <-> ideas
CREATE TABLE IF NOT EXISTS feedback_idea_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  confidence NUMERIC, -- AI match confidence (0-1) when auto-suggested
  linked_by TEXT, -- user who linked it (for audit)
  UNIQUE(feedback_id, idea_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_idea_links_feedback ON feedback_idea_links(feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_idea_links_idea ON feedback_idea_links(idea_id);

-- 2. Migrate existing feedback.idea_id relationships to the new table
INSERT INTO feedback_idea_links (feedback_id, idea_id)
SELECT id, idea_id FROM feedback WHERE idea_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Add summary field to ideas for cached AI summaries
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ;

-- 4. Add customer_count field to ideas
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS customer_count INTEGER DEFAULT 0;

-- 5. Create function to recalculate idea stats from links
CREATE OR REPLACE FUNCTION recalculate_idea_stats(target_idea_id UUID)
RETURNS void AS $$
DECLARE
  link_count INTEGER;
  arr_total NUMERIC;
  cust_count INTEGER;
BEGIN
  -- Count linked feedback
  SELECT COUNT(*) INTO link_count
  FROM feedback_idea_links
  WHERE idea_id = target_idea_id;

  -- Sum ARR from linked feedback (distinct accounts)
  SELECT COALESCE(SUM(arr_val), 0), COUNT(DISTINCT account_name)
  INTO arr_total, cust_count
  FROM (
    SELECT f.account_name, MAX(COALESCE(NULLIF(f.account_arr, '')::numeric, 0)) as arr_val
    FROM feedback_idea_links fil
    JOIN feedback f ON f.id = fil.feedback_id
    WHERE fil.idea_id = target_idea_id
    GROUP BY f.account_name
  ) sub;

  -- Update idea
  UPDATE ideas
  SET feedback_count = link_count,
      total_arr = arr_total,
      customer_count = cust_count
  WHERE id = target_idea_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger function for feedback_idea_links
CREATE OR REPLACE FUNCTION update_idea_stats_on_link() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recalculate_idea_stats(NEW.idea_id);
    -- Update feedback triage status
    UPDATE feedback SET triage_status = 'linked' WHERE id = NEW.feedback_id;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recalculate_idea_stats(OLD.idea_id);
    -- Check if feedback still has links, if not revert to triaged
    IF NOT EXISTS (SELECT 1 FROM feedback_idea_links WHERE feedback_id = OLD.feedback_id) THEN
      UPDATE feedback SET triage_status = 'triaged' WHERE id = OLD.feedback_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_idea_stats_on_link ON feedback_idea_links;
CREATE TRIGGER trigger_update_idea_stats_on_link
AFTER INSERT OR DELETE ON feedback_idea_links
FOR EACH ROW EXECUTE FUNCTION update_idea_stats_on_link();

-- 7. Recalculate all existing idea stats
DO $$
DECLARE
  idea_record RECORD;
BEGIN
  FOR idea_record IN SELECT id FROM ideas LOOP
    PERFORM recalculate_idea_stats(idea_record.id);
  END LOOP;
END $$;

-- Note: We're keeping the original feedback.idea_id column for now as a fallback
-- but all new code will use the feedback_idea_links table
