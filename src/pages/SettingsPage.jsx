import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, AlertCircle, Trash2 } from 'lucide-react'

export default function SettingsPage() {
  const [isDeleting, setIsDeleting] = useState(false)
  const [result, setResult] = useState(null)
  
  const llmProvider = import.meta.env.VITE_OPENAI_API_KEY ? 'openai' : import.meta.env.VITE_ANTHROPIC_API_KEY ? 'anthropic' : import.meta.env.VITE_GEMINI_API_KEY ? 'gemini' : null

  const handleDelete = async (table) => {
    if (!window.confirm(`Delete ALL ${table}? This cannot be undone.`)) return
    setIsDeleting(true)
    setResult(null)
    try {
      const { error } = await supabase.from(table).delete().not('id', 'is', null)
      if (error) throw error
      setResult({ type: 'success', text: `All ${table} deleted` })
    } catch (err) { setResult({ type: 'error', text: err.message }) }
    setIsDeleting(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div><h1 className="text-2xl font-bold">Settings</h1><p className="text-muted-foreground">Configure your app</p></div>

      <Card>
        <CardHeader><CardTitle className="text-lg">AI Provider</CardTitle><CardDescription>LLM for AI features</CardDescription></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div><p className="font-medium">Current Provider</p><p className="text-sm text-muted-foreground">{llmProvider ? `Using ${llmProvider}` : 'Not configured'}</p></div>
            {llmProvider ? <Badge variant="success"><Check className="h-3 w-3 mr-1" />Connected</Badge> : <Badge variant="warning"><AlertCircle className="h-3 w-3 mr-1" />Not configured</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-4">Add to .env.local: VITE_OPENAI_API_KEY, VITE_ANTHROPIC_API_KEY, or VITE_GEMINI_API_KEY</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Database</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div><p className="font-medium">Supabase</p><p className="text-sm text-muted-foreground">{import.meta.env.VITE_SUPABASE_URL ? 'Connected' : 'Not configured'}</p></div>
            {import.meta.env.VITE_SUPABASE_URL ? <Badge variant="success"><Check className="h-3 w-3 mr-1" />Connected</Badge> : <Badge variant="warning"><AlertCircle className="h-3 w-3 mr-1" />Not configured</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader><CardTitle className="text-lg text-destructive">Danger Zone</CardTitle><CardDescription>Irreversible actions</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="font-medium">Delete all feedback</p></div>
            <Button variant="destructive" size="sm" onClick={() => handleDelete('feedback')} disabled={isDeleting}><Trash2 className="h-4 w-4 mr-2" />Delete</Button>
          </div>
          <div className="flex items-center justify-between">
            <div><p className="font-medium">Delete all ideas</p></div>
            <Button variant="destructive" size="sm" onClick={() => handleDelete('ideas')} disabled={isDeleting}><Trash2 className="h-4 w-4 mr-2" />Delete</Button>
          </div>
          {result && <p className={result.type === 'success' ? 'text-green-600' : 'text-destructive'}>{result.text}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
