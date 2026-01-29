import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import FeedbackPage from '@/pages/FeedbackPage'
import IdeasPage from '@/pages/IdeasPage'
import RoadmapPage from '@/pages/RoadmapPage'
import ImportPage from '@/pages/ImportPage'
import InsightsPage from '@/pages/InsightsPage'
import SettingsPage from '@/pages/SettingsPage'

function App() {
  const [activeNav, setActiveNav] = useState('feedback')

  const renderPage = () => {
    switch (activeNav) {
      case 'feedback': return <FeedbackPage />
      case 'ideas': return <IdeasPage />
      case 'roadmap': return <RoadmapPage />
      case 'insights': return <InsightsPage />
      case 'import': return <ImportPage />
      case 'settings': return <SettingsPage />
      default: return <FeedbackPage />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar activeNav={activeNav} onNavChange={setActiveNav} />
      <main className="ml-64 p-8">{renderPage()}</main>
    </div>
  )
}

export default App
