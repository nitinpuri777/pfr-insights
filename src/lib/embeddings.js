import { supabase } from './supabase'

/**
 * Get the embedding provider based on available API keys
 */
function getEmbeddingProvider() {
  if (import.meta.env.VITE_OPENAI_API_KEY) return 'openai'
  if (import.meta.env.VITE_GEMINI_API_KEY) return 'gemini'
  return null
}

/**
 * Generate embedding for text using available provider
 */
export async function generateEmbedding(text) {
  const provider = getEmbeddingProvider()
  if (!provider) {
    console.warn('No embedding API key configured')
    return null
  }

  // Clean and truncate text (embeddings have token limits)
  const cleanText = text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000) // ~2000 tokens, safe limit

  if (!cleanText) return null

  try {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: cleanText,
        }),
      })
      const data = await response.json()
      return data.data?.[0]?.embedding || null
    }

    if (provider === 'gemini') {
      // Gemini embedding API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text: cleanText }] },
          }),
        }
      )
      const data = await response.json()
      const embedding = data.embedding?.values
      
      // Gemini returns 768 dimensions, we need to pad to 1536 or use a different approach
      // For now, we'll pad with zeros (not ideal but works)
      if (embedding && embedding.length === 768) {
        return [...embedding, ...new Array(768).fill(0)]
      }
      return embedding || null
    }
  } catch (error) {
    console.error('Failed to generate embedding:', error)
    return null
  }

  return null
}

/**
 * Generate and store embedding for a feedback item
 */
export async function embedFeedback(feedbackId, description) {
  const embedding = await generateEmbedding(description)
  if (!embedding) return false

  const { error } = await supabase
    .from('feedback')
    .update({ embedding })
    .eq('id', feedbackId)

  if (error) {
    console.error('Failed to store feedback embedding:', error)
    return false
  }
  return true
}

/**
 * Generate and store embedding for an idea
 */
export async function embedIdea(ideaId, title, description = '') {
  const text = `${title}. ${description || ''}`.trim()
  const embedding = await generateEmbedding(text)
  if (!embedding) return false

  const { error } = await supabase
    .from('ideas')
    .update({ embedding })
    .eq('id', ideaId)

  if (error) {
    console.error('Failed to store idea embedding:', error)
    return false
  }
  return true
}

/**
 * Find feedback similar to an idea using vector search
 */
export async function findSimilarFeedback(ideaTitle, ideaDescription = '', options = {}) {
  const {
    threshold = 0.5,
    limit = 30,
    excludeLinked = false,
    excludeFeedbackIds = [],
  } = options

  const text = `${ideaTitle}. ${ideaDescription || ''}`.trim()
  const embedding = await generateEmbedding(text)
  
  if (!embedding) {
    console.warn('Could not generate embedding for search')
    return []
  }

  // Use the Supabase function for vector search
  const { data, error } = await supabase.rpc('match_feedback_to_idea', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
  })

  if (error) {
    console.error('Vector search failed:', error)
    return []
  }

  let results = data || []

  // Filter out already linked feedback if requested
  if (excludeLinked) {
    results = results.filter(f => f.triage_status !== 'linked')
  }

  // Filter out specific feedback IDs
  if (excludeFeedbackIds.length > 0) {
    const excludeSet = new Set(excludeFeedbackIds)
    results = results.filter(f => !excludeSet.has(f.id))
  }

  return results
}

/**
 * Find ideas similar to feedback using vector search
 */
export async function findSimilarIdeas(feedbackDescription, options = {}) {
  const {
    threshold = 0.5,
    limit = 10,
  } = options

  const embedding = await generateEmbedding(feedbackDescription)
  
  if (!embedding) {
    console.warn('Could not generate embedding for search')
    return []
  }

  const { data, error } = await supabase.rpc('match_ideas_to_feedback', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
  })

  if (error) {
    console.error('Vector search failed:', error)
    return []
  }

  return data || []
}

/**
 * Batch embed all feedback items that don't have embeddings
 * Call this from a settings/admin page or on import
 */
export async function batchEmbedFeedback(onProgress = null) {
  // Get all feedback without embeddings
  const { data: feedback, error } = await supabase
    .from('feedback')
    .select('id, description')
    .is('embedding', null)
    .limit(100) // Process in batches

  if (error || !feedback?.length) {
    return { processed: 0, total: 0 }
  }

  let processed = 0
  for (const item of feedback) {
    const success = await embedFeedback(item.id, item.description)
    if (success) processed++
    
    if (onProgress) {
      onProgress({ processed, total: feedback.length })
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100))
  }

  return { processed, total: feedback.length }
}

/**
 * Batch embed all ideas that don't have embeddings
 */
export async function batchEmbedIdeas(onProgress = null) {
  const { data: ideas, error } = await supabase
    .from('ideas')
    .select('id, title, description')
    .is('embedding', null)
    .limit(100)

  if (error || !ideas?.length) {
    return { processed: 0, total: 0 }
  }

  let processed = 0
  for (const item of ideas) {
    const success = await embedIdea(item.id, item.title, item.description)
    if (success) processed++
    
    if (onProgress) {
      onProgress({ processed, total: ideas.length })
    }
    
    await new Promise(r => setTimeout(r, 100))
  }

  return { processed, total: ideas.length }
}
