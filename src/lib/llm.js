import { findSimilarFeedback, findSimilarIdeas, embedIdea, embedFeedback } from './embeddings'

// Check if we should use the secure API route (production) or direct calls (development)
function useSecureAPI() {
  // In production on Vercel, use the API route
  // In development with VITE_ keys, use direct calls (less secure but convenient)
  return import.meta.env.PROD && !import.meta.env.VITE_OPENAI_API_KEY
}

export function getProvider() {
  if (useSecureAPI()) return 'api' // Use Vercel API route
  if (import.meta.env.VITE_OPENAI_API_KEY) return 'openai'
  if (import.meta.env.VITE_ANTHROPIC_API_KEY) return 'anthropic'
  if (import.meta.env.VITE_GEMINI_API_KEY) return 'gemini'
  return null
}

export async function callLLM(messages, provider = null) {
  const p = provider || getProvider()
  if (!p) throw new Error('No LLM API key configured')
  
  // Use secure API route in production
  if (p === 'api') {
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat', messages }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.content
  }
  
  if (p === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.3 }),
    })
    const data = await res.json()
    return data.choices[0].message.content
  }
  
  if (p === 'anthropic') {
    const sys = messages.find(m => m.role === 'system')?.content || ''
    const msgs = messages.filter(m => m.role !== 'system')
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 1024, system: sys, messages: msgs }),
    })
    const data = await res.json()
    return data.content[0].text
  }
  
  if (p === 'gemini') {
    const parts = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: parts }),
    })
    const data = await res.json()
    return data.candidates[0].content.parts[0].text
  }
}

/**
 * Find evidence (feedback) for an idea using embeddings + LLM refinement
 * 
 * Stage 1: Vector search finds semantically similar feedback
 * Stage 2: LLM scores and explains matches, filters false positives
 */
export async function findEvidenceForIdea(ideaTitle, ideaDescription, feedbackItems, options = {}) {
  const { useEmbeddings = true, linkedFeedbackIds = [] } = options

  // If we have embeddings enabled, use vector search first
  if (useEmbeddings) {
    try {
      // Stage 1: Vector search for semantic similarity
      const vectorMatches = await findSimilarFeedback(ideaTitle, ideaDescription, {
        threshold: 0.45, // Lower threshold to catch more candidates
        limit: 30,
        excludeFeedbackIds: linkedFeedbackIds,
      })

      if (vectorMatches.length > 0) {
        // Stage 2: LLM refines and explains matches
        return await refineMatchesWithLLM(ideaTitle, ideaDescription, vectorMatches)
      }
    } catch (error) {
      console.warn('Embedding search failed, falling back to LLM-only:', error)
    }
  }

  // Fallback: LLM-only matching (original approach, for when embeddings aren't available)
  return await llmOnlyMatching(ideaTitle, ideaDescription, feedbackItems)
}

/**
 * Stage 2: LLM refines vector search results
 * This is where the magic happens - LLM explains WHY things match and filters false positives
 */
