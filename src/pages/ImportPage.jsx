import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react'

const DB_FIELDS = [
  { key: 'description', label: 'Description', required: true },
  { key: 'feedback_date', label: 'Feedback Date' },
  { key: 'importance', label: 'Importance' },
  { key: 'account_name', label: 'Account Name' },
  { key: 'account_segment', label: 'Account Segment' },
  { key: 'account_status', label: 'Account Status' },
  { key: 'account_arr', label: 'ARR' },
  { key: 'potential_arr', label: 'Potential ARR' },
  { key: 'created_by', label: 'Created By' },
  { key: 'pfr_id', label: 'PFR ID' },
]

export default function ImportPage() {
  const [step, setStep] = useState(1)
  const [csvData, setCsvData] = useState([])
  const [csvColumns, setCsvColumns] = useState([])
  const [mapping, setMapping] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

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
        // Auto-match
        const m = {}
        DB_FIELDS.forEach(f => {
          const match = r.meta.fields.find(c => c.toLowerCase().includes(f.key.replace('_', ' ')))
          if (match) m[f.key] = match
        })
        setMapping(m)
        setStep(2)
      },
      error: (err) => setResult({ type: 'error', text: err.message }),
    })
  }

  const handleImport = async () => {
    if (!mapping.description) return
    setIsLoading(true)
    setResult(null)
    try {
      const rows = csvData.map(row => {
        const mapped = { source: 'csv_import', triage_status: 'new' }
        DB_FIELDS.forEach(f => { if (mapping[f.key] && row[mapping[f.key]]) mapped[f.key] = row[mapping[f.key]] })
        return mapped
      }).filter(r => r.description)
      
      if (rows.length === 0) { setResult({ type: 'error', text: 'No valid rows' }); setIsLoading(false); return }
      
      const { error } = await supabase.from('feedback').insert(rows)
      if (error) throw error
      setResult({ type: 'success', text: `Imported ${rows.length} items` })
      setTimeout(() => { setStep(1); setCsvData([]); setCsvColumns([]); setMapping({}); setResult(null); if (fileRef.current) fileRef.current.value = '' }, 3000)
    } catch (err) {
      setResult({ type: 'error', text: err.message })
    }
    setIsLoading(false)
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
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>← Back</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {DB_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-4">
                <label className="w-40 text-sm font-medium">{f.label}{f.required && <span className="text-destructive ml-1">*</span>}</label>
                <Select value={mapping[f.key] || ''} onValueChange={(v) => setMapping({ ...mapping, [f.key]: v })}>
                  <SelectTrigger className={f.required && !mapping[f.key] ? 'border-destructive' : ''}><SelectValue placeholder="Select column" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">-- None --</SelectItem>
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
          <CardContent className="p-4 flex items-center gap-3">
            {result.type === 'success' ? <Check className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
            <p className={result.type === 'success' ? 'text-green-700' : 'text-destructive'}>{result.text}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
