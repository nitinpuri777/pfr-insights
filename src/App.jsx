import { useState } from 'react'
import Sidebar from './components/Sidebar'
import FeedbackPage from './pages/FeedbackPage'
import IdeasPage from './pages/IdeasPage'

function App() {
  const [activeNav, setActiveNav] = useState('feedback')

  return (
    <div className="flex min-h-screen">
      <Sidebar activeNav={activeNav} onNavChange={setActiveNav} />
      <main className="ml-[250px] flex-1 bg-white p-8">
        {activeNav === 'feedback' && <FeedbackPage />}
        {activeNav === 'ideas' && <IdeasPage />}
      </main>
    </div>
  )
}

export default App
