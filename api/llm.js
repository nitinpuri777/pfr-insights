// Vercel Edge Function for LLM calls
// This keeps your API key secure on the server

export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get API key from server environment (NOT exposed to browser)
  const apiKey = process.env.OPENAI_API_KEY
  
  if (!apiKey) {
    console.error('OPENAI_API_KEY not found in environment')
    return new Response(JSON.stringify({ 
      error: 'API key not configured on server. Add OPENAI_API_KEY to Vercel environment variables.' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body
  try {
    body = await req.json()
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { action, messages, input } = body

  if (!action) {
    return new Response(JSON.stringify({ error: 'Missing action parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    if (action === 'chat') {
      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: 'Missing or invalid messages array' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      console.log('Making OpenAI chat request with', messages.length, 'messages')
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.3,
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        console.error('OpenAI API error:', data)
        return new Response(JSON.stringify({ 
          error: data.error?.message || 'OpenAI API error',
          details: data
        }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      
      const content = data.choices?.[0]?.message?.content
      console.log('OpenAI response received, content length:', content?.length || 0)
      
      return new Response(JSON.stringify({ content }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (action === 'embed') {
      if (!input) {
        return new Response(JSON.stringify({ error: 'Missing input for embedding' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      console.log('Making OpenAI embedding request, input length:', input.length)
      
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input,
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        console.error('OpenAI Embedding API error:', data)
        return new Response(JSON.stringify({ 
          error: data.error?.message || 'OpenAI API error',
          details: data
        }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      
      const embedding = data.data?.[0]?.embedding
      console.log('Embedding received, dimensions:', embedding?.length || 0)
      
      return new Response(JSON.stringify({ embedding }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('API route error:', error)
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
