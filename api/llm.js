// Vercel Edge Function for LLM calls
// This keeps your API key secure on the server

export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { action, messages, input } = await req.json()

  // Get API key from server environment (NOT exposed to browser)
  const apiKey = process.env.OPENAI_API_KEY
  
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    if (action === 'chat') {
      // LLM chat completion
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
      return new Response(JSON.stringify({ 
        content: data.choices?.[0]?.message?.content 
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (action === 'embed') {
      // Generate embeddings
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
      return new Response(JSON.stringify({ 
        embedding: data.data?.[0]?.embedding 
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
