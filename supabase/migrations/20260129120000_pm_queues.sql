-- PM Queues & Assignment Feature

-- 1. Create team_members table (simple user management)
CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  is_active BOOLEAN DEFAULT true
);

-- 2. Create product_areas table
CREATE TABLE IF NOT EXISTS product_areas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  description TEXT,
  keywords TEXT[], -- Array of keywords for AI matching
  owner_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#6366f1'
);

CREATE INDEX IF NOT EXISTS idx_product_areas_owner ON product_areas(owner_id);

-- 3. Add assignment fields to feedback table
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS assigned_to_id UUID REFERENCES team_members(id) ON DELETE SET NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS product_area_id UUID REFERENCES product_areas(id) ON DELETE SET NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS suggested_owner_id UUID REFERENCES team_members(id) ON DELETE SET NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS suggested_product_area_id UUID REFERENCES product_areas(id) ON DELETE SET NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS suggestion_confidence NUMERIC;

CREATE INDEX IF NOT EXISTS idx_feedback_assigned_to ON feedback(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_feedback_product_area ON feedback(product_area_id);

-- 4. Function to get queue stats for a team member
CREATE OR REPLACE FUNCTION get_queue_stats(member_id UUID)
RETURNS TABLE (
  total_count BIGINT,
  oldest_date TIMESTAMPTZ,
  total_arr NUMERIC
) AS $$
  SELECT 
    COUNT(*) as total_count,
    MIN(created_at) as oldest_date,
    COALESCE(SUM(NULLIF(account_arr, '')::numeric), 0) as total_arr
  FROM feedback
  WHERE assigned_to_id = member_id
    AND triage_status IN ('new', 'triaged')
    AND triage_status != 'archived';
$$ LANGUAGE sql;

-- 5. Insert a default admin user (you can update this)
INSERT INTO team_members (id, email, name, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'nitin@example.com',
  'Nitin Puri',
  'admin'
) ON CONFLICT (email) DO NOTHING;
