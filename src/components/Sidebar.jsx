export default function Sidebar({ activeNav, onNavChange }) {
  const navItems = [
    { id: 'feedback', label: 'Feedback' },
    { id: 'ideas', label: 'Ideas' },
  ]

  return (
    <aside className="fixed left-0 top-0 h-screen w-[250px] bg-gray-100">
      <nav className="p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onNavChange(item.id)}
                className={`w-full text-left px-4 py-2 rounded transition-colors ${
                  activeNav === item.id
                    ? 'bg-gray-300'
                    : 'hover:bg-gray-200'
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
