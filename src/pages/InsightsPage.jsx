import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MessageSquare, Lightbulb, CheckCircle, DollarSign, TrendingUp, Link, Building2 } from 'lucide-react'

export default function InsightsPage() {
  const [stats, setStats] = useState({
    totalFeedback: 0,
    percentTriaged: 0,
    totalIdeas: 0,
    linkedAccountARR: 0,
    linkedPotentialARR: 0,
    totalCustomers: 0,
  })
  const [allIdeas, setAllIdeas] = useState([])
  const [sortBy, setSortBy] = useState('arr')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      
      // Fetch all data
      const { data: feedback } = await supabase.from('feedback').select('*')
      const { data: ideas } = await supabase.from('ideas').select('*')
      const { data: links } = await supabase.from('feedback_idea_links').select('*, feedback:feedback_id(*)')
      
      if (feedback && ideas) {
        const totalFeedback = feedback.length
        const triagedCount = feedback.filter(f => f.triage_status !== 'new').length
        const percentTriaged = totalFeedback > 0 ? Math.round((triagedCount / totalFeedback) * 100) : 0
        
        // Calculate linked ARR using the many-to-many relationship
        // Dedupe by account to avoid double-counting
        const linkedAccounts = new Map()
        ;(links || []).forEach(link => {
          const f = link.feedback
          if (f?.account_name) {
            const existing = linkedAccounts.get(f.account_name)
            if (!existing || (parseFloat(f.account_arr) || 0) > existing.arr) {
              linkedAccounts.set(f.account_name, {
                arr: parseFloat(f.account_arr) || 0,
                potentialArr: parseFloat(f.potential_arr) || 0,
              })
            }
          }
        })
        
        let linkedAccountARR = 0
        let linkedPotentialARR = 0
        linkedAccounts.forEach(({ arr, potentialArr }) => {
          linkedAccountARR += arr
          linkedPotentialARR += potentialArr
        })
        
        setStats({
          totalFeedback,
          percentTriaged,
          totalIdeas: ideas.length,
          linkedAccountARR,
          linkedPotentialARR,
          totalCustomers: linkedAccounts.size,
        })
        setAllIdeas(ideas)
      }
      
      setIsLoading(false)
    }
    fetchData()
  }, [])

  const formatCurrency = (v) => {
    const num = v || 0
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `$${Math.round(num / 1000)}K`
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num)
  }

  // Sort ideas based on selected option
  const getSortedIdeas = () => {
    let sorted = [...allIdeas]
    if (sortBy === 'arr') {
      sorted = sorted
        .filter(i => (i.total_arr || 0) > 0)
        .sort((a, b) => (b.total_arr || 0) - (a.total_arr || 0))
    } else if (sortBy === 'count') {
      sorted = sorted
        .filter(i => (i.feedback_count || 0) > 0)
        .sort((a, b) => (b.feedback_count || 0) - (a.feedback_count || 0))
    }
    return sorted.slice(0, 10)
  }

  const topIdeas = getSortedIdeas()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Insights</h1>
        <p className="text-muted-foreground">Track feedback pipeline and idea prioritization</p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <MessageSquare className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalFeedback}</p>
                <p className="text-sm text-muted-foreground">Total Feedback</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.percentTriaged}%</p>
                <p className="text-sm text-muted-foreground">Triaged</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Lightbulb className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalIdeas}</p>
                <p className="text-sm text-muted-foreground">Ideas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-lg">
                <Building2 className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalCustomers}</p>
                <p className="text-sm text-muted-foreground">Linked Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.linkedAccountARR)}</p>
                <p className="text-sm text-muted-foreground">Linked ARR</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.linkedPotentialARR)}</p>
                <p className="text-sm text-muted-foreground">Potential ARR</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Ideas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Link className="h-5 w-5" />
              Top Ideas
            </CardTitle>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="arr">by ARR Impact</SelectItem>
                <SelectItem value="count">by Item Count</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {topIdeas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ideas with linked feedback yet</p>
          ) : (
            <div className="space-y-3">
              {topIdeas.map((idea, i) => (
                <div key={idea.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50">
                  <span className="text-lg font-bold text-muted-foreground w-8">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{idea.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {idea.feedback_count || 0} requests · {idea.customer_count || 0} customers
                    </p>
                  </div>
                  <div className="text-right min-w-[100px]">
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(idea.total_arr)}</p>
                    <p className="text-xs text-muted-foreground">Total ARR</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
