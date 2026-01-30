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

  // Get API keys from server environment (NOT exposed to browser)
  const geminiKey = process.env.GEMINI_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  
  // Prefer Gemini, fall back to OpenAI
  const provider = geminiKey ? 'gemini' : openaiKey ? 'openai' : null
  
  if (!provider) {
    console.error('No API key found in environment')
    return new Response(JSON.stringify({ 
      error: 'API key not configured on server. Add GEMINI_API_KEY or OPENAI_API_KEY to Vercel environment variables.' 
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

      console.log(`Making ${provider} chat request with`, messages.length, 'messages')
      
      if (provider === 'gemini') {
        // Gemini API
        const systemMsg = messages.find(m => m.role === 'system')
        const otherMsgs = messages.filter(m => m.role !== 'system')
        
        const contents = otherMsgs.map(m => ({ 
          role: m.role === 'assistant' ? 'model' : 'user', 
          parts: [{ text: m.content }] 
        }))
        
        const requestBody = {
          contents,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
          }
        }
        
        if (systemMsg) {
          requestBody.systemInstruction = { parts: [{ text: systemMsg.content }] }
        }
        
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          }
        )
        
        const data = await response.json()
        
        if (data.error) {
          console.error('Gemini API error:', data.error)
          return new Response(JSON.stringify({ 
            error: data.error.message || 'Gemini API error',
            details: data
          }), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        console.log('Gemini response received, content length:', content?.length || 0)
        
        return new Response(JSON.stringify({ content }), {
          headers: { 'Content-Type': 'application/json' },
        })
      } else {
        // OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
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
    }

    if (action === 'embed') {
      if (!input) {
        return new Response(JSON.stringify({ error: 'Missing input for embedding' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Embeddings still use OpenAI for consistency (same 1536 dimensions)
      if (!openaiKey) {
        return new Response(JSON.stringify({ 
          error: 'Embeddings require OPENAI_API_KEY in Vercel environment variables' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      console.log('Making OpenAI embedding request, input length:', input.length)
      
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
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
