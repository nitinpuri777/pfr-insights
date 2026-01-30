import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { 
  MessageSquare, DollarSign, Building2, 
  Calendar, Sparkles, RefreshCw, Link2Off, TrendingUp,
  Search, Check, Loader2, Plus, Pencil, X
} from 'lucide-react'
import { summarizeFeedback, findEvidenceForIdea } from '@/lib/llm'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  backlog: { label: 'Backlog', color: 'bg-slate-100 text-slate-700' },
  under_consideration: { label: 'Under Consideration', color: 'bg-blue-100 text-blue-700' },
  planned: { label: 'Planned', color: 'bg-purple-100 text-purple-700' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  shipped: { label: 'Shipped', color: 'bg-green-100 text-green-700' },
  wont_do: { label: "Won't Do", color: 'bg-gray-100 text-gray-500' },
}

export default function IdeaDetail({ idea, isOpen, onClose, onUpdate }) {
  const [linkedFeedback, setLinkedFeedback] = useState([])
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(true)
  const [aiSummary, setAiSummary] = useState(idea?.summary || null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(idea?.status || 'backlog')
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  
  // Find more evidence state
  const [isFindingEvidence, setIsFindingEvidence] = useState(false)
  const [evidenceMatches, setEvidenceMatches] = useState([])
  const [selectedEvidence, setSelectedEvidence] = useState(new Set())
  const [isLinkingEvidence, setIsLinkingEvidence] = useState(false)
  const [showEvidenceDialog, setShowEvidenceDialog] = useState(false)

  useEffect(() => {
    if (idea?.id && isOpen) {
      fetchLinkedFeedback()
      setCurrentStatus(idea.status || 'backlog')
      setAiSummary(idea.summary || null)
      setEditTitle(idea.title)
      setEditDescription(idea.description || '')
    }
  }, [idea?.id, isOpen])

  const fetchLinkedFeedback = async () => {
    setIsLoadingFeedback(true)
    // Use the many-to-many relationship
    const { data } = await supabase
      .from('feedback_idea_links')
      .select('*, feedback:feedback_id(*)')
      .eq('idea_id', idea.id)
      .order('created_at', { ascending: false })
    
    // Extract the feedback items from the join
    const feedbackItems = (data || []).map(link => ({
      ...link.feedback,
      link_id: link.id,
      confidence: link.confidence,
    }))
    
    setLinkedFeedback(feedbackItems)
    setIsLoadingFeedback(false)
  }

  const handleStatusChange = async (newStatus) => {
    setCurrentStatus(newStatus)
    await supabase
      .from('ideas')
      .update({ status: newStatus })
      .eq('id', idea.id)
    onUpdate?.()
  }

  const handleUnlink = async (feedbackId) => {
    // Delete from the junction table
    await supabase
      .from('feedback_idea_links')
      .delete()
      .eq('feedback_id', feedbackId)
      .eq('idea_id', idea.id)
    
    fetchLinkedFeedback()
    onUpdate?.()
  }

  const handleGenerateSummary = async () => {
    if (linkedFeedback.length === 0) return
    setIsGeneratingSummary(true)
    try {
      const summary = await summarizeFeedback(linkedFeedback)
      setAiSummary(summary)
      // Save the summary to the database
      await supabase
        .from('ideas')
        .update({ summary, summary_updated_at: new Date().toISOString() })
        .eq('id', idea.id)
    } catch (error) {
      console.error('Failed to generate summary:', error)
    }
    setIsGeneratingSummary(false)
  }

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return
    await supabase
      .from('ideas')
      .update({ title: editTitle, description: editDescription })
      .eq('id', idea.id)
    setIsEditing(false)
    onUpdate?.()
  }

  const handleFindMoreEvidence = async () => {
    setShowEvidenceDialog(true)
    setIsFindingEvidence(true)
    setEvidenceMatches([])
    setSelectedEvidence(new Set())
    
    try {
      // Get IDs of already linked feedback
      const linkedIds = new Set(linkedFeedback.map(f => f.id))
      
      // Fetch unlinked feedback items
      const { data: feedback } = await supabase
        .from('feedback')
        .select('*')
        .in('triage_status', ['new', 'triaged'])
        .limit(100)
      
      // Filter out already linked items
      const unlinkedFeedback = (feedback || []).filter(f => !linkedIds.has(f.id))
      
      if (unlinkedFeedback.length > 0) {
        const result = await findEvidenceForIdea(idea.title, idea.description, unlinkedFeedback)
        
        // Enrich matches with full feedback data
        const enrichedMatches = (result.matches || []).map(match => {
          const feedbackItem = unlinkedFeedback.find(f => f.id === match.id)
          return { ...match, feedback: feedbackItem }
        }).filter(m => m.feedback)
        
        setEvidenceMatches(enrichedMatches)
        
        // Auto-select high confidence matches
        const highConfidence = enrichedMatches.filter(m => m.confidence >= 0.8)
        setSelectedEvidence(new Set(highConfidence.map(m => m.id)))
      }
    } catch (error) {
      console.error('Failed to find evidence:', error)
    }
    
    setIsFindingEvidence(false)
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

  const handleLinkEvidence = async () => {
    if (selectedEvidence.size === 0) return
    setIsLinkingEvidence(true)
    
    try {
      const links = Array.from(selectedEvidence).map(feedbackId => {
        const match = evidenceMatches.find(m => m.id === feedbackId)
        return {
          feedback_id: feedbackId,
          idea_id: idea.id,
          confidence: match?.confidence || null,
        }
      })
      
      await supabase.from('feedback_idea_links').insert(links)
      
      setShowEvidenceDialog(false)
      fetchLinkedFeedback()
      onUpdate?.()
    } catch (error) {
      console.error('Failed to link evidence:', error)
    }
    
    setIsLinkingEvidence(false)
  }

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
    if (num > 0) return `$${num.toFixed(0)}`
    return '$0'
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric' 
    })
  }

  // Calculate unique customers
  const uniqueCustomers = [...new Set(linkedFeedback.map(f => f.account_name).filter(Boolean))]
  const segments = [...new Set(linkedFeedback.map(f => f.account_segment).filter(Boolean))]
  
  // Calculate total ARR from linked feedback
  const totalARR = linkedFeedback.reduce((sum, f) => {
    // Dedupe by account - only count each account's ARR once
    return sum
  }, 0)
  
  // Better ARR calc - group by account
  const arrByAccount = {}
  linkedFeedback.forEach(f => {
    if (f.account_name && f.account_arr) {
      arrByAccount[f.account_name] = Math.max(
        arrByAccount[f.account_name] || 0,
        parseFloat(f.account_arr) || 0
      )
    }
  })
  const calculatedARR = Object.values(arrByAccount).reduce((a, b) => a + b, 0)

  if (!idea) return null

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {isEditing ? (
                  <div className="space-y-3">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="text-xl font-semibold"
                      placeholder="Idea title"
                    />
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description..."
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <DialogTitle className="text-xl">{idea.title}</DialogTitle>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditing(true)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    {idea.description && (
                      <p className="text-sm text-muted-foreground mt-2">{idea.description}</p>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select value={currentStatus} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogHeader>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-2xl font-bold">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                  {linkedFeedback.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Requests</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-2xl font-bold text-green-600">
                  <DollarSign className="h-5 w-5" />
                  {formatCurrency(calculatedARR || idea.total_arr)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total ARR</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-2xl font-bold">
                  <Building2 className="h-5 w-5 text-purple-500" />
                  {uniqueCustomers.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Customers</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="requests" className="mt-6">
            <TabsList>
              <TabsTrigger value="requests">Linked Feedback</TabsTrigger>
              <TabsTrigger value="summary">AI Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="requests" className="mt-4 space-y-3">
              {/* Actions Bar */}
              <div className="flex items-center justify-end">
                <Button variant="outline" size="sm" onClick={handleFindMoreEvidence}>
                  <Plus className="h-4 w-4 mr-2" />
                  Find More Evidence
                </Button>
              </div>
              
              {isLoadingFeedback ? (
                <p className="text-muted-foreground">Loading requests...</p>
              ) : linkedFeedback.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">No linked feedback yet</p>
                    <Button variant="outline" className="mt-4" onClick={handleFindMoreEvidence}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Find Evidence
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                linkedFeedback.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          {/* Customer header */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-sm">{item.account_name || 'Unknown'}</span>
                            {item.account_segment && (
                              <Badge variant="outline" className="text-xs">{item.account_segment}</Badge>
                            )}
                            {item.account_arr && (
                              <span className="text-sm text-green-600 font-medium">
                                {formatCurrency(item.account_arr)} ARR
                              </span>
                            )}
                            {item.confidence && (
                              <Badge variant="secondary" className="text-xs ml-auto">
                                {Math.round(item.confidence * 100)}% match
                              </Badge>
                            )}
                          </div>
                          
                          {/* Feedback text */}
                          <p className="text-sm leading-relaxed">{item.description}</p>
                          
                          {/* Metadata */}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            {item.feedback_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(item.feedback_date)}
                              </span>
                            )}
                            {item.source && (
                              <span>Source: {item.source}</span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleUnlink(item.id)}
                        >
                          <Link2Off className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="summary" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      AI-Generated Summary
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateSummary}
                      disabled={isGeneratingSummary || linkedFeedback.length === 0}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${isGeneratingSummary ? 'animate-spin' : ''}`} />
                      {aiSummary ? 'Regenerate' : 'Generate'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isGeneratingSummary ? (
                    <p className="text-muted-foreground">Analyzing feedback...</p>
                  ) : aiSummary ? (
                    <div className="prose prose-sm max-w-none">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{aiSummary}</p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Click "Generate" to create an AI summary of all linked customer feedback.
                      This will synthesize the key themes, use cases, and pain points.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Customer breakdown */}
              {uniqueCustomers.length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Customer Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {uniqueCustomers.slice(0, 10).map((customer) => {
                        const customerFeedback = linkedFeedback.filter(f => f.account_name === customer)
                        const arr = Math.max(...customerFeedback.map(f => parseFloat(f.account_arr) || 0))
                        const segment = customerFeedback[0]?.account_segment
                        return (
                          <div key={customer} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{customer}</span>
                              {segment && <Badge variant="outline" className="text-xs">{segment}</Badge>}
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-muted-foreground">{customerFeedback.length} request(s)</span>
                              <span className="text-green-600 font-medium">{formatCurrency(arr)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Segment breakdown */}
              {segments.length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Segment Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {segments.map((segment) => {
                        const count = linkedFeedback.filter(f => f.account_segment === segment).length
                        return (
                          <Badge key={segment} variant="outline" className="text-sm">
                            {segment}: {count}
                          </Badge>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Find More Evidence Dialog */}
      <Dialog open={showEvidenceDialog} onOpenChange={setShowEvidenceDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Find More Evidence
            </DialogTitle>
            <DialogDescription>
              Find additional feedback that supports "{idea?.title}"
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {isFindingEvidence ? (
              <div className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-500" />
                <p className="text-sm text-muted-foreground mt-3">Searching feedback...</p>
              </div>
            ) : evidenceMatches.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">No additional matching feedback found.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    Found {evidenceMatches.length} potentially related items
                  </p>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedEvidence(new Set(evidenceMatches.filter(m => m.confidence >= 0.8).map(m => m.id)))}
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
            <Button variant="outline" onClick={() => setShowEvidenceDialog(false)}>
              Cancel
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
        </DialogContent>
      </Dialog>
    </>
  )
}
