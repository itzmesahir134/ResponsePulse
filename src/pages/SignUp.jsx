import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

export default function SignUp() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [role] = useState('driver')
    const [errorMsg, setErrorMsg] = useState('')

    const { signUp, isAuthLoading } = useAuthStore()

    const handleSignUp = async (e) => {
        e.preventDefault()
        setErrorMsg('')
        const { error } = await signUp(email, password, fullName, role)
        if (error) setErrorMsg(error.message)
        // No manual navigate - App.jsx handles it
    }

    return (
        <div className="min-h-[calc(100vh-64px)] flex justify-center items-center px-6 py-12">
            <form onSubmit={handleSignUp} className="relative bg-slate-800/30 backdrop-blur-xl p-8 sm:p-12 rounded-[40px] border border-slate-700/50 w-full max-w-lg shadow-2xl overflow-hidden group">
                {/* Decorative Accents */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-600/10 rounded-full blur-3xl group-hover:bg-red-500/20 transition-all duration-700"></div>
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl"></div>

                <div className="relative">
                    <div className="text-center mb-10">
                        <div className="inline-flex p-4 rounded-3xl bg-slate-900/50 border border-slate-700 mb-6 text-2xl">⚡</div>
                        <h2 className="text-4xl font-black text-white tracking-tight mb-2">Join RapidAid</h2>
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Secure Driver Registration</p>
                    </div>

                    {errorMsg && <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl mb-8 text-xs font-bold text-center underline decoration-red-500/30 underline-offset-4">{errorMsg}</div>}

                    <div className="space-y-5">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Full Name</label>
                            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full p-4 bg-slate-900/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none text-white transition-all font-medium" placeholder="First Last" required />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Email Address</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-4 bg-slate-900/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none text-white transition-all font-medium" placeholder="driver@rapidaid.com" required />
                        </div>

                        <div className="mb-8">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Secure Password</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-4 bg-slate-900/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none text-white transition-all font-medium" placeholder="Minimum 6 characters" required minLength={6} />
                        </div>

                        <div className="hidden">
                            <input type="hidden" name="role" value="driver" />
                        </div>

                        <button type="submit" disabled={isAuthLoading} className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-5 px-6 rounded-2xl shadow-xl shadow-red-950/20 transition-all transform active:scale-[0.98] disabled:opacity-50 text-lg">
                            {isAuthLoading ? 'Creating Credentials...' : 'Create Driver Account'}
                        </button>
                    </div>

                    <p className="text-center mt-10 text-slate-500 text-xs font-bold uppercase tracking-widest">
                        Already registered? <Link to="/driver-login" className="text-red-500 hover:text-red-400 underline decoration-red-500/20 underline-offset-8">Sign In</Link>
                    </p>
                </div>
            </form>
        </div>
    )
}
