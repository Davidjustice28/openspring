import { WavesIcon } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0284c7]">
            <WavesIcon className="h-4 w-4 text-white" aria-hidden="true" />
          </span>
          <span className="font-bold text-[#1e293b]">OpenSpring</span>
        </div>
        <p className="text-sm text-slate-500">
          © {new Date().getFullYear()} OpenSpring. Shared data for a more water-resilient future.
        </p>
      </div>
    </footer>
  )
}
