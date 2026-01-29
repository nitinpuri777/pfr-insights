import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { X, Search, Sparkles, Plus, Archive, Building2, DollarSign, Calendar, User, Tag, Check, Loader2, ArrowRight } from 'lucide-react'
import { suggestMatchingIdeas, suggestIdeaFromFeedback } from '@/lib/llm'
import { cn } from '@/lib/utils'

export default function TriagePanel({ feedback, isOpen, onClose, onComplete }) {
  const [ideas, setIdeas] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isCreatingIdea, setIsCreatingIdea] = useState(false)
  const [newIdeaTitle, setNewIdeaTitle] = useState('')
  const [newIdeaDescription, setNewIdeaDescription] = useState('')
  const [isLinking, setIsLinking] = useState(false)
  
  // Multi-select state
  const [selectedIdeaIds, setSelectedIdeaIds] = useState(new Set())
  // Track which ideas this feedback is already linked to
  const [existingLinks, setExistingLinks] = useState(new Set())

  useEffect(() => {
    if (isOpen && feedback?.id) {
      fetchIdeas()
      fetchExistingLinks()
      setAiSuggestions(null)
      setSearchQuery('')
      setIsCreatingIdea(false)
      setNewIdeaTitle(feedback?.title || '')
      setNewIdeaDescription('')
      setSelectedIdeaIds(new Set())
      if (feedback?.description) {
        handleAiAnalyze()
      }
    }
  }, [isOpen, feedback?.id])

  const fetchIdeas = async () => {
    const { data } = await supabase.from('ideas').select('*').order('feedback_count', { ascending: false })
    setIdeas(data || [])
  }

  const fetchExistingLinks = async () => {
    if (!feedback?.id) return
    const { data } = await supabase
      .from('feedback_idea_links')
      .select('idea_id')
      .eq('feedback_id', feedback.id)
    setExistingLinks(new Set((data || []).map(l => l.idea_id)))
  }

  const handleAiAnalyze = async () => {
    if (!feedback?.description) return
    setIsAnalyzing(true)
    try {
      const suggestions = await suggestMatchingIdeas(feedback.description, ideas)
      setAiSuggestions(suggestions)
      
      // Auto-select high confidence matches
      if (suggestions?.matches?.length > 0) {
        const highConfidence = suggestions.matches.filter(m => m.confidence >= 0.8)
        const newSelected = new Set()
        highConfidence.forEach(m => {
          // Only auto-select if not already linked
          if (!existingLinks.has(m.id)) {
            newSelected.add(m.id)
          }
        })
        setSelectedIdeaIds(newSelected)
      }
      
      if (suggestions?.suggested_new_idea) {
        setNewIdeaTitle(suggestions.suggested_new_idea.title || '')
        setNewIdeaDescription(suggestions.suggested_new_idea.description || '')
      }
    } catch (error) {
      console.error('AI analysis failed:', error)
    }
    setIsAnalyzing(false)
  }

  const toggleIdeaSelection = (ideaId) => {
    // Don't allow toggling already-linked ideas
    if (existingLinks.has(ideaId)) return
    
    setSelectedIdeaIds(prev => {
      const next = new Set(prev)
      if (next.has(ideaId)) {
        next.delete(ideaId)
      } else {
        next.add(ideaId)
      }
      return next
    })
  }

  const handleLinkSelected = async () => {
    if (!feedback || selectedIdeaIds.size === 0) return
    setIsLinking(true)
    
    try {
      // Create links for all selected ideas
      const links = Array.from(selectedIdeaIds).map(ideaId => {
        const match = aiSuggestions?.matches?.find(m => m.id === ideaId)
        return {
          feedback_id: feedback.id,
          idea_id: ideaId,
          confidence: match?.confidence || null,
        }
      })
      
      await supabase.from('feedback_idea_links').insert(links)
      onComplete?.()
    } catch (error) {
      console.error('Failed to link:', error)
    }
    setIsLinking(false)
  }

  const handleCreateAndLink = async () => {
    if (!newIdeaTitle.trim() || !feedback) return
    setIsLinking(true)
    
    try {
      // Create the new idea
      const { data: newIdea, error: ideaError } = await supabase
        .from('ideas')
        .insert({ 
          title: newIdeaTitle, 
          description: newIdeaDescription,
          status: 'under_consideration'
        })
        .select()
        .single()

      if (!ideaError && newIdea) {
        // Link feedback to new idea
        await supabase.from('feedback_idea_links').insert({
          feedback_id: feedback.id,
          idea_id: newIdea.id,
        })
        onComplete?.()
      }
    } catch (error) {
      console.error('Failed to create and link:', error)
    }
    setIsLinking(false)
  }

  const handleArchive = async () => {
    if (!feedback) return
    await supabase.from('feedback').update({ triage_status: 'archived' }).eq('id', feedback.id)
    onComplete?.()
  }

  const filteredIdeas = ideas.filter(idea =>
    idea.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    idea.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
    if (num > 0) return `$${num.toFixed(0)}`
    return null
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return null
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const displayTitle = feedback?.title || (feedback?.description?.length > 60 
    ? feedback.description.substring(0, 60).split(' ').slice(0, -1).join(' ') + '...'
    : feedback?.description?.substring(0, 60)) || 'Untitled'

  if (!feedback) return null

  // Combine AI suggestions with search results
  const displayIdeas = searchQuery ? filteredIdeas : (
    aiSuggestions?.matches?.length > 0 
      ? aiSuggestions.matches.map(m => ({ ...ideas.find(i => i.id === m.id), confidence: m.confidence, reason: m.reason })).filter(Boolean)
      : filteredIdeas.slice(0, 6)
  )

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-[600px] max-w-[90vw] bg-background border-l shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold tracking-tight">Triage Feedback</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          
          {/* Customer & ARR Badge */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold">{feedback.account_name || 'Unknown Account'}</span>
            {feedback.account_segment && (
              <Badge variant="outline">{feedback.account_segment}</Badge>
            )}
            {formatCurrency(feedback.account_arr) && (
              <span className="text-green-600 font-semibold ml-auto">
                {formatCurrency(feedback.account_arr)} ARR
              </span>
            )}
          </div>
          
          {/* Title */}
          <div>
            <h3 className="text-xl font-semibold text-foreground leading-tight">
              {displayTitle}
            </h3>
          </div>

          {/* Full Description */}
          <div className="space-y-2">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {feedback.description}
            </p>
          </div>

          {/* Existing Links */}
          {existingLinks.size > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Already Linked To
              </label>
              <div className="space-y-1.5">
                {Array.from(existingLinks).map(ideaId => {
                  const idea = ideas.find(i => i.id === ideaId)
                  if (!idea) return null
                  return (
                    <div key={ideaId} className="flex items-center gap-2 p-2 rounded bg-blue-50 border border-blue-200">
                      <Check className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">{idea.title}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="h-px bg-border" />

          {/* Link to Ideas */}
          <div className="space-y-4">
            <label className="text-sm font-medium text-foreground">
              Link to Ideas {selectedIdeaIds.size > 0 && `(${selectedIdeaIds.size} selected)`}
            </label>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search ideas..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="pl-9"
              />
            </div>

            {/* AI Loading State */}
            {isAnalyzing && !searchQuery && (
              <div className="py-6 text-center">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4 animate-pulse text-purple-500" />
                  Finding matches...
                </div>
              </div>
            )}

            {/* Ideas List with Checkboxes */}
            {!isAnalyzing && displayIdeas.length > 0 && (
              <div className="space-y-2">
                {!searchQuery && aiSuggestions?.matches?.length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-purple-500" />
                    AI Suggested — select to link (can choose multiple)
                  </p>
                )}
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {displayIdeas.map((idea) => {
                    const isSelected = selectedIdeaIds.has(idea.id)
                    const isAlreadyLinked = existingLinks.has(idea.id)
                    
                    return (
                      <div
                        key={idea.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          isAlreadyLinked 
                            ? "bg-muted/30 opacity-50 cursor-not-allowed"
                            : isSelected 
                              ? "bg-primary/5 border-primary" 
                              : "hover:bg-muted/50"
                        )}
                        onClick={() => toggleIdeaSelection(idea.id)}
                      >
                        {/* Checkbox */}
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                          isAlreadyLinked
                            ? "bg-blue-100 border-blue-300"
                            : isSelected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                        )}>
                          {(isSelected || isAlreadyLinked) && <Check className="h-3 w-3" />}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{idea.title}</p>
                            {idea.confidence && (
                              <Badge variant="secondary" className="text-xs flex-shrink-0">
                                {Math.round(idea.confidence * 100)}%
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {idea.feedback_count || 0} requests · {formatCurrency(idea.total_arr) || '$0'} ARR
                          </p>
                          {idea.reason && (
                            <p className="text-xs text-purple-600 mt-1">→ {idea.reason}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* No matches state */}
            {!isAnalyzing && !searchQuery && aiSuggestions && displayIdeas.length === 0 && (
              <p className="text-sm text-muted-foreground py-2 text-center">
                No strong matches found. Try searching or create a new idea.
              </p>
            )}

            {/* Create New Idea */}
            <div className="pt-2">
              <Button 
                variant="outline" 
                className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => setIsCreatingIdea(!isCreatingIdea)}
              >
                <Plus className="h-4 w-4" />
                Create new idea from this
              </Button>

              {isCreatingIdea && (
                <div className="mt-3 space-y-3 p-4 bg-muted/30 rounded-lg">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Idea Title</label>
                    <Input 
                      placeholder="Idea title" 
                      value={newIdeaTitle} 
                      onChange={(e) => setNewIdeaTitle(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
                    <Textarea 
                      placeholder="Description" 
                      value={newIdeaDescription} 
                      onChange={(e) => setNewIdeaDescription(e.target.value)} 
                      rows={3}
                      className="text-sm resize-none"
                    />
                  </div>
                  <Button 
                    onClick={handleCreateAndLink} 
                    disabled={!newIdeaTitle.trim() || isLinking}
                  >
                    {isLinking ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create & Link'
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 bg-background">
          <div className="flex gap-3">
            <Button 
              variant="outline"
              className="flex-1 text-muted-foreground"
              onClick={handleArchive}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </Button>
            <Button 
              variant="ghost"
              className="text-muted-foreground"
              onClick={onClose}
            >
              Skip
            </Button>
            <Button 
              className="flex-1"
              onClick={handleLinkSelected}
              disabled={selectedIdeaIds.size === 0 || isLinking}
            >
              {isLinking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  Link & Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
