import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import TriagePanel from '@/components/TriagePanel'
import { cn } from '@/lib/utils'

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [triageFeedback, setTriageFeedback] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('new')
  const [segmentFilter, setSegmentFilter] = useState('__all__')
  const [accountFilter, setAccountFilter] = useState('__all__')
  const [importanceFilter, setImportanceFilter] = useState('__all__')
  const [arrMin, setArrMin] = useState('')
  const [arrMax, setArrMax] = useState('')
  const [potentialArrMin, setPotentialArrMin] = useState('')
  const [potentialArrMax, setPotentialArrMax] = useState('')

  // Sorting - combined field + direction
  const [sortOption, setSortOption] = useState('created_at_desc')

  useEffect(() => {
    fetchFeedback()
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

  const fetchFeedback = async () => {
    setIsLoading(true)
    // Fetch feedback with linked ideas through the many-to-many relationship
    const { data, error } = await supabase
      .from('feedback')
      .select('*, feedback_idea_links(idea_id, ideas(id, title, status))')
      .order('created_at', { ascending: false })
    
    if (!error) {
      // Transform the data to include linked ideas in a more accessible format
      const transformedData = (data || []).map(item => ({
        ...item,
        // Extract linked ideas from the junction table
        linked_ideas: (item.feedback_idea_links || [])
          .map(link => link.ideas)
          .filter(Boolean),
        // Keep backward compat - use first linked idea if exists
        ideas: item.feedback_idea_links?.[0]?.ideas || null,
      }))
      setFeedback(transformedData)
    }
    setIsLoading(false)
  }

  // Extract unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const segments = [...new Set(feedback.map(f => f.account_segment).filter(Boolean))].sort()
    const accounts = [...new Set(feedback.map(f => f.account_name).filter(Boolean))].sort()
    const importances = [...new Set(feedback.map(f => f.importance).filter(Boolean))].sort()
    return { segments, accounts, importances }
  }, [feedback])

  // Parse sort option into field and direction
  const [sortField, sortDirection] = useMemo(() => {
    const parts = sortOption.split('_')
    const dir = parts.pop() // last part is direction (asc/desc)
    const field = parts.join('_') // rest is field name
    return [field, dir]
  }, [sortOption])

  // Filter and sort feedback
  const filteredAndSortedFeedback = useMemo(() => {
    let result = feedback.filter((f) => {
      // Text search - include title
      const matchesSearch = !searchQuery || 
        f.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.account_name?.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesStatus = statusFilter === 'all' || f.triage_status === statusFilter
      const matchesSegment = segmentFilter === '__all__' || f.account_segment === segmentFilter
      const matchesAccount = accountFilter === '__all__' || f.account_name === accountFilter
      const matchesImportance = importanceFilter === '__all__' || f.importance === importanceFilter
      
      const arr = parseFloat(f.account_arr) || 0
      const matchesArrMin = !arrMin || arr >= parseFloat(arrMin)
      const matchesArrMax = !arrMax || arr <= parseFloat(arrMax)
      
      const potArr = parseFloat(f.potential_arr) || 0
      const matchesPotArrMin = !potentialArrMin || potArr >= parseFloat(potentialArrMin)
      const matchesPotArrMax = !potentialArrMax || potArr <= parseFloat(potentialArrMax)

      return matchesSearch && matchesStatus && matchesSegment && matchesAccount && 
             matchesImportance && matchesArrMin && matchesArrMax && matchesPotArrMin && matchesPotArrMax
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
        case 'created_at':
        default:
          aVal = new Date(a.created_at)
          bVal = new Date(b.created_at)
      }
      if (sortDirection === 'asc') return aVal > bVal ? 1 : -1
      return aVal < bVal ? 1 : -1
    })

    return result
  }, [feedback, searchQuery, statusFilter, segmentFilter, accountFilter, importanceFilter, 
      arrMin, arrMax, potentialArrMin, potentialArrMax, sortField, sortDirection])

  const handleArchive = async (id) => {
    await supabase.from('feedback').update({ triage_status: 'archived' }).eq('id', id)
    fetchFeedback()
  }

  const handleTriageComplete = () => {
    setTriageFeedback(null)
    fetchFeedback()
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSegmentFilter('__all__')
    setAccountFilter('__all__')
    setImportanceFilter('__all__')
    setArrMin('')
    setArrMax('')
    setPotentialArrMin('')
    setPotentialArrMax('')
  }

  const hasActiveFilters = segmentFilter !== '__all__' || accountFilter !== '__all__' || 
    importanceFilter !== '__all__' || arrMin || arrMax || potentialArrMin || potentialArrMax

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
    if (num > 0) return `$${num.toFixed(0)}`
    return null
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const counts = {
    new: feedback.filter(f => f.triage_status === 'new').length,
    triaged: feedback.filter(f => f.triage_status === 'triaged').length,
    linked: feedback.filter(f => f.triage_status === 'linked').length,
    archived: feedback.filter(f => f.triage_status === 'archived').length,
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
            ) : (
              'All feedback triaged ✓'
            )}
          </p>
        </div>
        <div className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-lg">
          <span className="font-medium">Keyboard:</span> J/K navigate • L triage • A archive
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(counts).map(([status, count]) => (
          <Button
            key={status}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setStatusFilter(status); setSelectedIndex(0) }}
            className="capitalize"
          >
            {status} ({count})
          </Button>
        ))}
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setStatusFilter('all'); setSelectedIndex(0) }}
        >
          All ({feedback.length})
        </Button>
      </div>

      {/* Search and Filter Toggle */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search title, description, or customers..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndex(0) }}
            className="pl-10"
          />
        </div>
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {hasActiveFilters && <Badge variant="secondary" className="ml-1">{
            [segmentFilter !== '__all__', accountFilter !== '__all__', importanceFilter !== '__all__', 
             arrMin, arrMax, potentialArrMin, potentialArrMax].filter(Boolean).length
          }</Badge>}
        </Button>
        
        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by</span>
          <Select value={sortOption} onValueChange={setSortOption}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at_desc">Date Added: Newest</SelectItem>
              <SelectItem value="created_at_asc">Date Added: Oldest</SelectItem>
              <SelectItem value="feedback_date_desc">Feedback Date: Latest</SelectItem>
              <SelectItem value="feedback_date_asc">Feedback Date: Earliest</SelectItem>
              <SelectItem value="account_arr_desc">Account ARR: High to Low</SelectItem>
              <SelectItem value="account_arr_asc">Account ARR: Low to High</SelectItem>
              <SelectItem value="potential_arr_desc">Opportunity: High to Low</SelectItem>
              <SelectItem value="potential_arr_asc">Opportunity: Low to High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-sm">Filters</h3>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear all
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Account Segment</label>
                <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Segments</SelectItem>
                    {filterOptions.segments.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Account Name</label>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Accounts</SelectItem>
                    {filterOptions.accounts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Importance</label>
                <Select value={importanceFilter} onValueChange={setImportanceFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Importance</SelectItem>
                    {filterOptions.importances.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Account ARR Range</label>
                <div className="flex gap-2">
                  <Input placeholder="Min" type="number" value={arrMin} onChange={(e) => setArrMin(e.target.value)} className="w-20" />
                  <span className="self-center text-muted-foreground">-</span>
                  <Input placeholder="Max" type="number" value={arrMax} onChange={(e) => setArrMax(e.target.value)} className="w-20" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Potential ARR Range</label>
                <div className="flex gap-2">
                  <Input placeholder="Min" type="number" value={potentialArrMin} onChange={(e) => setPotentialArrMin(e.target.value)} className="w-20" />
                  <span className="self-center text-muted-foreground">-</span>
                  <Input placeholder="Max" type="number" value={potentialArrMax} onChange={(e) => setPotentialArrMax(e.target.value)} className="w-20" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredAndSortedFeedback.length} of {feedback.length} items
      </p>

      {/* Feedback List */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading feedback...</p>
      ) : filteredAndSortedFeedback.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No feedback found</p>
            {hasActiveFilters && (
              <Button variant="outline" className="mt-4" onClick={clearFilters}>Clear filters</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredAndSortedFeedback.map((item, index) => {
            const isSelected = index === selectedIndex
            // Use title if available (from CSV import or AI), otherwise generate from description
            const generatedTitle = item.description?.length > 60 
              ? item.description.substring(0, 60).split(' ').slice(0, -1).join(' ') + '...'
              : item.description?.substring(0, 60)
            const displayTitle = item.title || generatedTitle || 'Untitled'
            
            return (
              <div
                key={item.id}
                className={cn(
                  "group rounded-lg border bg-card p-4 transition-all cursor-pointer",
                  "hover:border-primary/50 hover:shadow-sm",
                  isSelected && "border-primary bg-primary/5 shadow-md"
                )}
                onClick={() => { setSelectedIndex(index); setTriageFeedback(item) }}
              >
                {/* Row 1: Customer + ARR + Status */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {item.triage_status === 'new' && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-sm text-foreground">
                      {item.account_name || 'Unknown Account'}
                    </span>
                    {formatCurrency(item.account_arr) && (
                      <span className="text-sm font-semibold text-emerald-600">
                        {formatCurrency(item.account_arr)} ARR
                      </span>
                    )}
                    {formatCurrency(item.potential_arr) && (
                      <span className="text-sm font-medium text-blue-600">
                        +{formatCurrency(item.potential_arr)} Opportunity
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {item.triage_status === 'new' && (
                      <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5">
                        new
                      </Badge>
                    )}
                    {item.triage_status === 'linked' && item.linked_ideas?.length > 0 && (
                      <>
                        {item.linked_ideas.slice(0, 2).map(idea => (
                          <Badge key={idea.id} variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
                            → {idea.title?.length > 25 ? idea.title.slice(0, 25) + '...' : idea.title}
                          </Badge>
                        ))}
                        {item.linked_ideas.length > 2 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            +{item.linked_ideas.length - 2} more
                          </Badge>
                        )}
                      </>
                    )}
                    {item.triage_status === 'triaged' && (
                      <Badge variant="outline" className="text-[10px]">triaged</Badge>
                    )}
                    {item.triage_status === 'archived' && (
                      <Badge variant="secondary" className="text-[10px] text-muted-foreground">archived</Badge>
                    )}
                  </div>
                </div>

                {/* Row 2: Title - AI generated or first N words */}
                <h3 className="font-medium text-[15px] text-foreground mb-1.5 line-clamp-1">
                  {displayTitle}
                </h3>

                {/* Row 3: Body - truncated with fade */}
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                  {item.description}
                </p>

                {/* Row 4: Muted metadata + hover action */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {item.account_segment && (
                      <span className="text-muted-foreground/80">{item.account_segment}</span>
                    )}
                    {item.account_segment && item.importance && (
                      <span className="text-muted-foreground/50">·</span>
                    )}
                    {item.importance && (
                      <span className={cn(
                        item.importance === 'High' && 'text-red-500',
                        item.importance === 'Medium' && 'text-amber-500'
                      )}>
                        {item.importance}
                      </span>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "transition-opacity text-muted-foreground hover:text-foreground",
                      isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
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
      />
    </div>
  )
}
