import { readdir, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function showMigrations() {
  const migrationsDir = join(__dirname, '..', 'supabase', 'migrations')
  
  try {
    const files = await readdir(migrationsDir)
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort()

    if (sqlFiles.length === 0) {
      console.log('No migration files found in supabase/migrations/')
      return
    }

    console.log('='.repeat(60))
    console.log('MIGRATIONS TO RUN')
    console.log('='.repeat(60))
    console.log('')
    console.log('Copy and paste the SQL below into Supabase Dashboard → SQL Editor')
    console.log('')
    console.log('-'.repeat(60))

    for (const file of sqlFiles) {
      const filePath = join(migrationsDir, file)
      const sql = await readFile(filePath, 'utf-8')
      
      console.log(`\n-- File: ${file}`)
      console.log(sql)
    }

    console.log('-'.repeat(60))
    console.log('')
    console.log('Or use Supabase CLI (one-time setup):')
    console.log('  1. npx supabase login')
    console.log('  2. npx supabase link --project-ref YOUR_PROJECT_REF')
    console.log('  3. npm run db:push')
    console.log('')
    
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('Migrations directory not found: supabase/migrations/')
    } else {
      console.error('Error:', err.message)
    }
    process.exit(1)
  }
}

showMigrations()
