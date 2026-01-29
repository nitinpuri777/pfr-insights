import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronUp, MessageSquare } from 'lucide-react'

const COLUMNS = [
  { status: 'under_review', title: 'Under Review', color: 'bg-yellow-500' },
  { status: 'planned', title: 'Planned', color: 'bg-blue-500' },
  { status: 'in_progress', title: 'In Progress', color: 'bg-purple-500' },
  { status: 'complete', title: 'Complete', color: 'bg-green-500' },
]

export default function RoadmapPage() {
  const [ideas, setIdeas] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true)
      const { data } = await supabase.from('ideas').select('*').in('status', ['under_review', 'planned', 'in_progress', 'complete']).order('vote_count', { ascending: false })
      setIdeas(data || [])
      setIsLoading(false)
    }
    fetch()
  }, [])

  if (isLoading) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Loading roadmap...</p></div>

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Roadmap</h1><p className="text-muted-foreground">See what we're working on</p></div>
      <div className="grid grid-cols-4 gap-6 min-h-[600px]">
        {COLUMNS.map((col) => {
          const items = ideas.filter((i) => i.status === col.status)
          return (
            <div key={col.status} className="flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-3 h-3 rounded-full ${col.color}`} />
                <h2 className="font-semibold">{col.title}</h2>
                <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
              </div>
              <div className="flex-1 space-y-3 bg-muted/30 rounded-lg p-3 min-h-[500px]">
                {items.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No items</p> : items.map((idea) => (
                  <Card key={idea.id} className="bg-background">
                    <CardContent className="p-4">
                      <h3 className="font-medium text-sm">{idea.title}</h3>
                      {idea.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{idea.description}</p>}
                      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><ChevronUp className="h-3 w-3" />{idea.vote_count || 0}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{idea.feedback_count || 0}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
