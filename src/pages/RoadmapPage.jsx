import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, DollarSign, Building2 } from 'lucide-react'

const COLUMNS = [
  { status: 'under_consideration', title: 'Under Consideration', color: 'bg-blue-500' },
  { status: 'planned', title: 'Planned', color: 'bg-purple-500' },
  { status: 'in_progress', title: 'In Progress', color: 'bg-amber-500' },
  { status: 'shipped', title: 'Shipped', color: 'bg-green-500' },
]

export default function RoadmapPage() {
  const [ideas, setIdeas] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchIdeas = async () => {
      setIsLoading(true)
      const { data } = await supabase
        .from('ideas')
        .select('*')
        .in('status', ['under_consideration', 'planned', 'in_progress', 'shipped'])
        .order('total_arr', { ascending: false })
      setIdeas(data || [])
      setIsLoading(false)
    }
    fetchIdeas()
  }, [])

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
    if (num > 0) return `$${num.toFixed(0)}`
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading roadmap...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Roadmap</h1>
        <p className="text-muted-foreground">Product initiatives by stage</p>
      </div>
      
      <div className="grid grid-cols-4 gap-6 min-h-[600px]">
        {COLUMNS.map((col) => {
          const items = ideas.filter((i) => i.status === col.status)
          const totalARR = items.reduce((sum, i) => sum + (parseFloat(i.total_arr) || 0), 0)
          
          return (
            <div key={col.status} className="flex flex-col">
              {/* Column Header */}
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-3 h-3 rounded-full ${col.color}`} />
                <h2 className="font-semibold">{col.title}</h2>
                <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
              </div>
              
              {/* ARR Summary */}
              {totalARR > 0 && (
                <div className="text-xs text-green-600 font-medium mb-2 px-1">
                  {formatCurrency(totalARR)} ARR
                </div>
              )}
              
              {/* Column Content */}
              <div className="flex-1 space-y-3 bg-muted/30 rounded-lg p-3 min-h-[500px]">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No items</p>
                ) : (
                  items.map((idea) => (
                    <Card key={idea.id} className="bg-background hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <h3 className="font-medium text-sm">{idea.title}</h3>
                        {idea.description && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {idea.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {idea.feedback_count || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {idea.customer_count || 0}
                          </span>
                          {formatCurrency(idea.total_arr) && (
                            <span className="flex items-center gap-1 text-green-600 font-medium">
                              <DollarSign className="h-3 w-3" />
                              {formatCurrency(idea.total_arr)}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
