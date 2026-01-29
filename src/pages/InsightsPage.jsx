import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Lightbulb, TrendingUp, DollarSign } from 'lucide-react'

export default function InsightsPage() {
  const [stats, setStats] = useState({ totalFeedback: 0, newFeedback: 0, totalIdeas: 0, openIdeas: 0, totalVotes: 0, totalARR: 0 })
  const [topIdeas, setTopIdeas] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true)
      const { data: feedback } = await supabase.from('feedback').select('*')
      const { data: ideas } = await supabase.from('ideas').select('*').order('vote_count', { ascending: false }).limit(5)
      
      if (feedback) {
        const totalARR = feedback.reduce((sum, f) => sum + (parseFloat(f.account_arr) || 0), 0)
        setStats({
          totalFeedback: feedback.length,
          newFeedback: feedback.filter(f => f.triage_status === 'new').length,
          totalIdeas: ideas?.length || 0,
          openIdeas: ideas?.filter(i => i.status === 'open').length || 0,
          totalVotes: ideas?.reduce((sum, i) => sum + (i.vote_count || 0), 0) || 0,
          totalARR,
        })
      }
      setTopIdeas(ideas || [])
      setIsLoading(false)
    }
    fetch()
  }, [])

  const formatCurrency = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v || 0)

  if (isLoading) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Loading...</p></div>

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Insights</h1><p className="text-muted-foreground">Overview of feedback and ideas</p></div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="p-3 bg-blue-100 rounded-lg"><MessageSquare className="h-6 w-6 text-blue-600" /></div><div><p className="text-2xl font-bold">{stats.totalFeedback}</p><p className="text-sm text-muted-foreground">Total Feedback</p></div></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="p-3 bg-purple-100 rounded-lg"><Lightbulb className="h-6 w-6 text-purple-600" /></div><div><p className="text-2xl font-bold">{stats.totalIdeas}</p><p className="text-sm text-muted-foreground">Ideas</p></div></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="p-3 bg-green-100 rounded-lg"><TrendingUp className="h-6 w-6 text-green-600" /></div><div><p className="text-2xl font-bold">{stats.totalVotes}</p><p className="text-sm text-muted-foreground">Total Votes</p></div></div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="p-3 bg-yellow-100 rounded-lg"><DollarSign className="h-6 w-6 text-yellow-600" /></div><div><p className="text-2xl font-bold">{formatCurrency(stats.totalARR)}</p><p className="text-sm text-muted-foreground">Customer ARR</p></div></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Top Voted Ideas</CardTitle></CardHeader>
        <CardContent>
          {topIdeas.length === 0 ? <p className="text-sm text-muted-foreground">No ideas yet</p> : (
            <div className="space-y-3">
              {topIdeas.map((idea, i) => (
                <div key={idea.id} className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</span>
                  <div className="flex-1"><p className="text-sm font-medium truncate">{idea.title}</p><p className="text-xs text-muted-foreground">{idea.vote_count || 0} votes</p></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
