export function getProvider() {
  if (import.meta.env.VITE_OPENAI_API_KEY) return 'openai'
  if (import.meta.env.VITE_ANTHROPIC_API_KEY) return 'anthropic'
  if (import.meta.env.VITE_GEMINI_API_KEY) return 'gemini'
  return null
}

export async function callLLM(messages, provider = null) {
  const p = provider || getProvider()
  if (!p) throw new Error('No LLM API key configured')
  
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

export async function suggestMatchingIdeas(description, ideas) {
  const ctx = ideas.map(i => `- ${i.id}: ${i.title}`).join('\n')
  const messages = [
    { role: 'system', content: 'Match feedback to ideas. Respond in JSON: {"matches":[{"id":"uuid","confidence":0.9,"reason":"why"}],"suggested_new_idea":{"should_create":true,"title":"title","description":"desc"}}' },
    { role: 'user', content: `Feedback: "${description}"\n\nIdeas:\n${ctx || 'None'}` }
  ]
  const response = await callLLM(messages)
  try {
    const match = response.match(/\{[\s\S]*\}/)
    return JSON.parse(match[0])
  } catch { return { matches: [], suggested_new_idea: { should_create: true, title: description.slice(0,100), description } } }
}

export async function summarizeFeedback(items) {
  const list = items.map((f, i) => `${i+1}. "${f.description}"`).join('\n')
  return callLLM([
    { role: 'system', content: 'Summarize key themes from customer feedback. Be concise.' },
    { role: 'user', content: `Summarize:\n${list}` }
  ])
}
