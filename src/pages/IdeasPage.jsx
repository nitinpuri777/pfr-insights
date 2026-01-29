import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, MessageSquare, Search, ArrowUpDown, DollarSign, Users, TrendingUp, Building2, Sparkles, Check, Loader2 } from 'lucide-react'
import IdeaDetail from '@/components/IdeaDetail'
import { findEvidenceForIdea, embedIdea } from '@/lib/llm'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  backlog: { label: 'Backlog', color: 'bg-slate-100 text-slate-700', dotColor: 'bg-slate-400' },
  under_consideration: { label: 'Under Consideration', color: 'bg-blue-100 text-blue-700', dotColor: 'bg-blue-500' },
  planned: { label: 'Planned', color: 'bg-purple-100 text-purple-700', dotColor: 'bg-purple-500' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700', dotColor: 'bg-amber-500' },
  shipped: { label: 'Shipped', color: 'bg-green-100 text-green-700', dotColor: 'bg-green-500' },
  wont_do: { label: "Won't Do", color: 'bg-gray-100 text-gray-500', dotColor: 'bg-gray-400' },
}

// Calculate idea score based on various factors
function calculateScore(idea) {
  const feedbackWeight = 15
  const arrWeight = 0.0001 // $10K ARR = 1 point
  const customerWeight = 20
  
  const feedbackScore = (idea.feedback_count || 0) * feedbackWeight
  const arrScore = (idea.total_arr || 0) * arrWeight
  const customerScore = (idea.customer_count || 0) * customerWeight
  
  return Math.round(feedbackScore + arrScore + customerScore)
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('score')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState(null)
  const [newIdea, setNewIdea] = useState({ title: '', description: '', status: 'under_consideration' })
  
  // Evidence finding state
  const [createdIdea, setCreatedIdea] = useState(null)
  const [evidenceMatches, setEvidenceMatches] = useState([])
  const [isSearchingEvidence, setIsSearchingEvidence] = useState(false)
  const [selectedEvidence, setSelectedEvidence] = useState(new Set())
  const [isLinkingEvidence, setIsLinkingEvidence] = useState(false)

  useEffect(() => { fetchIdeas() }, [])

  const fetchIdeas = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) {
      const ideasWithScores = (data || []).map(idea => ({
        ...idea,
        score: calculateScore(idea)
      }))
      setIdeas(ideasWithScores)
    }
    setIsLoading(false)
  }

  const handleCreateIdea = async () => {
    if (!newIdea.title.trim()) return
    
    const { data, error } = await supabase.from('ideas').insert({
      title: newIdea.title,
      description: newIdea.description,
      status: newIdea.status,
    }).select().single()
    
    if (!error && data) {
      setCreatedIdea(data)
      
      // Generate embedding for the idea (for reverse matching)
      embedIdea(data.id, data.title, data.description).catch(console.error)
      
      // Start searching for evidence immediately
      findEvidence(data)
    }
  }

  const findEvidence = async (idea) => {
    setIsSearchingEvidence(true)
    setEvidenceMatches([])
    setSelectedEvidence(new Set())
    
    try {
      // Use embedding-based search - no need to fetch all feedback first
      // The findEvidenceForIdea function now uses vector search internally
      const result = await findEvidenceForIdea(idea.title, idea.description, [], {
        useEmbeddings: true,
        linkedFeedbackIds: [],
      })
      
      // If embedding search returned results, use them
      if (result.matches && result.matches.length > 0) {
        setEvidenceMatches(result.matches)
        
        // Auto-select high confidence matches (>= 80%)
        const highConfidence = result.matches.filter(m => m.confidence >= 0.8)
        setSelectedEvidence(new Set(highConfidence.map(m => m.id)))
      } else {
        // Fallback: fetch feedback and try LLM-only matching
        const { data: feedback } = await supabase
          .from('feedback')
          .select('*')
          .in('triage_status', ['new', 'triaged'])
          .limit(100)
        
        if (feedback && feedback.length > 0) {
          const fallbackResult = await findEvidenceForIdea(idea.title, idea.description, feedback, {
            useEmbeddings: false,
          })
          
          const enrichedMatches = (fallbackResult.matches || []).map(match => {
            const feedbackItem = match.feedback || feedback.find(f => f.id === match.id)
            return { ...match, feedback: feedbackItem }
          }).filter(m => m.feedback)
          
          setEvidenceMatches(enrichedMatches)
          
          const highConfidence = enrichedMatches.filter(m => m.confidence >= 0.8)
          setSelectedEvidence(new Set(highConfidence.map(m => m.id)))
        }
      }
    } catch (error) {
      console.error('Failed to find evidence:', error)
    }
    
    setIsSearchingEvidence(false)
  }

  const handleLinkEvidence = async () => {
    if (!createdIdea || selectedEvidence.size === 0) return
    
    setIsLinkingEvidence(true)
    
    try {
      // Create links for selected feedback items
      const links = Array.from(selectedEvidence).map(feedbackId => {
        const match = evidenceMatches.find(m => m.id === feedbackId)
        return {
          feedback_id: feedbackId,
          idea_id: createdIdea.id,
          confidence: match?.confidence || null,
        }
      })
      
      await supabase.from('feedback_idea_links').insert(links)
      
      // Close dialog and refresh
      handleCloseCreateDialog()
      fetchIdeas()
    } catch (error) {
      console.error('Failed to link evidence:', error)
    }
    
    setIsLinkingEvidence(false)
  }

  const handleCloseCreateDialog = () => {
    setIsCreateOpen(false)
    setCreatedIdea(null)
    setEvidenceMatches([])
    setSelectedEvidence(new Set())
    setNewIdea({ title: '', description: '', status: 'under_consideration' })
    fetchIdeas()
  }

  const toggleEvidence = (feedbackId) => {
    setSelectedEvidence(prev => {
      const next = new Set(prev)
      if (next.has(feedbackId)) {
        next.delete(feedbackId)
      } else {
        next.add(feedbackId)
      }
      return next
    })
  }

  const selectAllAboveThreshold = (threshold) => {
    const matching = evidenceMatches.filter(m => m.confidence >= threshold)
    setSelectedEvidence(new Set(matching.map(m => m.id)))
  }

  const filteredIdeas = ideas
    .filter((idea) => {
      const matchesSearch = 
        idea.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        idea.description?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || idea.status === statusFilter
      return matchesSearch && matchesStatus
    })
    .sort((a, b) => {
      if (sortBy === 'score') return (b.score || 0) - (a.score || 0)
      if (sortBy === 'feedback') return (b.feedback_count || 0) - (a.feedback_count || 0)
      if (sortBy === 'arr') return (b.total_arr || 0) - (a.total_arr || 0)
      if (sortBy === 'customers') return (b.customer_count || 0) - (a.customer_count || 0)
      return new Date(b.created_at) - new Date(a.created_at)
    })

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
    if (num > 0) return `$${num.toFixed(0)}`
    return '$0'
  }

  // Group ideas by status
  const groupedIdeas = {}
  Object.keys(STATUS_CONFIG).forEach(status => {
    groupedIdeas[status] = filteredIdeas.filter(i => i.status === status)
  })

  const totalARR = ideas.reduce((sum, i) => sum + (i.total_arr || 0), 0)
  const totalRequests = ideas.reduce((sum, i) => sum + (i.feedback_count || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ideas</h1>
          <p className="text-muted-foreground">
            {ideas.length} ideas · {totalRequests} requests · {formatCurrency(totalARR)} total ARR
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          if (!open) handleCloseCreateDialog()
          else setIsCreateOpen(true)
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Idea</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            {!createdIdea ? (
              // Step 1: Create Idea Form
              <>
                <DialogHeader>
                  <DialogTitle>Create New Idea</DialogTitle>
                  <DialogDescription>
                    Define a product hypothesis. We'll help you find supporting evidence.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Title *</label>
                    <Input
                      value={newIdea.title}
                      onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
                      placeholder="e.g., Offline Mode for Field Technicians"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Description</label>
                    <Textarea
                      value={newIdea.description}
                      onChange={(e) => setNewIdea({ ...newIdea, description: e.target.value })}
                      placeholder="Describe what this would enable and why it matters..."
                      rows={4}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Initial Status</label>
                    <div className="flex flex-wrap gap-2">
                      {['backlog', 'under_consideration', 'planned', 'in_progress'].map(status => (
                        <Button
                          key={status}
                          type="button"
                          variant={newIdea.status === status ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setNewIdea({ ...newIdea, status })}
                        >
                          {STATUS_CONFIG[status].label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={handleCloseCreateDialog}>Cancel</Button>
                  <Button onClick={handleCreateIdea} disabled={!newIdea.title.trim()}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Create & Find Evidence
                  </Button>
                </DialogFooter>
              </>
            ) : (
              // Step 2: Find Evidence
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    Finding Related Feedback
                  </DialogTitle>
                  <DialogDescription>
                    Select feedback items that support "{createdIdea.title}"
                  </DialogDescription>
                </DialogHeader>
                
                <div className="py-4 space-y-4">
                  {isSearchingEvidence ? (
                    <div className="py-12 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-500" />
                      <p className="text-sm text-muted-foreground mt-3">Analyzing feedback...</p>
                    </div>
                  ) : evidenceMatches.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-muted-foreground">No matching feedback found.</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        You can link feedback later from the Ideas detail view.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          Found {evidenceMatches.length} potentially related items
                        </p>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => selectAllAboveThreshold(0.8)}
                        >
                          Select All Above 80%
                        </Button>
                      </div>
                      
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {evidenceMatches.map((match) => (
                          <div
                            key={match.id}
                            className={cn(
                              "p-3 rounded-lg border cursor-pointer transition-colors",
                              selectedEvidence.has(match.id) 
                                ? "bg-primary/5 border-primary" 
                                : "hover:bg-muted/50"
                            )}
                            onClick={() => toggleEvidence(match.id)}
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                                selectedEvidence.has(match.id)
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-muted-foreground/30"
                              )}>
                                {selectedEvidence.has(match.id) && <Check className="h-3 w-3" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm">
                                    {match.feedback?.account_name || 'Unknown'}
                                  </span>
                                  {match.feedback?.account_arr && (
                                    <span className="text-sm text-green-600 font-medium">
                                      {formatCurrency(match.feedback.account_arr)}
                                    </span>
                                  )}
                                  <Badge variant="secondary" className="ml-auto text-xs">
                                    {Math.round(match.confidence * 100)}% match
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {match.feedback?.description}
                                </p>
                                {match.reason && (
                                  <p className="text-xs text-purple-600 mt-1">
                                    → {match.reason}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={handleCloseCreateDialog}>
                    Skip for Now
                  </Button>
                  <Button 
                    onClick={handleLinkEvidence} 
                    disabled={selectedEvidence.size === 0 || isLinkingEvidence}
                  >
                    {isLinkingEvidence ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Linking...
                      </>
                    ) : (
                      <>Link Selected ({selectedEvidence.size})</>
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ideas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-44">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Highest Score</SelectItem>
            <SelectItem value="feedback">Most Requests</SelectItem>
            <SelectItem value="arr">Highest ARR</SelectItem>
            <SelectItem value="customers">Most Customers</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Ideas List */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading ideas...</p>
      ) : filteredIdeas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No ideas yet</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsCreateOpen(true)}>
              Create the first idea
            </Button>
          </CardContent>
        </Card>
      ) : statusFilter === 'all' ? (
        // Grouped view by status
        <div className="space-y-8">
          {Object.entries(groupedIdeas).map(([status, statusIdeas]) => {
            if (statusIdeas.length === 0) return null
            const config = STATUS_CONFIG[status]
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("w-2 h-2 rounded-full", config.dotColor)} />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {config.label} ({statusIdeas.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {statusIdeas.map((idea) => (
                    <IdeaCard 
                      key={idea.id} 
                      idea={idea} 
                      onClick={() => setSelectedIdea(idea)}
                      formatCurrency={formatCurrency}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        // Flat list for filtered view
        <div className="space-y-3">
          {filteredIdeas.map((idea) => (
            <IdeaCard 
              key={idea.id} 
              idea={idea} 
              onClick={() => setSelectedIdea(idea)}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      )}

      {/* Idea Detail Modal */}
      {selectedIdea && (
        <IdeaDetail
          idea={selectedIdea}
          isOpen={!!selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onUpdate={fetchIdeas}
        />
      )}
    </div>
  )
}

// Extracted IdeaCard component for cleaner code
function IdeaCard({ idea, onClick, formatCurrency }) {
  const config = STATUS_CONFIG[idea.status] || STATUS_CONFIG.backlog
  
  return (
    <Card
      className="hover:shadow-md transition-all cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-semibold">{idea.title}</h3>
              <Badge className={cn("flex-shrink-0", config.color)}>
                {config.label}
              </Badge>
            </div>
            {idea.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {idea.description}
              </p>
            )}

            {/* Stats row */}
            <div className="flex items-center gap-6 mt-4">
              <div className="flex items-center gap-1.5 text-sm">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{idea.feedback_count || 0}</span>
                <span className="text-muted-foreground">requests</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-600">{formatCurrency(idea.total_arr)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{idea.customer_count || 0}</span>
                <span className="text-muted-foreground">customers</span>
              </div>
              {/* Score indicator */}
              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-1 text-sm">
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                  <span className="font-bold text-purple-600">{idea.score || 0}</span>
                </div>
                {/* Score bar */}
                <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${Math.min(100, idea.score)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
