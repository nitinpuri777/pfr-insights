-- Add vector embeddings support for semantic search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to feedback
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add embedding column to ideas for reverse matching
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_feedback_embedding ON feedback 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_ideas_embedding ON ideas 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Function to find similar feedback for an idea
CREATE OR REPLACE FUNCTION match_feedback_to_idea(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  description text,
  account_name text,
  account_arr text,
  account_segment text,
  triage_status text,
  similarity float
) AS $$
  SELECT 
    f.id,
    f.description,
    f.account_name,
    f.account_arr,
    f.account_segment,
    f.triage_status,
    1 - (f.embedding <=> query_embedding) as similarity
  FROM feedback f
  WHERE f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql;

-- Function to find similar ideas for feedback
CREATE OR REPLACE FUNCTION match_ideas_to_feedback(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  status text,
  feedback_count int,
  total_arr numeric,
  similarity float
) AS $$
  SELECT 
    i.id,
    i.title,
    i.description,
    i.status,
    i.feedback_count,
    i.total_arr,
    1 - (i.embedding <=> query_embedding) as similarity
  FROM ideas i
  WHERE i.embedding IS NOT NULL
    AND 1 - (i.embedding <=> query_embedding) > match_threshold
  ORDER BY i.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql;
