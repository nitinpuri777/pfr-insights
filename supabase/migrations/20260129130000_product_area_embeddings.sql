-- Add embedding column to product_areas for fast vector-based routing

ALTER TABLE product_areas ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Index for vector search on product areas
CREATE INDEX IF NOT EXISTS idx_product_areas_embedding ON product_areas 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
