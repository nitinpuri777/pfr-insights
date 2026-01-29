import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, FileSpreadsheet, Check, AlertCircle, Sparkles } from 'lucide-react'
import { batchEmbedFeedback } from '@/lib/embeddings'

const DB_FIELDS = [
  { key: 'title', label: 'Product Feedback Title', required: false },
  { key: 'description', label: 'Description', required: true },
  { key: 'feedback_date', label: 'Feedback Date' },
  { key: 'importance', label: 'Importance' },
  { key: 'account_name', label: 'Account Name' },
  { key: 'account_segment', label: 'Account Segment' },
  { key: 'account_status', label: 'Account Status' },
  { key: 'account_arr', label: 'ARR' },
  { key: 'potential_arr', label: 'Potential ARR' },
  { key: 'active_opportunities', label: 'Active Opportunities' },
  { key: 'account_created_date', label: 'Account Created Date' },
  { key: 'created_by', label: 'Created By' },
  { key: 'pfr_id', label: 'PFR ID' },
]

// Known column name mappings for auto-matching
const KNOWN_MAPPINGS = {
  title: ['product feedback title', 'title', 'feedback title', 'name', 'product feedback: name'],
  description: ['feedback description', 'description', 'feedback', 'details'],
  feedback_date: ['feedback date', 'date', 'created date'],
  importance: ['importance', 'priority', 'severity'],
  account_name: ['account name', 'account', 'company', 'customer', 'account: name'],
  account_segment: ['account: segment', 'segment', 'account segment', 'zoominfo'],
  account_status: ['account: gtm', 'account status', 'gtm status'],
  account_arr: ['account: arr', 'arr', 'revenue', 'arr/open opportunity'],
  potential_arr: ['potential arr', 'potential revenue', 'potential', 'account open pipe arr', 'open pipe arr', 'open pipe', 'pipeline arr', 'account: open pipe arr'],
  active_opportunities: ['active opportunities', 'opportunities', 'open opportunities'],
  account_created_date: ['account: created date', 'account created'],
  created_by: ['created by', 'author', 'submitted by', 'product feedback: created by', 'product feedback: owner name', 'owner name', 'owner'],
  pfr_id: ['product feedback: id', 'pfr id', 'id', 'feedback id'],
}

export default function ImportPage() {
  const [step, setStep] = useState(1)
  const [csvData, setCsvData] = useState([])
  const [csvColumns, setCsvColumns] = useState([])
  const [mapping, setMapping] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const autoMatchColumns = (columns) => {
    const m = {}
    const lowerColumns = columns.map(c => c.toLowerCase().trim())
    
    DB_FIELDS.forEach(field => {
      const knownNames = KNOWN_MAPPINGS[field.key] || []
      for (const knownName of knownNames) {
        const matchIndex = lowerColumns.findIndex(col => 
          col === knownName || col.includes(knownName) || knownName.includes(col)
        )
        if (matchIndex !== -1) {
          m[field.key] = columns[matchIndex]
          break
        }
      }
    })
    return m
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        if (r.data.length === 0) { setResult({ type: 'error', text: 'No data found' }); return }
        setCsvData(r.data)
        setCsvColumns(r.meta.fields || [])
        setMapping(autoMatchColumns(r.meta.fields || []))
        setStep(2)
      },
      error: (err) => setResult({ type: 'error', text: err.message }),
    })
  }

  const handleMappingChange = (fieldKey, value) => {
    if (value === '__none__') {
      const newMapping = { ...mapping }
      delete newMapping[fieldKey]
      setMapping(newMapping)
    } else {
      setMapping({ ...mapping, [fieldKey]: value })
    }
  }

  const [embeddingProgress, setEmbeddingProgress] = useState(null)

  const handleImport = async () => {
    if (!mapping.description) return
    setIsLoading(true)
    setResult(null)
    setEmbeddingProgress(null)
    try {
      const rows = csvData.map(row => {
        const mapped = { source: 'csv_import', triage_status: 'new' }
        DB_FIELDS.forEach(f => { 
          if (mapping[f.key] && row[mapping[f.key]]) {
            mapped[f.key] = row[mapping[f.key]] 
          }
        })
        return mapped
      }).filter(r => r.description)
      
      if (rows.length === 0) { setResult({ type: 'error', text: 'No valid rows' }); setIsLoading(false); return }
      
      const { error } = await supabase.from('feedback').insert(rows)
      if (error) throw error
      
      setResult({ type: 'success', text: `Imported ${rows.length} items. Generating embeddings...` })
      
      // Generate embeddings for better AI matching
      setEmbeddingProgress({ processed: 0, total: rows.length })
      const embeddingResult = await batchEmbedFeedback((progress) => {
        setEmbeddingProgress(progress)
      })
      
      setResult({ 
        type: 'success', 
        text: `Imported ${rows.length} items. ${embeddingResult.processed} embeddings generated for AI matching.` 
      })
      
      setTimeout(() => { 
        setStep(1); setCsvData([]); setCsvColumns([]); setMapping({}); 
        setResult(null); setEmbeddingProgress(null)
        if (fileRef.current) fileRef.current.value = '' 
      }, 4000)
    } catch (err) {
      setResult({ type: 'error', text: err.message })
    }
    setIsLoading(false)
  }

  const resetForm = () => {
    setStep(1)
    setCsvData([])
    setCsvColumns([])
    setMapping({})
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h1 className="text-2xl font-bold">Import Feedback</h1><p className="text-muted-foreground">Upload CSV to import feedback</p></div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Select CSV File</CardTitle></CardHeader>
          <CardContent>
            <div className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary/50 cursor-pointer" onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-medium">Click to upload</p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><CardTitle className="text-lg">Map Columns</CardTitle><CardDescription>Found {csvData.length} rows</CardDescription></div>
              <Button variant="ghost" size="sm" onClick={resetForm}>← Back</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {DB_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-4">
                <label className="w-48 text-sm font-medium">{f.label}{f.required && <span className="text-destructive ml-1">*</span>}</label>
                <Select value={mapping[f.key] || '__none__'} onValueChange={(v) => handleMappingChange(f.key, v)}>
                  <SelectTrigger className={f.required && !mapping[f.key] ? 'border-destructive' : ''}><SelectValue placeholder="Select column" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {csvColumns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="pt-4">
              <Button onClick={handleImport} disabled={!mapping.description || isLoading}><Upload className="h-4 w-4 mr-2" />{isLoading ? 'Importing...' : 'Import'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className={result.type === 'success' ? 'border-green-500' : 'border-destructive'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {result.type === 'success' ? <Check className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
              <p className={result.type === 'success' ? 'text-green-700' : 'text-destructive'}>{result.text}</p>
            </div>
            {embeddingProgress && embeddingProgress.total > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500 animate-pulse" />
                <span className="text-sm text-muted-foreground">
                  Generating embeddings: {embeddingProgress.processed}/{embeddingProgress.total}
                </span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 transition-all" 
                    style={{ width: `${(embeddingProgress.processed / embeddingProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
