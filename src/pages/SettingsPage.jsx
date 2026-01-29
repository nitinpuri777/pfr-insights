import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, AlertCircle, Trash2, Sparkles, Loader2 } from 'lucide-react'
import { batchEmbedFeedback, batchEmbedIdeas } from '@/lib/embeddings'

export default function SettingsPage() {
  const [isDeleting, setIsDeleting] = useState(false)
  const [result, setResult] = useState(null)
  const [embeddingStats, setEmbeddingStats] = useState({ feedback: null, ideas: null })
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [isEmbedding, setIsEmbedding] = useState(false)
  const [embeddingProgress, setEmbeddingProgress] = useState(null)
  
  const llmProvider = import.meta.env.VITE_OPENAI_API_KEY ? 'OpenAI' : 
                      import.meta.env.VITE_ANTHROPIC_API_KEY ? 'Anthropic' : 
                      import.meta.env.VITE_GEMINI_API_KEY ? 'Gemini' : null

  useEffect(() => {
    fetchEmbeddingStats()
  }, [])

  const fetchEmbeddingStats = async () => {
    setIsLoadingStats(true)
    try {
      // Count feedback with and without embeddings
      const { count: totalFeedback } = await supabase
        .from('feedback')
        .select('*', { count: 'exact', head: true })
      
      const { count: embeddedFeedback } = await supabase
        .from('feedback')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null)

      // Count ideas with and without embeddings
      const { count: totalIdeas } = await supabase
        .from('ideas')
        .select('*', { count: 'exact', head: true })
      
      const { count: embeddedIdeas } = await supabase
        .from('ideas')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null)

      setEmbeddingStats({
        feedback: { total: totalFeedback || 0, embedded: embeddedFeedback || 0 },
        ideas: { total: totalIdeas || 0, embedded: embeddedIdeas || 0 },
      })
    } catch (error) {
      console.error('Failed to fetch embedding stats:', error)
    }
    setIsLoadingStats(false)
  }

  const handleGenerateEmbeddings = async () => {
    setIsEmbedding(true)
    setEmbeddingProgress({ type: 'feedback', processed: 0, total: 0 })
    
    try {
      // Embed feedback
      const feedbackResult = await batchEmbedFeedback((progress) => {
        setEmbeddingProgress({ type: 'feedback', ...progress })
      })
      
      // Embed ideas
      setEmbeddingProgress({ type: 'ideas', processed: 0, total: 0 })
      const ideasResult = await batchEmbedIdeas((progress) => {
        setEmbeddingProgress({ type: 'ideas', ...progress })
      })
      
      setResult({ 
        type: 'success', 
        text: `Generated ${feedbackResult.processed} feedback embeddings and ${ideasResult.processed} idea embeddings` 
      })
      
      // Refresh stats
      await fetchEmbeddingStats()
    } catch (error) {
      setResult({ type: 'error', text: error.message })
    }
    
    setIsEmbedding(false)
    setEmbeddingProgress(null)
  }

  const handleDelete = async (table) => {
    if (!window.confirm(`Delete ALL ${table}? This cannot be undone.`)) return
    setIsDeleting(true)
    setResult(null)
    try {
      // Also delete from junction table if deleting ideas
      if (table === 'ideas') {
        await supabase.from('feedback_idea_links').delete().not('id', 'is', null)
      }
      const { error } = await supabase.from(table).delete().not('id', 'is', null)
      if (error) throw error
      setResult({ type: 'success', text: `All ${table} deleted` })
      fetchEmbeddingStats()
    } catch (err) { 
      setResult({ type: 'error', text: err.message }) 
    }
    setIsDeleting(false)
  }

  const feedbackNeedsEmbedding = embeddingStats.feedback && 
    embeddingStats.feedback.total > embeddingStats.feedback.embedded
  const ideasNeedEmbedding = embeddingStats.ideas && 
    embeddingStats.ideas.total > embeddingStats.ideas.embedded

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your app</p>
      </div>

      {/* AI Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI Configuration</CardTitle>
          <CardDescription>LLM and embedding providers for AI features</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">LLM Provider</p>
              <p className="text-sm text-muted-foreground">
                {llmProvider ? `Using ${llmProvider}` : 'Not configured'}
              </p>
            </div>
            {llmProvider ? (
              <Badge className="bg-green-100 text-green-700">
                <Check className="h-3 w-3 mr-1" />Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <AlertCircle className="h-3 w-3 mr-1" />Not configured
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Add to .env.local: VITE_OPENAI_API_KEY, VITE_ANTHROPIC_API_KEY, or VITE_GEMINI_API_KEY
          </p>
        </CardContent>
      </Card>

      {/* Embeddings / Vector Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Embeddings
          </CardTitle>
          <CardDescription>
            Vector embeddings enable high-quality semantic search for matching feedback to ideas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingStats ? (
            <p className="text-sm text-muted-foreground">Loading stats...</p>
          ) : (
            <>
              {/* Feedback stats */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Feedback Embeddings</p>
                  <p className="text-sm text-muted-foreground">
                    {embeddingStats.feedback?.embedded || 0} / {embeddingStats.feedback?.total || 0} items embedded
                  </p>
                </div>
                {embeddingStats.feedback?.total === embeddingStats.feedback?.embedded && embeddingStats.feedback?.total > 0 ? (
                  <Badge className="bg-green-100 text-green-700">
                    <Check className="h-3 w-3 mr-1" />Complete
                  </Badge>
                ) : feedbackNeedsEmbedding ? (
                  <Badge variant="secondary">
                    {embeddingStats.feedback.total - embeddingStats.feedback.embedded} pending
                  </Badge>
                ) : null}
              </div>

              {/* Ideas stats */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Ideas Embeddings</p>
                  <p className="text-sm text-muted-foreground">
                    {embeddingStats.ideas?.embedded || 0} / {embeddingStats.ideas?.total || 0} items embedded
                  </p>
                </div>
                {embeddingStats.ideas?.total === embeddingStats.ideas?.embedded && embeddingStats.ideas?.total > 0 ? (
                  <Badge className="bg-green-100 text-green-700">
                    <Check className="h-3 w-3 mr-1" />Complete
                  </Badge>
                ) : ideasNeedEmbedding ? (
                  <Badge variant="secondary">
                    {embeddingStats.ideas.total - embeddingStats.ideas.embedded} pending
                  </Badge>
                ) : null}
              </div>

              {/* Generate button */}
              {(feedbackNeedsEmbedding || ideasNeedEmbedding) && (
                <div className="pt-2">
                  <Button 
                    onClick={handleGenerateEmbeddings} 
                    disabled={isEmbedding || !llmProvider}
                    className="w-full"
                  >
                    {isEmbedding ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Missing Embeddings
                      </>
                    )}
                  </Button>
                  {!llmProvider && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Configure an API key above to generate embeddings
                    </p>
                  )}
                </div>
              )}

              {/* Progress */}
              {embeddingProgress && (
                <div className="p-3 bg-purple-50 rounded-lg">
                  <p className="text-sm font-medium text-purple-900 mb-2">
                    Processing {embeddingProgress.type}: {embeddingProgress.processed}/{embeddingProgress.total}
                  </p>
                  <div className="h-2 bg-purple-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 transition-all" 
                      style={{ 
                        width: embeddingProgress.total > 0 
                          ? `${(embeddingProgress.processed / embeddingProgress.total) * 100}%` 
                          : '0%' 
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Database */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Database</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">Supabase</p>
              <p className="text-sm text-muted-foreground">
                {import.meta.env.VITE_SUPABASE_URL ? 'Connected' : 'Not configured'}
              </p>
            </div>
            {import.meta.env.VITE_SUPABASE_URL ? (
              <Badge className="bg-green-100 text-green-700">
                <Check className="h-3 w-3 mr-1" />Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <AlertCircle className="h-3 w-3 mr-1" />Not configured
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete all feedback</p>
              <p className="text-sm text-muted-foreground">Also removes all feedback-idea links</p>
            </div>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => handleDelete('feedback')} 
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />Delete
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete all ideas</p>
              <p className="text-sm text-muted-foreground">Also removes all feedback-idea links</p>
            </div>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => handleDelete('ideas')} 
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />Delete
            </Button>
          </div>
          {result && (
            <p className={result.type === 'success' ? 'text-green-600' : 'text-destructive'}>
              {result.text}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
