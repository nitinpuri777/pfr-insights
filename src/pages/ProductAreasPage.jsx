import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Users, MessageSquare, Tag, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const AREA_COLORS = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#f43f5e', label: 'Rose' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#0ea5e9', label: 'Sky' },
  { value: '#6b7280', label: 'Gray' },
]

export default function ProductAreasPage() {
  const [productAreas, setProductAreas] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [feedbackCounts, setFeedbackCounts] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingArea, setEditingArea] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    keywords: '',
    owner_id: '',
    color: '#6366f1'
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    
    // Fetch product areas with owner info
    const { data: areas } = await supabase
      .from('product_areas')
      .select('*, owner:team_members(*)')
      .order('name')
    
    // Fetch team members
    const { data: members } = await supabase
      .from('team_members')
      .select('*')
      .eq('is_active', true)
      .order('name')
    
    // Count feedback per product area
    const { data: counts } = await supabase
      .from('feedback')
      .select('product_area_id')
      .not('product_area_id', 'is', null)
    
    const countMap = {}
    ;(counts || []).forEach(item => {
      countMap[item.product_area_id] = (countMap[item.product_area_id] || 0) + 1
    })
    
    setProductAreas(areas || [])
    setTeamMembers(members || [])
    setFeedbackCounts(countMap)
    setIsLoading(false)
  }

  const openCreateDialog = () => {
    setEditingArea(null)
    setFormData({
      name: '',
      description: '',
      keywords: '',
      owner_id: '',
      color: '#6366f1'
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (area) => {
    setEditingArea(area)
    setFormData({
      name: area.name,
      description: area.description || '',
      keywords: area.keywords?.join(', ') || '',
      owner_id: area.owner_id || '',
      color: area.color || '#6366f1'
    })
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) return
    
    setIsSaving(true)
    
    const data = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      keywords: formData.keywords ? formData.keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
      owner_id: formData.owner_id || null,
      color: formData.color,
      updated_at: new Date().toISOString()
    }
    
    try {
      if (editingArea) {
        await supabase
          .from('product_areas')
          .update(data)
          .eq('id', editingArea.id)
      } else {
        await supabase
          .from('product_areas')
          .insert(data)
      }
      
      setIsDialogOpen(false)
      fetchData()
    } catch (error) {
      console.error('Failed to save product area:', error)
    }
    
    setIsSaving(false)
  }

  const handleDelete = async (area) => {
    if (!window.confirm(`Delete "${area.name}"? Feedback assigned to this area will become unassigned.`)) {
      return
    }
    
    try {
      // Clear product_area_id from feedback
      await supabase
        .from('feedback')
        .update({ product_area_id: null, suggested_product_area_id: null })
        .eq('product_area_id', area.id)
      
      // Delete the product area
      await supabase
        .from('product_areas')
        .delete()
        .eq('id', area.id)
      
      fetchData()
    } catch (error) {
      console.error('Failed to delete product area:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading product areas...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Areas</h1>
          <p className="text-muted-foreground">
            Configure product areas for AI-powered feedback routing
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Product Area
        </Button>
      </div>

      {productAreas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No product areas configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create product areas to enable AI-powered feedback routing to the right PM.
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Product Area
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {productAreas.map((area) => (
            <Card key={area.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Color indicator */}
                  <div 
                    className="w-3 h-12 rounded-full flex-shrink-0"
                    style={{ backgroundColor: area.color || '#6366f1' }}
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">{area.name}</h3>
                      {area.owner && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {area.owner.name}
                        </Badge>
                      )}
                    </div>
                    
                    {area.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {area.description}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-4 mt-3">
                      {area.keywords?.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Tag className="h-3.5 w-3.5" />
                          <span>{area.keywords.length} keywords</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{feedbackCounts[area.id] || 0} feedback items</span>
                      </div>
                    </div>
                    
                    {area.keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {area.keywords.slice(0, 8).map((keyword, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                        {area.keywords.length > 8 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            +{area.keywords.length - 8} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(area)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(area)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingArea ? 'Edit Product Area' : 'Create Product Area'}
            </DialogTitle>
            <DialogDescription>
              Product areas help AI route feedback to the right PM based on keywords and descriptions.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Mobile & Field Apps"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1.5 block">Owner</label>
              <Select 
                value={formData.owner_id || '__none__'} 
                onValueChange={(v) => setFormData({ ...formData, owner_id: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select owner..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No owner</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this product area covers. This helps AI make better routing decisions."
                rows={3}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1.5 block">Keywords</label>
              <Input
                value={formData.keywords}
                onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                placeholder="mobile, field, technician, offline, tablet"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Comma-separated list of keywords that indicate feedback belongs here
              </p>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1.5 block">Color</label>
              <div className="flex flex-wrap gap-2">
                {AREA_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      formData.color === color.value ? "ring-2 ring-offset-2 ring-primary" : ""
                    )}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.name.trim() || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                editingArea ? 'Save Changes' : 'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
