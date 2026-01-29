import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Filter, Link2, Archive } from 'lucide-react'

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { fetchFeedback() }, [])

  const fetchFeedback = async () => {
    setIsLoading(true)
    const { data, error } = await supabase.from('feedback').select('*').order('created_at', { ascending: false })
    if (!error) setFeedback(data || [])
    setIsLoading(false)
  }

  const filteredFeedback = feedback.filter((f) => {
    const matchesSearch = f.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || f.triage_status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleArchive = async (id) => {
    await supabase.from('feedback').update({ triage_status: 'archived' }).eq('id', id)
    fetchFeedback()
  }

  const newCount = feedback.filter(f => f.triage_status === 'new').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Feedback Inbox</h1>
          <p className="text-muted-foreground">{newCount > 0 ? `${newCount} new items need triage` : 'All feedback triaged'}</p>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search feedback..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="triaged">Triaged</SelectItem>
            <SelectItem value="linked">Linked</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading feedback...</p>
      ) : filteredFeedback.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No feedback found. Import some data first.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filteredFeedback.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm leading-relaxed">{item.description}</p>
                      <Badge variant={item.triage_status === 'new' ? 'info' : item.triage_status === 'linked' ? 'success' : 'secondary'}>{item.triage_status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      {item.account_segment && <span>{item.account_segment}</span>}
                      {item.importance && <Badge variant="outline" className="text-xs">{item.importance}</Badge>}
                      {item.account_arr && <span>ARR: {item.account_arr}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" variant="outline"><Link2 className="h-4 w-4 mr-1" />Triage</Button>
                    {item.triage_status !== 'archived' && (
                      <Button size="sm" variant="ghost" onClick={() => handleArchive(item.id)}><Archive className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