async function refineMatchesWithLLM(ideaTitle, ideaDescription, candidates) {
  const feedbackList = candidates.map((f, i) => {
    const arr = f.account_arr ? ` | $${parseFloat(f.account_arr).toLocaleString()} ARR` : ''
    const segment = f.account_segment ? ` | ${f.account_segment}` : ''
    const similarity = f.similarity ? ` | ${Math.round(f.similarity * 100)}% similar` : ''
    return `[${i + 1}] ${f.account_name || 'Unknown'}${arr}${segment}${similarity}
"${f.description?.slice(0, 400)}"`
  }).join('\n\n')

  const systemPrompt = `You are Ideas Bot, an expert at connecting customer feedback to product ideas.

You're given an idea and a list of feedback items that are POTENTIALLY related (pre-filtered by semantic similarity).

Your job is to:
1. Determine which feedback items truly support this idea as evidence
2. Assign a confidence score (0.0 to 1.0) based on how well the feedback supports the idea
3. Explain WHY each match is relevant (or not)

SCORING GUIDE:
- 0.9-1.0: Direct request for exactly this feature/capability
- 0.8-0.9: Clear pain point that this idea would solve
- 0.7-0.8: Related use case, would benefit from this idea
- 0.6-0.7: Tangentially related, might benefit
- Below 0.6: Not a real match, exclude from results

EXAMPLES:
Idea: "Offline Mode for Field Technicians"
✓ "We need to complete work orders when there's no WiFi" → 0.95 (exact need)
✓ "Technicians work in basements with no signal" → 0.88 (same problem, implies need)
✓ "Can we cache asset data for slow connections?" → 0.72 (related but different solution)
✗ "The mobile app is slow" → exclude (performance, not connectivity)

Return JSON: {"matches":[{"index":1,"confidence":0.92,"reason":"Directly requests offline capability for work orders"}]}`

  const userPrompt = `IDEA: ${ideaTitle}
${ideaDescription ? `DESCRIPTION: ${ideaDescription}` : ''}

CANDIDATE FEEDBACK (already filtered by semantic similarity):
${feedbackList}`

  try {
    const response = await callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    const match = response.match(/\{[\s\S]*\}/)
    const result = JSON.parse(match[0])

    // Map indices back to actual feedback IDs and enrich with data
    const matches = (result.matches || [])
      .filter(m => m.confidence >= 0.6) // Filter low confidence
      .map(m => {
        const candidate = candidates[m.index - 1]
        if (!candidate) return null
        return {
          id: candidate.id,
          confidence: m.confidence,
          reason: m.reason,
          feedback: candidate,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.confidence - a.confidence)

    return { matches }
  } catch (error) {
    console.error('LLM refinement failed:', error)
    // Fall back to just returning vector results with similarity scores
    return {
      matches: candidates.slice(0, 15).map(c => ({
        id: c.id,
        confidence: c.similarity || 0.7,
        reason: 'Semantically similar (LLM refinement unavailable)',
        feedback: c,
      }))
    }
  }
}

/**
 * Fallback: LLM-only matching when embeddings aren't available
 */
async function llmOnlyMatching(ideaTitle, ideaDescription, feedbackItems) {
  if (!feedbackItems || feedbackItems.length === 0) {
    return { matches: [] }
  }

  // Limit to avoid context length issues
  const limitedFeedback = feedbackItems.slice(0, 50)

  const feedbackList = limitedFeedback.map((f, i) => {
    const arr = f.account_arr ? ` | $${parseFloat(f.account_arr).toLocaleString()} ARR` : ''
    const segment = f.account_segment ? ` | ${f.account_segment}` : ''
    return `[${f.id}] ${f.account_name || 'Unknown'}${arr}${segment}: "${f.description?.slice(0, 300)}"`
  }).join('\n')

  const messages = [
    { 
      role: 'system', 
      content: `You are Ideas Bot. Given a product idea, find feedback items that support it as evidence.

Consider:
- Semantic similarity (same problem, different words)
- The "job to be done" behind requests
- Use cases that this idea would solve

Return JSON: {"matches":[{"id":"feedback-uuid","confidence":0.95,"reason":"Brief explanation"}]}

Rules:
- Confidence 0.8+ = strong match (same core need)
- Confidence 0.6-0.8 = moderate match (related but not exact)
- Below 0.6 = don't include
- Return up to 15 matches, sorted by confidence
- Be honest about confidence levels` 
    },
    { 
      role: 'user', 
      content: `Find feedback that supports this idea:

IDEA: ${ideaTitle}
${ideaDescription ? `DESCRIPTION: ${ideaDescription}` : ''}

FEEDBACK ITEMS:
${feedbackList}` 
    }
  ]

  const response = await callLLM(messages)
  try {
    const match = response.match(/\{[\s\S]*\}/)
    const result = JSON.parse(match[0])
    
    // Enrich matches with full feedback data
    const enrichedMatches = (result.matches || []).map(m => {
      const feedbackItem = feedbackItems.find(f => f.id === m.id)
      return feedbackItem ? { ...m, feedback: feedbackItem } : null
    }).filter(Boolean)

    return { matches: enrichedMatches }
  } catch {
    return { matches: [] }
  }
}

/**
 * Suggest matching ideas for a feedback item using embeddings + LLM
 */
export async function suggestMatchingIdeas(description, ideas, options = {}) {
  const { useEmbeddings = true } = options

  // Try embedding-based search first
  if (useEmbeddings) {
    try {
      const vectorMatches = await findSimilarIdeas(description, {
        threshold: 0.45,
        limit: 10,
      })

      if (vectorMatches.length > 0) {
        // LLM refines the matches
        return await refineIdeaMatchesWithLLM(description, vectorMatches, ideas)
      }
    } catch (error) {
      console.warn('Embedding search failed, falling back to LLM-only:', error)
    }
  }

  // Fallback to LLM-only
  return await llmOnlyIdeaMatching(description, ideas)
}

/**
 * LLM refines idea matches from vector search
 */
async function refineIdeaMatchesWithLLM(feedbackDescription, vectorMatches, allIdeas) {
  const ideasList = vectorMatches.map((m, i) => {
    const similarity = m.similarity ? ` | ${Math.round(m.similarity * 100)}% similar` : ''
    return `[${m.id}] "${m.title}"${similarity}
${m.description ? `Description: ${m.description.slice(0, 200)}` : ''}`
  }).join('\n\n')

  const systemPrompt = `You are Ideas Bot. Given customer feedback and a list of potentially matching product ideas, determine which ideas this feedback supports.

Return JSON:
{
  "matches": [{"id": "uuid", "confidence": 0.9, "reason": "Why this matches"}],
  "suggested_new_idea": {
    "should_create": true/false,
    "title": "Suggested title if no good matches",
    "description": "Suggested description"
  }
}

Rules:
- Only include matches with confidence >= 0.6
- If best match is below 0.7, suggest creating a new idea
- Be specific about why feedback relates to each idea`

  const userPrompt = `FEEDBACK: "${feedbackDescription}"

CANDIDATE IDEAS:
${ideasList}`

  try {
    const response = await callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    const match = response.match(/\{[\s\S]*\}/)
    const result = JSON.parse(match[0])

    // Enrich with full idea data
    result.matches = (result.matches || []).map(m => {
      const idea = allIdeas.find(i => i.id === m.id) || vectorMatches.find(v => v.id === m.id)
      return idea ? { ...m } : null
    }).filter(Boolean)

    return result
  } catch (error) {
    console.error('LLM refinement failed:', error)
    return {
      matches: vectorMatches.slice(0, 5).map(v => ({
        id: v.id,
        confidence: v.similarity || 0.7,
        reason: 'Semantically similar',
      })),
      suggested_new_idea: { should_create: false }
    }
  }
}

/**
 * Fallback LLM-only idea matching
 */
async function llmOnlyIdeaMatching(description, ideas) {
  const ctx = ideas.map(i => `- ${i.id}: ${i.title}`).join('\n')
  const messages = [
    { role: 'system', content: 'Match feedback to ideas. Respond in JSON: {"matches":[{"id":"uuid","confidence":0.9,"reason":"why"}],"suggested_new_idea":{"should_create":true,"title":"title","description":"desc"}}' },
    { role: 'user', content: `Feedback: "${description}"\n\nIdeas:\n${ctx || 'None'}` }
  ]
  const response = await callLLM(messages)
  try {
    const match = response.match(/\{[\s\S]*\}/)
    return JSON.parse(match[0])
  } catch { 
    return { 
      matches: [], 
      suggested_new_idea: { 
        should_create: true, 
        title: description.slice(0, 100), 
        description 
      } 
    } 
  }
}

/**
 * Summarize linked feedback for an idea
 */
export async function summarizeFeedback(items) {
  const list = items.map((f, i) => {
    const arr = f.account_arr ? ` ($${parseFloat(f.account_arr).toLocaleString()} ARR)` : ''
    return `${i+1}. ${f.account_name || 'Unknown'}${arr}: "${f.description}"`
  }).join('\n')
  
  return callLLM([
    { role: 'system', content: `You are Ideas Bot, helping PMs analyze product feedback.
Summarize the linked feedback for this idea. Be concise and actionable.

Format your response like this:
**${items.length} requests · ${new Set(items.map(f => f.account_name).filter(Boolean)).size} customers**

**Use Cases:**
• [Key use cases mentioned]

**Pain Points:**
• [Common blockers or frustrations]

**Workarounds:**
• [What customers do today, or "None mentioned"]

**Segment Pattern:**
• [Any patterns by customer type/size]` },
    { role: 'user', content: `Summarize this feedback:\n${list}` }
  ])
}

/**
 * Suggest a new idea title and description from feedback text
 */
export async function suggestIdeaFromFeedback(feedbackText, accountName) {
  const messages = [
    {
      role: 'system',
      content: `You are Ideas Bot. Given raw customer feedback, suggest a product idea title and description.

Rules:
- Title should be a clear product capability (not the customer's exact words)
- Description should frame it as a hypothesis about what to build
- Be concise

Return JSON: {"title":"Short idea title","description":"What this would enable..."}`
    },
    {
      role: 'user',
      content: `Feedback from ${accountName || 'a customer'}: "${feedbackText}"`
    }
  ]

  const response = await callLLM(messages)
  try {
    const match = response.match(/\{[\s\S]*\}/)
    return JSON.parse(match[0])
  } catch {
    return { 
      title: feedbackText.slice(0, 80) + (feedbackText.length > 80 ? '...' : ''),
      description: ''
    }
  }
}

// Re-export embedding functions for convenience
export { embedIdea, embedFeedback } from './embeddings'
