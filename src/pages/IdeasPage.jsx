import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, ChevronUp, MessageSquare, Search, ArrowUpDown } from 'lucide-react'

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-slate-100 text-slate-700' },
  under_review: { label: 'Under Review', color: 'bg-yellow-100 text-yellow-700' },
  planned: { label: 'Planned', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-700' },
  complete: { label: 'Complete', color: 'bg-green-100 text-green-700' },
  closed: { label: 'Closed', color: 'bg-gray-100 text-gray-500' },
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('votes')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newIdea, setNewIdea] = useState({ title: '', description: '', category: '' })

  useEffect(() => { fetchIdeas() }, [])

  const fetchIdeas = async () => {
    setIsLoading(true)
    const { data, error } = await supabase.from('ideas').select('*').order('created_at', { ascending: false })
    if (!error) setIdeas(data || [])
    setIsLoading(false)
  }

  const handleCreateIdea = async () => {
    if (!newIdea.title.trim()) return
    const { error } = await supabase.from('ideas').insert({ title: newIdea.title, description: newIdea.description, category: newIdea.category || null })
    if (!error) { setIsCreateOpen(false); setNewIdea({ title: '', description: '', category: '' }); fetchIdeas() }
  }

  const handleVote = async (ideaId) => {
    const userIdentifier = 'user_' + Math.random().toString(36).slice(2)
    await supabase.from('votes').insert({ idea_id: ideaId, user_identifier: userIdentifier })
    fetchIdeas()
  }

  const filteredIdeas = ideas.filter((idea) => {
    const matchesSearch = idea.title?.toLowerCase().includes(searchQuery.toLowerCase()) || idea.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || idea.status === statusFilter
    return matchesSearch && matchesStatus
  }).sort((a, b) => {
    if (sortBy === 'votes') return (b.vote_count || 0) - (a.vote_count || 0)
    if (sortBy === 'feedback') return (b.feedback_count || 0) - (a.feedback_count || 0)
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ideas</h1>
          <p className="text-muted-foreground">{ideas.length} ideas • {ideas.filter(i => i.status === 'open').length} open</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Idea</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create New Idea</DialogTitle><DialogDescription>Add a new product idea</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <Input value={newIdea.title} onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })} placeholder="Title" />
              <Textarea value={newIdea.description} onChange={(e) => setNewIdea({ ...newIdea, description: e.target.value })} placeholder="Description" rows={4} />
              <Select value={newIdea.category} onValueChange={(v) => setNewIdea({ ...newIdea, category: v })}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Feature Request">Feature Request</SelectItem>
                  <SelectItem value="Bug">Bug</SelectItem>
                  <SelectItem value="Improvement">Improvement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateIdea}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search ideas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => <SelectItem key={key} value={key}>{config.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40"><ArrowUpDown className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="votes">Most Voted</SelectItem>
            <SelectItem value="feedback">Most Feedback</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading ideas...</p> : filteredIdeas.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No ideas yet</p><Button variant="outline" className="mt-4" onClick={() => setIsCreateOpen(true)}>Create the first idea</Button></CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {filteredIdeas.map((idea) => (
            <Card key={idea.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <Button variant="outline" size="sm" className="h-16 w-14 flex flex-col" onClick={() => handleVote(idea.id)}>
                    <ChevronUp className="h-5 w-5" /><span className="font-bold">{idea.vote_count || 0}</span>
                  </Button>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold">{idea.title}</h3>
                        {idea.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{idea.description}</p>}
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-medium ${STATUS_CONFIG[idea.status]?.color || ''}`}>{STATUS_CONFIG[idea.status]?.label || idea.status}</div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{idea.feedback_count || 0} feedback</span>
                      {idea.category && <Badge variant="outline" className="text-xs">{idea.category}</Badge>}
                    </div>
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
