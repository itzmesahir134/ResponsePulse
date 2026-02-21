import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [errorMsg, setErrorMsg] = useState('')

    const { signIn, isAuthLoading } = useAuthStore()

    const handleLogin = async (e) => {
        e.preventDefault()
        setErrorMsg('')
        const { error } = await signIn(email, password)
        if (error) setErrorMsg(error.message)
        // No manual navigate here - App.jsx guards handle it
    }

    return (
        <div className="min-h-[calc(100vh-64px)] flex justify-center items-center px-6 bg-[#0B1220]">
            <form onSubmit={handleLogin} className="relative bg-slate-900/40 backdrop-blur-xl p-8 sm:p-12 rounded-[40px] border border-slate-800/50 w-full max-w-lg shadow-2xl overflow-hidden group">
                {/* Decorative Accents */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-600/10 rounded-full blur-3xl group-hover:bg-red-500/20 transition-all duration-700"></div>
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl"></div>

                <div className="relative">
                    <div className="text-center mb-10">
                        <div className="inline-flex p-4 rounded-3xl bg-slate-950/50 border border-slate-800 mb-6 text-2xl shadow-inner shadow-white/5">🚑</div>
                        <h1 className="text-4xl font-black text-white tracking-tight mb-2">Driver Login</h1>
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Access your dispatch dashboard</p>
                    </div>

                    {errorMsg && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl mb-8 text-xs font-bold text-center underline decoration-red-500/30 underline-offset-4 animate-shake">
                            {errorMsg}
                        </div>
                    )}

                    <div className="space-y-6">
                        <div className="group/input">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1 group-focus-within/input:text-red-500 transition-colors">Email Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full p-4 bg-slate-950/50 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-red-600 outline-none text-white transition-all font-medium placeholder:text-slate-700"
                                placeholder="driver@rapidaid.com"
                                required
                            />
                        </div>

                        <div className="mb-10 group/input">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1 group-focus-within/input:text-red-500 transition-colors">Secure Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-4 bg-slate-950/50 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-red-600 outline-none text-white transition-all font-medium placeholder:text-slate-700"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isAuthLoading}
                            className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-5 px-6 rounded-2xl shadow-xl shadow-red-950/20 transition-all transform active:scale-[0.98] disabled:opacity-50 text-lg hover:shadow-red-600/20"
                        >
                            {isAuthLoading ? 'Authenticating...' : 'Sign In to Dispatch'}
                        </button>
                    </div>

                    <div className="flex flex-col items-center gap-6 mt-10">
                        <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em]">
                            RapidAid Security Protocol Active
                        </p>
                        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                            New to dispatch? <Link to="/signup" className="text-red-500 hover:text-red-400 underline decoration-red-500/20 underline-offset-8">Create an account</Link>
                        </p>
                    </div>
                </div>
            </form>
        </div>
    )
}
