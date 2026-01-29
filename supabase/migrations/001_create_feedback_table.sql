-- Create feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  feedback_date TEXT,
  description TEXT,
  importance TEXT,
  account_created_date TEXT,
  account_segment TEXT,
  created_by TEXT,
  pfr_id TEXT,
  account_status TEXT,
  account_arr TEXT,
  potential_arr TEXT,
  active_opportunities TEXT
);

-- Create index on feedback_date for faster sorting
CREATE INDEX IF NOT EXISTS idx_feedback_date ON feedback(feedback_date DESC);
