import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, X, SlidersHorizontal, User, Sparkles, CheckSquare, Square, Users, Loader2, Check, Building2 } from 'lucide-react'
import TriagePanel from '@/components/TriagePanel'
import { cn } from '@/lib/utils'
import { batchSuggestOwners } from '@/lib/llm'

export default function FeedbackPage({ currentUser }) {
  const [feedback, setFeedback] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [productAreas, setProductAreas] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [triageFeedback, setTriageFeedback] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [isBulkAssigning, setIsBulkAssigning] = useState(false)
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false)
  
  // Suggestions modal
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false)
  const [suggestions, setSuggestions] = useState([]) // Array of { feedbackId, feedback, ownerId, ownerName, productAreaName, confidence, accepted }
  const [isApplyingSuggestions, setIsApplyingSuggestions] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('new')
  const [segmentFilter, setSegmentFilter] = useState('__all__')
  const [accountFilter, setAccountFilter] = useState('__all__')
  const [importanceFilter, setImportanceFilter] = useState('__all__')
  const [assignedFilter, setAssignedFilter] = useState('__all__')
  const [arrMin, setArrMin] = useState('')
  const [arrMax, setArrMax] = useState('')
  const [potentialArrMin, setPotentialArrMin] = useState('')
  const [potentialArrMax, setPotentialArrMax] = useState('')

  // Sorting
  const [sortOption, setSortOption] = useState('feedback_date_desc')

  useEffect(() => {
    fetchData()
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const items = filteredAndSortedFeedback
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(i => Math.min(i + 1, items.length - 1))
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(i => Math.max(i - 1, 0))
          break
        case 'l':
        case 'Enter':
          e.preventDefault()
          if (items[selectedIndex]) setTriageFeedback(items[selectedIndex])
          break
        case 'a':
          e.preventDefault()
          if (items[selectedIndex]) handleArchive(items[selectedIndex].id)
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, feedback, searchQuery, statusFilter])

  const fetchData = async () => {
    setIsLoading(true)
    
    let feedbackData = null
    
    // Try queries in order of most features to least, falling back as needed
    
    // Attempt 1: Full query with all new tables
    const { data: fullData, error: fullError } = await supabase
      .from('feedback')
      .select(`
        *,
        feedback_idea_links(idea_id, ideas(id, title, status)),
        assigned_to:team_members!feedback_assigned_to_id_fkey(id, name, email),
        suggested_owner:team_members!feedback_suggested_owner_id_fkey(id, name),
        product_area:product_areas(id, name, color)
      `)
      .order('created_at', { ascending: false })
    
    if (!fullError) {
      feedbackData = fullData
    } else {
      console.log('Full query failed, trying with idea links only:', fullError.message)
      
      // Attempt 2: Query with just idea links (no assignment tables)
      const { data: linksData, error: linksError } = await supabase
        .from('feedback')
        .select('*, feedback_idea_links(idea_id, ideas(id, title, status))')
        .order('created_at', { ascending: false })
      
      if (!linksError) {
        feedbackData = linksData
      } else {
        console.log('Links query failed, using basic query:', linksError.message)
        
        // Attempt 3: Basic query with no joins
        const { data: basicData } = await supabase
          .from('feedback')
          .select('*')
          .order('created_at', { ascending: false })
        feedbackData = basicData
      }
    }
    
    // Try to fetch team members (may not exist yet)
    const { data: members } = await supabase
      .from('team_members')
      .select('*')
      .eq('is_active', true)
      .order('name')
    
    // Try to fetch product areas (may not exist yet)
    const { data: areas } = await supabase
      .from('product_areas')
      .select('*, owner:team_members(id, name)')
      .order('name')
    
    if (feedbackData) {
      const transformedData = feedbackData.map(item => ({
        ...item,
        linked_ideas: (item.feedback_idea_links || []).map(link => link.ideas).filter(Boolean),
        ideas: item.feedback_idea_links?.[0]?.ideas || null,
      }))
      setFeedback(transformedData)
    }
    
    setTeamMembers(members || [])
    setProductAreas(areas || [])
    setIsLoading(false)
  }

  // Filter options
  const filterOptions = useMemo(() => {
    const segments = [...new Set(feedback.map(f => f.account_segment).filter(Boolean))].sort()
    const accounts = [...new Set(feedback.map(f => f.account_name).filter(Boolean))].sort()
    const importances = [...new Set(feedback.map(f => f.importance).filter(Boolean))].sort()
    return { segments, accounts, importances }
  }, [feedback])

  // Parse sort option
  const [sortField, sortDirection] = useMemo(() => {
    const parts = sortOption.split('_')
    const dir = parts.pop()
    const field = parts.join('_')
    return [field, dir]
  }, [sortOption])

  // Filter and sort feedback
  const filteredAndSortedFeedback = useMemo(() => {
    let result = feedback.filter((f) => {
      // Text search
      const matchesSearch = !searchQuery || 
        f.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.account_name?.toLowerCase().includes(searchQuery.toLowerCase())
      
      // "triaged" filter includes both triaged and linked statuses
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'triaged' ? (f.triage_status === 'triaged' || f.triage_status === 'linked') : f.triage_status === statusFilter)
      const matchesSegment = segmentFilter === '__all__' || f.account_segment === segmentFilter
      const matchesAccount = accountFilter === '__all__' || f.account_name === accountFilter
      const matchesImportance = importanceFilter === '__all__' || f.importance === importanceFilter
      
      // Assignment filter
      let matchesAssigned = true
      if (assignedFilter === 'unassigned') {
        matchesAssigned = !f.assigned_to_id
      } else if (assignedFilter === 'me' && currentUser) {
        matchesAssigned = f.assigned_to_id === currentUser.id
      } else if (assignedFilter !== '__all__') {
        matchesAssigned = f.assigned_to_id === assignedFilter
      }
      
      const arr = parseFloat(f.account_arr) || 0
      const matchesArrMin = !arrMin || arr >= parseFloat(arrMin)
      const matchesArrMax = !arrMax || arr <= parseFloat(arrMax)
      
      const potArr = parseFloat(f.potential_arr) || 0
      const matchesPotArrMin = !potentialArrMin || potArr >= parseFloat(potentialArrMin)
      const matchesPotArrMax = !potentialArrMax || potArr <= parseFloat(potentialArrMax)

      return matchesSearch && matchesStatus && matchesSegment && matchesAccount && 
             matchesImportance && matchesAssigned && matchesArrMin && matchesArrMax && 
             matchesPotArrMin && matchesPotArrMax
    })

    result.sort((a, b) => {
      let aVal, bVal
      switch (sortField) {
        case 'feedback_date':
          aVal = a.feedback_date ? new Date(a.feedback_date) : new Date(0)
          bVal = b.feedback_date ? new Date(b.feedback_date) : new Date(0)
          break
        case 'account_arr':
          aVal = parseFloat(a.account_arr) || 0
          bVal = parseFloat(b.account_arr) || 0
          break
        case 'potential_arr':
          aVal = parseFloat(a.potential_arr) || 0
          bVal = parseFloat(b.potential_arr) || 0
          break
        default:
          aVal = new Date(a.created_at)
          bVal = new Date(b.created_at)
      }
      if (sortDirection === 'asc') return aVal > bVal ? 1 : -1
      return aVal < bVal ? 1 : -1
    })

    return result
  }, [feedback, searchQuery, statusFilter, segmentFilter, accountFilter, 
      importanceFilter, assignedFilter, arrMin, arrMax, potentialArrMin, potentialArrMax, 
      sortField, sortDirection])

  // Counts - "triaged" includes both triaged and linked (consolidated)
  const counts = useMemo(() => ({
    new: feedback.filter(f => f.triage_status === 'new').length,
    triaged: feedback.filter(f => f.triage_status === 'triaged' || f.triage_status === 'linked').length,
    archived: feedback.filter(f => f.triage_status === 'archived').length,
    unassigned: feedback.filter(f => !f.assigned_to_id && f.triage_status !== 'archived').length,
  }), [feedback])

  const handleArchive = async (id) => {
    await supabase.from('feedback').update({ triage_status: 'archived' }).eq('id', id)
    // Update local state
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, triage_status: 'archived' } : f))
  }

  const handleTriageComplete = () => {
    setTriageFeedback(null)
    fetchData() // Full refresh after triage to get updated idea links
  }

  const handleAssign = async (feedbackId, userId) => {
    const assignedMember = userId ? teamMembers.find(m => m.id === userId) : null
    
    await supabase.from('feedback').update({ 
      assigned_to_id: userId || null,
      assigned_at: userId ? new Date().toISOString() : null
    }).eq('id', feedbackId)
    
    // Update local state immediately
    setFeedback(prev => prev.map(f => f.id === feedbackId ? { 
      ...f, 
      assigned_to_id: userId || null,
      assigned_to: assignedMember,
      assigned_at: userId ? new Date().toISOString() : null
    } : f))
  }

  const handleBulkAssign = async (userId) => {
    if (selectedIds.size === 0) return
    setIsBulkAssigning(true)
    
    const assignedMember = userId ? teamMembers.find(m => m.id === userId) : null
    
    await supabase.from('feedback').update({ 
      assigned_to_id: userId || null,
      assigned_at: userId ? new Date().toISOString() : null
    }).in('id', Array.from(selectedIds))
    
    // Update local state
    setFeedback(prev => prev.map(f => selectedIds.has(f.id) ? { 
      ...f, 
      assigned_to_id: userId || null,
      assigned_to: assignedMember,
      assigned_at: userId ? new Date().toISOString() : null
    } : f))
    
    setSelectedIds(new Set())
    setIsBulkAssigning(false)
  }

  const handleAcceptSuggestion = async (feedbackId, ownerId) => {
    const assignedMember = teamMembers.find(m => m.id === ownerId)
    
    await supabase.from('feedback').update({ 
      assigned_to_id: ownerId,
      assigned_at: new Date().toISOString()
    }).eq('id', feedbackId)
    
    // Update local state
    setFeedback(prev => prev.map(f => f.id === feedbackId ? { 
      ...f, 
      assigned_to_id: ownerId,
      assigned_to: assignedMember,
      assigned_at: new Date().toISOString()
    } : f))
  }

  const handleGenerateSuggestions = async () => {
    // Use current filtered list, but only unassigned items
    const unassignedInView = filteredAndSortedFeedback.filter(f => !f.assigned_to_id)
    
    if (unassignedInView.length === 0) {
      alert('No unassigned feedback in the current view')
      return
    }
    
    if (productAreas.length === 0) {
      alert('Please configure Product Areas first (in sidebar) to enable AI suggestions')
      return
    }
    
    // Check that at least one product area has an owner
    const areasWithOwners = productAreas.filter(a => a.owner_id)
    if (areasWithOwners.length === 0) {
      alert('Please assign owners to your Product Areas first')
      return
    }
    
    // Take top 100 from current filtered/sorted view
    const toProcess = unassignedInView.slice(0, 100)
    
    // Open modal immediately with empty state
    setSuggestions([])
    setShowSuggestionsModal(true)
    setIsGeneratingSuggestions(true)
    
    // Process in batches of 20, streaming results into modal
    const BATCH_SIZE = 20
    const batches = []
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      batches.push(toProcess.slice(i, i + BATCH_SIZE))
    }
    
    console.log(`Processing ${toProcess.length} items in ${batches.length} batches of ${BATCH_SIZE}...`)
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      
      try {
        console.log(`Batch ${batchIndex + 1}/${batches.length}: Processing ${batch.length} items...`)
        const results = await batchSuggestOwners(batch, productAreas, { batchSize: BATCH_SIZE })
        
        // Convert results to suggestions and add to modal
        const batchSuggestions = []
        for (const result of results) {
          if (result.ownerId) {
            const feedbackItem = feedback.find(f => f.id === result.feedbackId)
            const owner = teamMembers.find(m => m.id === result.ownerId)
            const area = productAreas.find(a => a.id === result.productAreaId)
            
            if (feedbackItem && owner) {
              batchSuggestions.push({
                feedbackId: result.feedbackId,
                feedback: feedbackItem,
                ownerId: result.ownerId,
                ownerName: owner.name,
                productAreaId: result.productAreaId,
                productAreaName: area?.name || 'Unknown',
                confidence: result.confidence || 0,
                reasoning: result.reasoning || 'No reasoning provided',
                accepted: (result.confidence || 0) >= 0.7
              })
            }
          }
        }
        
        // Stream results into modal
        if (batchSuggestions.length > 0) {
          setSuggestions(prev => [...prev, ...batchSuggestions])
        }
        
      } catch (error) {
        console.error(`Batch ${batchIndex + 1} failed:`, error)
      }
    }
    
    setIsGeneratingSuggestions(false)
    console.log('All batches complete')
  }
  
  const toggleSuggestionAccepted = (feedbackId) => {
    setSuggestions(prev => prev.map(s => 
      s.feedbackId === feedbackId ? { ...s, accepted: !s.accepted } : s
    ))
  }
  
  const handleApplySuggestions = async () => {
    const toApply = suggestions.filter(s => s.accepted)
    if (toApply.length === 0) {
      setShowSuggestionsModal(false)
      return
    }
    
    setIsApplyingSuggestions(true)
    
    const updatedFeedback = [...feedback]
    
    for (const suggestion of toApply) {
      // Update database
      await supabase.from('feedback').update({
        assigned_to_id: suggestion.ownerId,
        assigned_at: new Date().toISOString()
      }).eq('id', suggestion.feedbackId)
      
      // Update local state
      const idx = updatedFeedback.findIndex(f => f.id === suggestion.feedbackId)
      if (idx >= 0) {
        const assignedMember = teamMembers.find(m => m.id === suggestion.ownerId)
        updatedFeedback[idx] = {
          ...updatedFeedback[idx],
          assigned_to_id: suggestion.ownerId,
          assigned_to: assignedMember,
          assigned_at: new Date().toISOString()
        }
      }
    }
    
    setFeedback(updatedFeedback)
    setIsApplyingSuggestions(false)
    setShowSuggestionsModal(false)
    setSuggestions([])
  }

  const toggleSelection = (id, e) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === filteredAndSortedFeedback.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredAndSortedFeedback.map(f => f.id)))
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSegmentFilter('__all__')
    setAccountFilter('__all__')
    setImportanceFilter('__all__')
    setAssignedFilter('__all__')
    setArrMin('')
    setArrMax('')
    setPotentialArrMin('')
    setPotentialArrMax('')
  }

  const hasActiveFilters = segmentFilter !== '__all__' || accountFilter !== '__all__' || 
    importanceFilter !== '__all__' || assignedFilter !== '__all__' || arrMin || arrMax || 
    potentialArrMin || potentialArrMax

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
    if (num > 0) return `$${num.toFixed(0)}`
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Feedback Inbox</h1>
          <p className="text-muted-foreground">
            {counts.new > 0 ? (
              <><span className="font-medium text-blue-600">{counts.new} new</span> items need triage</>
            ) : 'All feedback triaged ✓'}
            {counts.unassigned > 0 && (
              <> · <span className="text-amber-600">{counts.unassigned} unassigned</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {productAreas.length > 0 && counts.unassigned > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleGenerateSuggestions}
              disabled={isGeneratingSuggestions}
            >
              {isGeneratingSuggestions ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />Suggest Owners</>
              )}
            </Button>
          )}
          <div className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-lg">
            <span className="font-medium">Keyboard:</span> J/K navigate • L triage
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={statusFilter === 'new' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setStatusFilter('new'); setSelectedIndex(0) }}
        >
          New ({counts.new})
        </Button>
        <Button
          variant={statusFilter === 'triaged' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setStatusFilter('triaged'); setSelectedIndex(0) }}
        >
          Triaged ({counts.triaged})
        </Button>
        <Button
          variant={statusFilter === 'archived' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setStatusFilter('archived'); setSelectedIndex(0) }}
        >
          Archived ({counts.archived})
        </Button>
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setStatusFilter('all'); setSelectedIndex(0) }}
        >
          All ({feedback.length})
        </Button>
      </div>

      {/* Search, Filters, Bulk Actions */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search title, description, or customers..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndex(0) }}
            className="pl-10"
          />
        </div>
        
        {/* Assignment Filter */}
        <Select value={assignedFilter} onValueChange={setAssignedFilter}>
          <SelectTrigger className="w-40">
            <Users className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Assigned to" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            <SelectItem value="unassigned">Unassigned ({counts.unassigned})</SelectItem>
            {currentUser && <SelectItem value="me">Assigned to Me</SelectItem>}
            {teamMembers.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {hasActiveFilters && <Badge variant="secondary" className="ml-1">
            {[segmentFilter !== '__all__', accountFilter !== '__all__', importanceFilter !== '__all__', 
              arrMin, arrMax, potentialArrMin, potentialArrMax].filter(Boolean).length}
          </Badge>}
        </Button>
        
        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by</span>
          <Select value={sortOption} onValueChange={setSortOption}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="feedback_date_desc">Feedback Date: Newest to Oldest</SelectItem>
              <SelectItem value="feedback_date_asc">Feedback Date: Oldest to Newest</SelectItem>
              <SelectItem value="account_arr_desc">Current ARR: Highest to Lowest</SelectItem>
              <SelectItem value="account_arr_asc">Current ARR: Lowest to Highest</SelectItem>
              <SelectItem value="potential_arr_desc">Potential ARR: Highest to Lowest</SelectItem>
              <SelectItem value="potential_arr_asc">Potential ARR: Lowest to Highest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-sm font-medium text-blue-900">
            {selectedIds.size} selected
          </span>
          <Select onValueChange={(v) => handleBulkAssign(v === '__unassign__' ? null : v)} disabled={isBulkAssigning}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Assign to..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassign__">Unassign</SelectItem>
              {teamMembers.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {/* Filter Panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-sm">Filters</h3>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />Clear all
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Segment</label>
                <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {filterOptions.segments.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Account</label>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {filterOptions.accounts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Importance</label>
                <Select value={importanceFilter} onValueChange={setImportanceFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {filterOptions.importances.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ARR Range</label>
                <div className="flex gap-2">
                  <Input placeholder="Min" type="number" value={arrMin} onChange={(e) => setArrMin(e.target.value)} className="w-20" />
                  <span className="self-center">-</span>
                  <Input placeholder="Max" type="number" value={arrMax} onChange={(e) => setArrMax(e.target.value)} className="w-20" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results count + Select All */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredAndSortedFeedback.length} items
        </p>
        {filteredAndSortedFeedback.length > 0 && (
          <Button variant="ghost" size="sm" onClick={selectAll}>
            {selectedIds.size === filteredAndSortedFeedback.length ? (
              <><CheckSquare className="h-4 w-4 mr-2" />Deselect All</>
            ) : (
              <><Square className="h-4 w-4 mr-2" />Select All</>
            )}
          </Button>
        )}
      </div>

      {/* Feedback List */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading feedback...</p>
      ) : filteredAndSortedFeedback.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
No feedback found
            </p>
            {hasActiveFilters && (
              <Button variant="outline" className="mt-4" onClick={clearFilters}>Clear filters</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredAndSortedFeedback.map((item, index) => {
            const isSelected = selectedIds.has(item.id)
            const isHighlighted = index === selectedIndex
            const displayTitle = item.title || item.description?.substring(0, 60) || 'Untitled'
            
            return (
              <div
                key={item.id}
                className={cn(
                  "group rounded-lg border bg-card p-4 transition-all cursor-pointer",
                  "hover:border-primary/50 hover:shadow-sm",
                  isHighlighted && "border-primary bg-primary/5 shadow-md",
                  isSelected && "ring-2 ring-blue-500"
                )}
                onClick={() => { setSelectedIndex(index); setTriageFeedback(item) }}
              >
                {/* Row 1: Checkbox + Customer + ARR + Assignment */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => toggleSelection(item.id, e)}
                      className="p-1 hover:bg-muted rounded"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    {item.triage_status === 'new' && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-sm">{item.account_name || 'Unknown'}</span>
                    {formatCurrency(item.account_arr) && (
                      <span className="text-sm font-semibold text-emerald-600">
                        {formatCurrency(item.account_arr)} ARR
                      </span>
                    )}
                    {formatCurrency(item.potential_arr) && (
                      <span className="text-sm font-medium text-blue-600">
                        +{formatCurrency(item.potential_arr)} Opp
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Inline Assignment Dropdown - only show if team members exist */}
                    {teamMembers.length > 0 && (() => {
                      const assignedName = item.assigned_to_id 
                        ? (teamMembers.find(m => m.id === item.assigned_to_id)?.name || item.assigned_to?.name || 'Unknown')
                        : 'Unassigned'
                      return (
                        <Select 
                          value={item.assigned_to_id || '__unassigned__'}
                          onValueChange={(value) => {
                            handleAssign(item.id, value === '__unassigned__' ? null : value)
                          }}
                        >
                          <SelectTrigger 
                            className={cn(
                              "h-7 text-xs w-auto min-w-[120px]",
                              item.assigned_to_id ? "border-green-200 bg-green-50" : "border-dashed"
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <User className="h-3 w-3 mr-1" />
                            <span className="truncate">{assignedName}</span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unassigned__">Unassigned</SelectItem>
                            {teamMembers.map(m => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name} {currentUser?.id === m.id && '(me)'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    })()}
                    
                    {/* AI Suggestion - show when unassigned and has suggestion */}
                    {!item.assigned_to_id && item.suggested_owner_id && item.suggestion_confidence >= 0.5 && (() => {
                      const suggestedName = teamMembers.find(m => m.id === item.suggested_owner_id)?.name || item.suggested_owner?.name || 'Unknown'
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-purple-600 border-purple-200 bg-purple-50 hover:bg-purple-100 gap-1"
                          onClick={(e) => { e.stopPropagation(); handleAcceptSuggestion(item.id, item.suggested_owner_id) }}
                          title={`Click to assign to ${suggestedName}`}
                        >
                          <Sparkles className="h-3 w-3" />
                          {suggestedName} ({Math.round(item.suggestion_confidence * 100)}%)
                        </Button>
                      )
                    })()}
                    
                    {/* Linked Ideas */}
                    {item.linked_ideas?.length > 0 && (
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
                        → {item.linked_ideas[0]?.title?.slice(0, 20)}...
                      </Badge>
                    )}
                    
                    {/* Status badges */}
                    {item.triage_status === 'new' && (
                      <Badge variant="secondary" className="text-[10px]">new</Badge>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h3 className="font-medium text-[15px] mb-1.5 line-clamp-1">{displayTitle}</h3>

                {/* Description */}
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{item.description}</p>

                {/* Metadata */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {item.account_segment && <span>{item.account_segment}</span>}
                    {item.importance && (
                      <span className={cn(
                        item.importance === 'High' && 'text-red-500',
                        item.importance === 'Medium' && 'text-amber-500'
                      )}>{item.importance}</span>
                    )}
                    {item.product_area && (
                      <Badge 
                        variant="outline" 
                        className="text-[10px]"
                        style={{ borderColor: item.product_area.color, color: item.product_area.color }}
                      >
                        {item.product_area.name}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "transition-opacity text-muted-foreground hover:text-foreground",
                      isHighlighted ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                    onClick={(e) => { e.stopPropagation(); setTriageFeedback(item) }}
                  >
                    Triage →
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Triage Panel */}
      <TriagePanel
        feedback={triageFeedback}
        isOpen={!!triageFeedback}
        onClose={() => setTriageFeedback(null)}
        onComplete={handleTriageComplete}
        teamMembers={teamMembers}
        productAreas={productAreas}
        currentUser={currentUser}
      />

      {/* AI Suggestions Modal */}
      <Dialog open={showSuggestionsModal} onOpenChange={setShowSuggestionsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Assignment Suggestions
              {isGeneratingSuggestions ? (
                <Badge variant="secondary" className="ml-2 text-xs font-normal animate-pulse">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin inline" />
                  Analyzing...
                </Badge>
              ) : (
                <Badge variant="outline" className="ml-2 text-xs font-normal">
                  {suggestions.length} matches
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {isGeneratingSuggestions 
                ? `Found ${suggestions.length} matches so far. Results appear as they're ready.`
                : 'Review the suggested assignments below. Check the ones you want to apply.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-0">
            {suggestions.length === 0 && isGeneratingSuggestions && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Analyzing feedback with AI...</p>
                <p className="text-xs mt-1">Results will appear here as they're ready</p>
              </div>
            )}
            {suggestions.length === 0 && !isGeneratingSuggestions && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">No matches found</p>
                <p className="text-xs mt-1">Try adding more keywords to your Product Areas</p>
              </div>
            )}
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.feedbackId}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  suggestion.accepted ? "bg-purple-50 border-purple-200" : "bg-muted/30 hover:bg-muted/50"
                )}
                onClick={() => toggleSuggestionAccepted(suggestion.feedbackId)}
              >
                {/* Checkbox */}
                <div className={cn(
                  "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                  suggestion.accepted ? "bg-purple-600 border-purple-600 text-white" : "border-muted-foreground/30"
                )}>
                  {suggestion.accepted && <Check className="h-3 w-3" />}
                </div>
                
                <div className="flex-1 min-w-0">
                  {/* Feedback info */}
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{suggestion.feedback.account_name || 'Unknown'}</span>
                    {suggestion.feedback.account_arr && (
                      <span className="text-xs text-emerald-600 font-medium">
                        {formatCurrency(suggestion.feedback.account_arr)} ARR
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                    {suggestion.feedback.title || suggestion.feedback.description?.slice(0, 100)}
                  </p>
                  
                  {/* Suggestion */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                      <User className="h-3 w-3 mr-1" />
                      {suggestion.ownerName}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {suggestion.productAreaName}
                    </Badge>
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "text-xs",
                        suggestion.confidence >= 0.8 ? "bg-green-100 text-green-700" :
                        suggestion.confidence >= 0.5 ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      )}
                    >
                      {Math.round(suggestion.confidence * 100)}% match
                    </Badge>
                  </div>
                  {suggestion.reasoning && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      "{suggestion.reasoning}"
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <div className="flex items-center gap-2 mr-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSuggestions(prev => prev.map(s => ({ ...s, accepted: true })))}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSuggestions(prev => prev.map(s => ({ ...s, accepted: false })))}
              >
                Clear All
              </Button>
            </div>
            <Button variant="outline" onClick={() => setShowSuggestionsModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleApplySuggestions}
              disabled={isApplyingSuggestions || suggestions.filter(s => s.accepted).length === 0}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isApplyingSuggestions ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Apply {suggestions.filter(s => s.accepted).length} Assignments
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
