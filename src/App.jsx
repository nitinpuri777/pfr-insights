import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import FeedbackPage from '@/pages/FeedbackPage'
import IdeasPage from '@/pages/IdeasPage'
import RoadmapPage from '@/pages/RoadmapPage'
import ImportPage from '@/pages/ImportPage'
import InsightsPage from '@/pages/InsightsPage'
import SettingsPage from '@/pages/SettingsPage'
import ProductAreasPage from '@/pages/ProductAreasPage'
import TeamMembersPage from '@/pages/TeamMembersPage'
import { supabase } from '@/lib/supabase'

function App() {
  const [activeNav, setActiveNav] = useState('feedback')
  const [queueCount, setQueueCount] = useState(0)
  const [currentUser, setCurrentUser] = useState(null)
  const [teamMembers, setTeamMembers] = useState([])

  // Fetch team members on mount
  useEffect(() => {
    const fetchTeamMembers = async () => {
      const { data: members } = await supabase
        .from('team_members')
        .select('*')
        .eq('is_active', true)
        .order('name')
      
      setTeamMembers(members || [])
      
      // Restore selected user from localStorage or use first member
      if (members?.length > 0) {
        const savedUserId = localStorage.getItem('currentUserId')
        const savedUser = members.find(m => m.id === savedUserId)
        setCurrentUser(savedUser || members[0])
      }
    }
    
    fetchTeamMembers()
  }, [])

  // Update queue count when user changes
  useEffect(() => {
    const updateQueueCount = async () => {
      if (!currentUser) {
        setQueueCount(0)
        return
      }
      
      const { count } = await supabase
        .from('feedback')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to_id', currentUser.id)
        .in('triage_status', ['new', 'triaged'])
      
      setQueueCount(count || 0)
    }
    
    updateQueueCount()
  }, [currentUser, activeNav])

  const handleUserChange = (user) => {
    setCurrentUser(user)
    localStorage.setItem('currentUserId', user.id)
  }

  const renderPage = () => {
    switch (activeNav) {
      case 'feedback': return <FeedbackPage currentUser={currentUser} />
      case 'ideas': return <IdeasPage />
      case 'roadmap': return <RoadmapPage />
      case 'insights': return <InsightsPage />
      case 'import': return <ImportPage />
      case 'settings': return <SettingsPage />
      case 'product-areas': return <ProductAreasPage />
      case 'team': return <TeamMembersPage />
      default: return <FeedbackPage currentUser={currentUser} />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        activeNav={activeNav} 
        onNavChange={setActiveNav} 
        queueCount={queueCount}
        currentUser={currentUser}
        teamMembers={teamMembers}
        onUserChange={handleUserChange}
      />
      <main className="ml-64 p-8">{renderPage()}</main>
    </div>
  )
}

export default App
