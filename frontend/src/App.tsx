import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { ContributionForm, type ContributionData } from './components/ContributionForm'
import { ContributeCta } from './components/ContributeCta'
import { PurposePage } from './components/PurposePage'
import { WaterDashboard } from './components/WaterDashboard'
import { WaterUpdatesSignup } from './components/WaterUpdatesSignup'
import { Footer } from './components/Footer'
import { contributePath } from './lib/contribute'
import { useStates } from './hooks/useDashboard'

interface ContributionNavigationState {
  contribution?: ContributionData
}

export function App() {
  return (
    <div id="top" className="min-h-screen w-full bg-[#f8fafc] text-[#1e293b]">
      <Navbar />
      <Routes>
        <Route path="/" element={<ExplorerPage />} />
        <Route path="/contribute" element={<ContributePage />} />
        <Route path="/purpose" element={<PurposePage />} />
        <Route path="/states/:slug" element={<StateRedirect />} />
      </Routes>
      <Footer />
    </div>
  )
}

function StateRedirect() {
  const location = useLocation()
  const slug = location.pathname.split('/').pop()
  return <Navigate to={`/?state=${slug}`} replace />
}

function ExplorerPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const dashboardRef = useRef<HTMLDivElement>(null)
  const [contribution, setContribution] = useState<ContributionData | null>(null)

  useEffect(() => {
    if (location.hash === '#contribute') {
      navigate(contributePath(searchParams.get('state')), { replace: true })
    }
  }, [location.hash, navigate, searchParams])

  useEffect(() => {
    const navigationState = location.state as ContributionNavigationState | null
    const incoming = navigationState?.contribution
    if (!incoming) return

    setContribution(incoming)
    window.setTimeout(() => {
      dashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)

    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
  }, [location.pathname, location.search, location.state, navigate])

  return (
    <main>
      <div ref={dashboardRef}>
        <WaterDashboard contribution={contribution} />
      </div>
      <WaterUpdatesSignup />
      <ContributeCta />
    </main>
  )
}

function ContributePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: statesData } = useStates()
  const stateSlug = searchParams.get('state') ?? undefined

  const handleContribute = (data: ContributionData) => {
    const slug =
      statesData?.states.find((state) => state.name === data.state)?.slug ??
      stateSlug ??
      ''

    navigate(slug ? `/?state=${slug}` : '/', {
      state: { contribution: data },
    })
  }

  return (
    <main>
      <ContributionForm
        defaultStateSlug={stateSlug}
        showExplorerLink
        onContribute={handleContribute}
      />
    </main>
  )
}
