import { Link, useSearchParams } from 'react-router-dom'
import { DropletsIcon, PlusIcon } from 'lucide-react'
import { contributePath } from '../lib/contribute'

export function ContributeCta() {
  const [searchParams] = useSearchParams()
  const stateSlug = searchParams.get('state')

  return (
    <section id="contribute" className="scroll-mt-20 bg-[#f8fafc] py-16 sm:py-20" aria-labelledby="contribute-cta-heading">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-water-50 text-[#0284c7]">
              <DropletsIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0284c7]">Community data contribution</p>
              <h2 id="contribute-cta-heading" className="mt-1 text-2xl font-extrabold tracking-tight text-[#1e293b] sm:text-3xl">
                Add your household water data
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Upload a bill or enter your usage manually. We never save the bill file or personal data. Only anonymous usage totals are kept for regional charts. No account required.
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-center">
            <Link
              to={contributePath(stateSlug)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0284c7] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-water-500/20 transition-colors hover:bg-water-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] focus-visible:ring-offset-2"
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              Upload usage
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
