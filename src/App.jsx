import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/useAuthStore'
import { LogOut, Activity } from 'lucide-react'

// Pages
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import UserDashboard from './pages/UserDashboard'
import DriverDashboard from './pages/DriverDashboard'
import Tracking from './pages/Tracking'

// Full screen loader to prevent flicker
const AppLoader = ({ label = "Initializing Hub..." }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B1220] gap-6 p-8 text-center">
    <div className="relative">
      <div className="w-16 h-16 border-[3px] border-red-600/10 border-t-red-600 rounded-full animate-spin"></div>
      <Activity className="absolute inset-0 m-auto text-red-600 w-6 h-6 animate-pulse" />
    </div>
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-black text-white uppercase tracking-tighter">{label}</h2>
      <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">RapidAid Security Protocol</p>
    </div>
  </div>
)

// PROTECTED: Only for logged in users (Drivers)
const ProtectedRoute = ({ children }) => {
  const { user, isAuthLoading } = useAuthStore()

  if (isAuthLoading) return <AppLoader label="Verifying Identity..." />
  if (!user) return <Navigate to="/driver-login" replace />

  return children
}

// PUBLIC: Redirects to dashboard if already logged in
const PublicRoute = ({ children }) => {
  const { user, isAuthLoading } = useAuthStore()

  if (isAuthLoading) return <AppLoader />
  if (user) return <Navigate to="/driver-dashboard" replace />

  return children
}

function App() {
  const { initialize, user, profile, isAuthLoading, signOut, updateAvailability } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <BrowserRouter>
      <div className="bg-[#0B1220] min-h-screen text-slate-200 font-sans selection:bg-red-500/30">
        <header className="bg-[#0B1220]/80 backdrop-blur-md text-white p-4 border-b border-slate-800 flex justify-between items-center sticky top-0 z-50">
          <Link to="/" className="text-2xl font-black tracking-tight hover:opacity-80 transition-opacity flex items-center gap-2">
            <span className="text-red-500">Rapid</span>Aid <span className="text-xl">🚑</span>
          </Link>

          <nav>
            <ul className="flex flex-row items-center space-x-4 sm:space-x-6">
              {isAuthLoading ? (
                <li className="w-24 h-8 bg-slate-900/50 rounded-xl animate-pulse"></li>
              ) : !user ? (
                <li>
                  <Link to="/driver-login" className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-black transition-all shadow-lg shadow-red-900/20">
                    Driver Login
                  </Link>
                </li>
              ) : (
                <li className="flex items-center gap-4">
                  {/* Mission Link */}
                  <Link to="/driver-dashboard" className="hidden md:block text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                    Mission Center
                  </Link>

                  <div className="flex items-center gap-3 px-3 py-1.5 rounded-2xl bg-slate-900/50 border border-slate-800/50">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-[10px] font-black border border-red-500/20 shadow-lg shadow-red-900/20">
                      {profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'DR'}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-white leading-none mb-1 max-w-[80px] truncate">{profile?.full_name || 'Driver'}</span>
                      <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${profile?.is_available ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
                        <span className="text-[8px] font-black uppercase tracking-tighter text-slate-500">{profile?.is_available ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>

                    <button
                      onClick={signOut}
                      className="ml-2 p-1.5 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-all"
                      title="Logout"
                    >
                      <LogOut size={14} />
                    </button>
                  </div>
                </li>
              )}
            </ul>
          </nav>
        </header>

        <main className="max-w-7xl mx-auto">
          <Routes>
            {/* Landing Page: If logged in, go to Dashboard. Else show SOS. */}
            <Route path="/" element={
              <PublicRoute>
                <UserDashboard />
              </PublicRoute>
            } />

            {/* Login & Signup: Only for guests */}
            <Route path="/driver-login" element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } />
            <Route path="/signup" element={
              <PublicRoute>
                <SignUp />
              </PublicRoute>
            } />

            {/* Dashboard: Only for Drivers */}
            <Route path="/driver-dashboard" element={
              <ProtectedRoute>
                <DriverDashboard />
              </ProtectedRoute>
            } />

            {/* Tracking: Shared link (Public) */}
            <Route path="/tracking" element={<Tracking />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
