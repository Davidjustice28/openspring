import { Link, useSearchParams } from 'react-router-dom'
import { PlusIcon, WavesIcon } from 'lucide-react'
import { contributePath } from '../lib/contribute'

export function Navbar() {
  const [searchParams] = useSearchParams()
  const contributeTo = contributePath(searchParams.get('state'))

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-[#f8fafc]/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Primary">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0284c7]">
            <WavesIcon className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-[#1e293b]">OpenSpring</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-5">
          <Link to="/" className="hidden rounded-lg px-2 py-1 text-sm font-medium text-slate-600 transition-colors hover:text-[#0284c7] sm:inline-block">Data Explorer</Link>
          <Link to="/purpose" className="hidden rounded-lg px-2 py-1 text-sm font-medium text-slate-600 transition-colors hover:text-[#0284c7] sm:inline-block">Mission</Link>
          <Link
            to={contributeTo}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#1e293b] transition-colors hover:border-[#0284c7] hover:text-[#0284c7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] focus-visible:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Upload Usage
          </Link>
        </div>
      </nav>
    </header>
  )
}
