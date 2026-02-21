import { Link } from 'react-router-dom'

export default function Home() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh]">
            <div className="bg-white p-8 rounded-xl shadow-xl max-w-lg w-full text-center">
                <h1 className="text-5xl font-extrabold text-red-600 mb-4 tracking-tight">RapidAid <span className="text-3xl">🚑</span></h1>
                <p className="text-slate-600 text-lg mb-8">Real-time emergency dispatch when seconds count. Immediate assistance at your fingertips.</p>
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <Link to="/login" className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-colors w-full sm:w-auto">
                        Get Started
                    </Link>
                </div>
            </div>
        </div>
    )
}
