import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MessageSquare, Lightbulb, Map, Settings, Upload, BarChart3, Users, Tag, User, ChevronDown } from 'lucide-react'

const mainNavItems = [
  { id: 'feedback', label: 'Feedback Inbox', icon: MessageSquare, showQueue: true },
  { id: 'ideas', label: 'Ideas', icon: Lightbulb },
  { id: 'roadmap', label: 'Roadmap', icon: Map },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
]

const configNavItems = [
  { id: 'import', label: 'Import Data', icon: Upload },
  { id: 'product-areas', label: 'Product Areas', icon: Tag },
  { id: 'team', label: 'Team Members', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ 
  activeNav, 
  onNavChange, 
  queueCount = 0, 
  currentUser = null,
  teamMembers = [],
  onUserChange = null
}) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 text-white flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-blue-400">PFR</span> Insights
        </h1>
        <p className="text-xs text-slate-400 mt-1">Product Feedback & Roadmap</p>
      </div>
      
      {/* Main Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-1">
          {mainNavItems.map((item) => {
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
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.showQueue && queueCount > 0 && (
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "px-2 py-0.5 text-xs",
                        isActive ? "bg-blue-500 text-white" : "bg-slate-700 text-slate-300"
                      )}
                    >
                      {queueCount}
                    </Badge>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        
        {/* Configuration Section */}
        <div className="mt-8">
          <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Configuration
          </p>
          <ul className="space-y-1">
            {configNavItems.map((item) => {
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
        </div>
      </nav>
      
      {/* User Picker */}
      <div className="p-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 mb-2">Logged in as</p>
        {teamMembers.length > 0 && onUserChange ? (
          <Select 
            value={currentUser?.id || ''} 
            onValueChange={(id) => {
              const user = teamMembers.find(m => m.id === id)
              if (user) onUserChange(user)
            }}
          >
            <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                  <User className="h-3 w-3 text-slate-300" />
                </div>
                <span className="truncate">{currentUser?.name || 'Select user...'}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {teamMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{member.name}</span>
                    {member.role === 'admin' && (
                      <Badge variant="secondary" className="text-[10px] ml-1">admin</Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : currentUser ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
              <User className="h-4 w-4 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{currentUser.name}</p>
              <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No users configured</p>
        )}
      </div>
    </aside>
  )
}
