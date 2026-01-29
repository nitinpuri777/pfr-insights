import { cn } from '@/lib/utils'
import { MessageSquare, Lightbulb, Map, Settings, Upload, BarChart3 } from 'lucide-react'

const navItems = [
  { id: 'feedback', label: 'Feedback Inbox', icon: MessageSquare },
  { id: 'ideas', label: 'Ideas', icon: Lightbulb },
  { id: 'roadmap', label: 'Roadmap', icon: Map },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'import', label: 'Import', icon: Upload },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ activeNav, onNavChange }) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 text-white flex flex-col">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-blue-400">PFR</span> Insights
        </h1>
        <p className="text-xs text-slate-400 mt-1">Product Feedback & Roadmap</p>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeNav === item.id
            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavChange(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="p-4 border-t border-slate-800">
        <div className="text-xs text-slate-500">Canny Clone • v0.1</div>
      </div>
    </aside>
  )
}
