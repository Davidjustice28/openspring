import React, { useMemo, useState } from 'react'
import { BellRingIcon, CheckCircle2Icon } from 'lucide-react'
import { api } from '../lib/api'
import { useStates } from '../hooks/useDashboard'

export function WaterUpdatesSignup() {
  const { data } = useStates()
  const [email, setEmail] = useState('')
  const [stateId, setStateId] = useState('')
  const [stateUpdates, setStateUpdates] = useState(true)
  const [monthlyUploadReminders, setMonthlyUploadReminders] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const canSubmit =
    email.trim() !== '' && stateId !== '' && (stateUpdates || monthlyUploadReminders)

  const successMessage = useMemo(() => {
    if (stateUpdates && monthlyUploadReminders) {
      return 'You’re signed up for state updates and monthly upload reminders.'
    }
    if (stateUpdates) {
      return 'You’re signed up for state water updates.'
    }
    return 'You’re signed up for monthly upload reminders on the 1st of each month.'
  }, [stateUpdates, monthlyUploadReminders])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')
    try {
      await api.subscribe({
        email,
        stateId: Number(stateId),
        stateUpdates,
        monthlyUploadReminders,
        website: '',
      })
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Subscription failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-white py-12 sm:py-16" aria-labelledby="updates-heading">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-water-100 bg-water-50 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#0284c7] shadow-sm">
              <BellRingIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0284c7]">Stay connected</p>
              <h2 id="updates-heading" className="mt-1 text-2xl font-extrabold tracking-tight text-[#1e293b]">
                Get water updates for your state
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Choose what you want to hear about. You can unsubscribe at any time.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="sr-only" htmlFor="updates-email">
                  Email address
                </label>
                <input
                  id="updates-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="field"
                />
              </div>
              <div>
                <label className="sr-only" htmlFor="updates-state">
                  State
                </label>
                <select
                  id="updates-state"
                  value={stateId}
                  onChange={(e) => setStateId(e.target.value)}
                  className="field"
                  required
                >
                  <option value="" disabled>
                    Select state
                  </option>
                  {(data?.states ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="rounded-xl border border-water-100 bg-white p-4">
              <legend className="px-1 text-sm font-bold text-[#1e293b]">Notification preferences</legend>
              <div className="mt-3 space-y-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={stateUpdates}
                    onChange={(e) => setStateUpdates(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0284c7] focus:ring-[#0284c7]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#1e293b]">State updates</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-slate-600">
                      New data, findings, and alerts for your state as they become available.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={monthlyUploadReminders}
                    onChange={(e) => setMonthlyUploadReminders(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0284c7] focus:ring-[#0284c7]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#1e293b]">Monthly upload reminders</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-slate-600">
                      A friendly nudge on the 1st of each month to share your latest water usage.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#0284c7] px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-water-600 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] focus-visible:ring-offset-2 sm:w-auto"
            >
              {loading ? 'Saving…' : 'Notify me'}
            </button>
          </form>

          {submitted && (
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#047857]" role="status">
              <CheckCircle2Icon className="h-4 w-4" />
              {successMessage}
            </p>
          )}
          {error && (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
