import { Outlet } from 'react-router-dom';
import NavLink from './NavLink.tsx';

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-800">
          <h1 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">
            ia-framework
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Monitoring Dashboard</p>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
          <NavLink to="/" label="Overview" />
          <NavLink to="/rag/search" label="Search" />
          <div className="pl-4">
            <NavLink to="/rag/search/history" label="History" />
          </div>
          <NavLink to="/tokens" label="Token Usage" />
          <NavLink to="/benchmarks" label="Benchmarks" />
          <NavLink to="/analytics" label="Analytics" />
          <NavLink to="/config" label="Config" />
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
