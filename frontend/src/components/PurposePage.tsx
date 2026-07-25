import { BarChart3Icon, BookOpenIcon, DatabaseIcon, LightbulbIcon } from 'lucide-react'

const futurePaths = [
  { icon: DatabaseIcon, title: 'Public REST API', body: 'A clear, developer-friendly way to explore de-identified water data and build useful local tools.' },
  { icon: BookOpenIcon, title: 'Annual reports', body: 'Plain-language reports that make regional water patterns, gaps, and progress visible to everyone.' },
  { icon: LightbulbIcon, title: 'Possible solutions', body: 'Practical opportunities for households, utilities, and communities based on stronger evidence.' },
]

export function PurposePage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-white py-14 sm:py-20" aria-labelledby="purpose-heading">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <section className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0284c7]">Why OpenSpring</p>
          <h1 id="purpose-heading" className="mt-3 text-4xl font-extrabold tracking-tight text-[#1e293b] sm:text-5xl">Better water decisions start with data people can actually use.</h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">Water data is often incomplete, hard to compare, or hidden behind systems built for specialists. That leaves households and communities without a clear picture of what is changing around them.</p>
        </section>
        <section className="mt-10 max-w-3xl border-l-2 border-[#0284c7] pl-5" aria-label="Data access">
          <p className="text-sm leading-relaxed text-slate-600">Utility companies, city water departments, and local agencies hold parts of this information today. But it is often fragmented across systems, difficult to compare, and unavailable in a shared public view. OpenSpring is built to help make that picture clearer without exposing personal household data.</p>
        </section>
        <section className="mt-14 rounded-2xl border border-water-100 bg-water-50 p-6 sm:p-9" aria-labelledby="approach-heading">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#0284c7] shadow-sm"><BarChart3Icon className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0284c7]">Our approach</p>
              <h2 id="approach-heading" className="mt-1 text-2xl font-extrabold text-[#1e293b]">Make useful water insight public.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">OpenSpring combines anonymous household contributions with public environmental sources to help people understand local patterns without exposing personal information.</p>
            </div>
          </div>
        </section>
        <section className="mt-14" aria-labelledby="next-heading">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0284c7]">What comes next</p>
          <h2 id="next-heading" className="mt-1 text-2xl font-extrabold text-[#1e293b]">A growing public resource</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {futurePaths.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <Icon className="h-5 w-5 text-[#0284c7]" aria-hidden="true" />
                <h3 className="mt-4 font-bold text-[#1e293b]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
