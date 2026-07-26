import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, FileTextIcon, MapPinIcon, UploadCloudIcon, XIcon } from 'lucide-react'
import type { ParseBillResponse } from '@openspring/shared'
import {
  BATHROOM_PREFERENCE_OPTIONS,
  HOME_TYPE_OPTIONS,
  HOUSEHOLD_SIZE_OPTIONS,
  LOT_SIZE_OPTIONS,
  MAX_BILL_FILE_BYTES,
  MAX_BILL_FILE_MB,
  OWNERSHIP_OPTIONS,
} from '@openspring/shared'
import { api } from '../lib/api'
import { getBillReviewWarnings } from '../lib/billSanityChecks'
import { useInvalidateDashboard, useStates } from '../hooks/useDashboard'

export interface ContributionData {
  state: string
  city: string
  zip: string
  propertyType: string
  householdSize: string
  ownership: string
  lotSize: string
  bathroomPreference: string
  hasPool: boolean
  hasSprinklers: boolean
  hasGarden: boolean
  hasFridgeDispenser: boolean
  waterUsed: string
  billCost: string
  periodStart: string
  periodEnd: string
  source: 'bill' | 'manual'
}

interface ContributionFormProps {
  onContribute: (data: ContributionData) => void
  defaultStateSlug?: string
  showExplorerLink?: boolean
}

type FormFields = Omit<ContributionData, 'state' | 'source'>

const emptyForm = (): FormFields => ({
  city: '',
  zip: '',
  propertyType: '',
  householdSize: '',
  ownership: '',
  lotSize: '',
  bathroomPreference: '',
  hasPool: false,
  hasSprinklers: false,
  hasGarden: false,
  hasFridgeDispenser: false,
  waterUsed: '',
  billCost: '',
  periodStart: '',
  periodEnd: '',
})

function parseWaterUsed(value: string): number {
  return parseFloat(value.replace(/,/g, ''))
}

function parseBillCostToCents(value: string): number {
  return Math.round(parseFloat(value.replace(/,/g, '')) * 100)
}

function buildMetadata(form: ContributionData) {
  const metadata: Record<string, string | boolean> = {}
  if (form.propertyType) metadata.propertyType = form.propertyType
  if (form.householdSize) metadata.householdSize = form.householdSize
  if (form.ownership) metadata.ownership = form.ownership
  if (form.lotSize) metadata.lotSize = form.lotSize
  if (form.bathroomPreference) metadata.bathroomPreference = form.bathroomPreference
  if (form.hasPool) metadata.hasPool = true
  if (form.hasSprinklers) metadata.hasSprinklers = true
  if (form.hasGarden) metadata.hasGarden = true
  if (form.hasFridgeDispenser) metadata.hasFridgeDispenser = true
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function hasParsedBillFields(parsed: ParseBillResponse['parsed']): boolean {
  return Object.values(parsed).some((value) => value != null && String(value).trim() !== '')
}

function formatGallons(value: string): string {
  const gallons = parseWaterUsed(value)
  if (!Number.isFinite(gallons)) return value
  return `${gallons.toLocaleString()} gal`
}

function formatBillCost(value: string): string {
  const amount = parseFloat(value.replace(/,/g, ''))
  if (!Number.isFinite(amount)) return value
  return `$${amount.toFixed(2)}`
}

function formatPeriod(start: string, end: string): string {
  if (!start || !end) return ''
  return `${start} to ${end}`
}

export function ContributionForm({ onContribute, defaultStateSlug, showExplorerLink = false }: ContributionFormProps) {
  const { data: statesData } = useStates()
  const invalidateDashboard = useInvalidateDashboard()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<'bill' | 'manual'>('bill')
  const [stateId, setStateId] = useState('')
  const [fileName, setFileName] = useState('')
  const [parseToken, setParseToken] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseFieldsFound, setParseFieldsFound] = useState(false)
  const [parseConfidence, setParseConfidence] = useState<Record<string, number>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormFields>(emptyForm())

  const states = statesData?.states ?? []

  const billReviewWarnings = useMemo(() => {
    if (source !== 'bill' || !fileName || parsing) return []
    return getBillReviewWarnings(form, parseConfidence)
  }, [source, fileName, parsing, form, parseConfidence])

  useEffect(() => {
    if (!confirmOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmOpen])

  useEffect(() => {
    if (!defaultStateSlug || stateId || states.length === 0) return
    const match = states.find((state) => state.slug === defaultStateSlug.toLowerCase())
    if (match) setStateId(String(match.id))
  }, [defaultStateSlug, stateId, states])

  const update = (patch: Partial<FormFields>) =>
    setForm((current) => ({ ...current, ...patch }))

  const canSubmit =
    stateId !== '' &&
    form.city.trim() !== '' &&
    form.zip.trim() !== '' &&
    form.waterUsed.trim() !== '' &&
    parseWaterUsed(form.waterUsed) > 0 &&
    form.billCost.trim() !== '' &&
    form.periodStart !== '' &&
    form.periodEnd !== '' &&
    (source === 'manual' || parseToken !== null)

  const setInputSource = (nextSource: 'bill' | 'manual') => {
    setSource(nextSource)
    if (nextSource === 'manual') {
      setParseToken(null)
      setFileName('')
      setParseFieldsFound(false)
      setParseConfidence({})
    }
  }

  const applyParsedBill = (response: ParseBillResponse) => {
    const { parsed } = response
    const patch: Partial<Omit<ContributionData, 'state'>> = {}

    if (parsed.city) patch.city = parsed.city
    if (parsed.zip) patch.zip = parsed.zip
    if (parsed.waterUsed) patch.waterUsed = parsed.waterUsed
    if (parsed.billCost) patch.billCost = parsed.billCost
    if (parsed.periodStart) patch.periodStart = parsed.periodStart
    if (parsed.periodEnd) patch.periodEnd = parsed.periodEnd

    if (parsed.state) {
      const match = states.find(
        (s) => s.name.toLowerCase() === parsed.state!.toLowerCase() || s.abbreviation.toLowerCase() === parsed.state!.toLowerCase(),
      )
      if (match) setStateId(String(match.id))
    }

    update(patch)
    setParseToken(response.parseToken)
    setParseConfidence(response.confidence ?? {})
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return

    const file = files[0]
    if (file.size > MAX_BILL_FILE_BYTES) {
      setError(`Bill file must be ${MAX_BILL_FILE_MB} MB or smaller. Try a smaller PDF or enter values manually.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setFileName(file.name)
    setInputSource('bill')
    setParsing(true)
    setParseFieldsFound(false)
    setParseConfidence({})
    setError('')

    try {
      const response = (await api.parseBill(file)) as ParseBillResponse
      applyParsedBill(response)
      const found = hasParsedBillFields(response.parsed)
      setParseFieldsFound(found)
      if (!found) {
        setError('We could not read bill fields automatically. Please enter the values below.')
      }
    } catch (e) {
      setFileName('')
      setParseToken(null)
      setParseFieldsFound(false)
      setParseConfidence({})
      setError(e instanceof Error ? e.message : 'Failed to parse bill')
    } finally {
      setParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const clearUploadedBill = () => {
    setFileName('')
    setParseToken(null)
    setParseFieldsFound(false)
    setParseConfidence({})
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || loading || parsing) return

    if (source === 'bill') {
      setConfirmOpen(true)
      return
    }

    await submitContribution()
  }

  const submitContribution = async () => {
    if (!canSubmit) return

    setConfirmOpen(false)
    setLoading(true)
    setError('')

    const selectedState = states.find((s) => String(s.id) === stateId)
    const contributionData: ContributionData = {
      ...form,
      state: selectedState?.name ?? '',
      source,
    }

    try {
      await api.contribute({
        stateId: Number(stateId),
        city: form.city.trim(),
        zip: form.zip.trim(),
        waterUsedGallons: parseWaterUsed(form.waterUsed),
        billCostCents: parseBillCostToCents(form.billCost),
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        source,
        ...(source === 'bill' && parseToken ? { parseToken } : {}),
        metadata: buildMetadata(contributionData),
        website: '',
      })

      invalidateDashboard()
      onContribute(contributionData)
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Contribution failed')
    } finally {
      setLoading(false)
    }
  }

  const selectedStateName = states.find((s) => String(s.id) === stateId)?.name ?? ''

  return (
    <section id="contribute" className="scroll-mt-20 bg-[#f8fafc] py-16 sm:py-20" aria-labelledby="contribution-heading">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {showExplorerLink && (
          <Link
            to={defaultStateSlug ? `/?state=${defaultStateSlug}` : '/'}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0284c7] transition-colors hover:text-water-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] focus-visible:ring-offset-2"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            Back to map
          </Link>
        )}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
          <div className="border-b border-slate-100 px-6 py-6 sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0284c7]">Community data contribution</p>
            <h2 id="contribution-heading" className="mt-2 text-2xl font-extrabold tracking-tight text-[#1e293b] sm:text-3xl">
              Add one household data point
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Upload a bill or enter usage manually. We never store your bill file or personal information. Only anonymous water usage totals are kept for regional summaries.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-7 px-6 py-6 sm:px-8 sm:py-8">
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

            <fieldset>
              <legend className="text-sm font-bold text-[#1e293b]">How would you like to add data?</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Contribution method">
                <MethodButton
                  active={source === 'bill'}
                  title="Start with a bill"
                  body="We read your bill once to prefill usage fields, then discard the file."
                  onClick={() => setInputSource('bill')}
                />
                <MethodButton
                  active={source === 'manual'}
                  title="Enter manually"
                  body="Add your bill totals without uploading a document."
                  onClick={() => setInputSource('manual')}
                />
              </div>
            </fieldset>

            {source === 'bill' && (
              <div className="space-y-3">
                <p className="rounded-lg border border-water-100 bg-water-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                  <strong className="font-semibold text-[#1e293b]">Bill privacy:</strong> Your bill document is never saved. We extract usage totals only (gallons, cost, and billing dates), then discard the file. Names, account numbers, and other personal details from the bill are not stored.
                </p>
                {fileName ? (
                  <div className="flex items-center justify-between rounded-xl border border-water-100 bg-water-50 px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileTextIcon className="h-6 w-6 shrink-0 text-[#0284c7]" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1e293b]">{fileName}</p>
                        <p className="text-xs text-[#0284c7]">
                          {parsing
                            ? 'Reading bill…'
                            : parseFieldsFound
                              ? 'Values added below for your review'
                              : 'Enter bill values below'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearUploadedBill}
                      disabled={parsing}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-[#1e293b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] disabled:opacity-40"
                      aria-label="Remove uploaded bill"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragging(false)
                      void handleFiles(event.dataTransfer.files)
                    }}
                    disabled={parsing}
                    className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                      dragging ? 'border-[#0284c7] bg-water-50' : 'border-slate-300 bg-slate-50 hover:border-[#0284c7]'
                    }`}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-water-50">
                      <UploadCloudIcon className="h-5 w-5 text-[#0284c7]" />
                    </span>
                    <span className="mt-3 text-sm font-semibold text-[#1e293b]">Upload a water bill</span>
                    <span className="mt-1 text-xs text-slate-500">PDF, JPG, or PNG · max {MAX_BILL_FILE_MB} MB · verify the values we find, then we discard the file</span>
                    <span className="mt-2 text-xs text-slate-500">
                      Upload one bill at a time. You can add more bills for other months after submitting.
                    </span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="sr-only"
                  onChange={(event) => void handleFiles(event.target.files)}
                />
                {fileName && !parsing && (
                  <p className="rounded-lg border border-water-100 bg-water-50 px-4 py-3 text-xs text-slate-700">
                    Auto-filled from your bill. Review at your own discretion before submitting.
                  </p>
                )}
              </div>
            )}

            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-[#1e293b]">Contribution details</legend>
              {fileName && !parsing && parseFieldsFound && billReviewWarnings.length === 0 && (
                <p className="-mt-2 flex items-center gap-1.5 text-xs text-[#059669]">
                  <CheckCircle2Icon className="h-3.5 w-3.5" />
                  Bill values are editable. Please confirm them before contributing.
                </p>
              )}
              {fileName && !parsing && parseFieldsFound && billReviewWarnings.length > 0 && (
                <div className="-mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Please verify prefilled values
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {billReviewWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="State" htmlFor="state">
                  <select id="state" value={stateId} onChange={(event) => setStateId(event.target.value)} className="field" required>
                    <option value="" disabled>
                      Select state
                    </option>
                    {states.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="City" htmlFor="city">
                  <input
                    id="city"
                    value={form.city}
                    onChange={(event) => update({ city: event.target.value })}
                    placeholder="e.g. Salt Lake City"
                    className="field"
                    required
                  />
                </Field>
                <Field label="ZIP code" htmlFor="zip">
                  <div className="relative">
                    <MapPinIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="zip"
                      value={form.zip}
                      onChange={(event) => update({ zip: event.target.value })}
                      inputMode="numeric"
                      placeholder="e.g. 84101"
                      className="field pl-10"
                      required
                    />
                  </div>
                </Field>
                <Field label="Water used" htmlFor="water-used">
                  <input
                    id="water-used"
                    value={form.waterUsed}
                    onChange={(event) => update({ waterUsed: event.target.value })}
                    inputMode="decimal"
                    step="any"
                    placeholder="Gallons (e.g. 9840.5)"
                    className="field"
                    required
                  />
                </Field>
                <Field label="Total bill cost" htmlFor="bill-cost">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                    <input
                      id="bill-cost"
                      value={form.billCost}
                      onChange={(event) => update({ billCost: event.target.value })}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="field pl-7"
                      required
                    />
                  </div>
                </Field>
                <Field label="Billing period start" htmlFor="period-start">
                  <input
                    id="period-start"
                    type="date"
                    value={form.periodStart}
                    onChange={(event) => update({ periodStart: event.target.value })}
                    className="field"
                    required
                  />
                </Field>
                <Field label="Billing period end" htmlFor="period-end">
                  <input
                    id="period-end"
                    type="date"
                    value={form.periodEnd}
                    onChange={(event) => update({ periodEnd: event.target.value })}
                    className="field"
                    required
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-5 rounded-xl border border-water-100 bg-water-50/60 p-4 sm:p-5">
              <div>
                <legend className="text-sm font-bold text-[#1e293b]">Household & home details (optional)</legend>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  These answers power the dashboard group-by charts: household size, home type, lot size, rent vs. own, outdoor features, and indoor fixtures. Season and billing month come automatically from your billing dates.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0284c7]">Household</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="People in household" htmlFor="household-size">
                    <select
                      id="household-size"
                      value={form.householdSize}
                      onChange={(event) => update({ householdSize: event.target.value })}
                      className="field"
                    >
                      <option value="">Select size</option>
                      {HOUSEHOLD_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Rent or own" htmlFor="ownership">
                    <select id="ownership" value={form.ownership} onChange={(event) => update({ ownership: event.target.value })} className="field">
                      <option value="">Select</option>
                      {OWNERSHIP_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0284c7]">Home & lot</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Home type" htmlFor="property">
                    <select
                      id="property"
                      value={form.propertyType}
                      onChange={(event) => update({ propertyType: event.target.value })}
                      className="field"
                    >
                      <option value="">Select type</option>
                      {HOME_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Lot size" htmlFor="lot-size">
                    <select id="lot-size" value={form.lotSize} onChange={(event) => update({ lotSize: event.target.value })} className="field">
                      <option value="">Select</option>
                      {LOT_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0284c7]">Outdoor water features</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <HomeDetailToggle label="Pool" checked={form.hasPool} onChange={(checked) => update({ hasPool: checked })} />
                  <HomeDetailToggle label="Sprinkler system" checked={form.hasSprinklers} onChange={(checked) => update({ hasSprinklers: checked })} />
                  <HomeDetailToggle label="Garden" checked={form.hasGarden} onChange={(checked) => update({ hasGarden: checked })} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0284c7]">Indoor fixtures</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Bathroom preference" htmlFor="bathroom-preference">
                    <select
                      id="bathroom-preference"
                      value={form.bathroomPreference}
                      onChange={(event) => update({ bathroomPreference: event.target.value })}
                      className="field"
                    >
                      <option value="">Select</option>
                      {BATHROOM_PREFERENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-end">
                    <HomeDetailToggle
                      label="Fridge water dispenser"
                      checked={form.hasFridgeDispenser}
                      onChange={(checked) => update({ hasFridgeDispenser: checked })}
                    />
                  </div>
                </div>
              </div>
            </fieldset>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-md text-xs leading-relaxed text-slate-500">
                By contributing, you share anonymous usage data for regional research. We do not save your bill document or personal information. Only water usage totals you confirm are stored.
              </p>
              <button
                type="submit"
                disabled={!canSubmit || loading || parsing}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0284c7] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-water-500/20 transition-colors hover:bg-water-600 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] focus-visible:ring-offset-2"
              >
                {loading ? 'Contributing…' : 'Contribute & view map'}
                <MapPinIcon className="h-4 w-4" />
              </button>
            </div>

            {submitted && (
              <p className="rounded-lg bg-savings-500/10 px-3 py-2.5 text-center text-sm font-semibold text-[#059669]" role="status">
                Your contribution is now reflected in this live dashboard preview.
              </p>
            )}
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-center text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </form>

          {confirmOpen && (
            <BillConfirmModal
              stateName={selectedStateName}
              city={form.city}
              zip={form.zip}
              waterUsed={formatGallons(form.waterUsed)}
              billCost={formatBillCost(form.billCost)}
              period={formatPeriod(form.periodStart, form.periodEnd)}
              warnings={billReviewWarnings}
              loading={loading}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={() => void submitContribution()}
            />
          )}
        </div>
      </div>
    </section>
  )
}

function BillConfirmModal({
  stateName,
  city,
  zip,
  waterUsed,
  billCost,
  period,
  warnings,
  loading,
  onCancel,
  onConfirm,
}: {
  stateName: string
  city: string
  zip: string
  waterUsed: string
  billCost: string
  period: string
  warnings: string[]
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bill-confirm-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="bill-confirm-title" className="text-lg font-bold text-[#1e293b]">
          Confirm bill values
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Confirm these match your water bill (water charges only, not sewer or trash).
        </p>

        <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Location</dt>
            <dd className="text-right font-medium text-[#1e293b]">
              {city}, {stateName} {zip}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Water used</dt>
            <dd className="font-medium text-[#1e293b]">{waterUsed}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Water cost</dt>
            <dd className="font-medium text-[#1e293b]">{billCost}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Billing period</dt>
            <dd className="font-medium text-[#1e293b]">{period}</dd>
          </div>
        </dl>

        {warnings.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Please double-check
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Go back and edit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-[#0284c7] px-4 py-2.5 text-sm font-bold text-white hover:bg-water-600 disabled:opacity-50"
          >
            {loading ? 'Contributing…' : 'Confirm & contribute'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  htmlFor: string
  children: React.ReactNode
}

function Field({ label, htmlFor, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-[#1e293b]">
        {label}
      </label>
      {children}
    </div>
  )
}

interface MethodButtonProps {
  active: boolean
  title: string
  body: string
  onClick: () => void
}

function MethodButton({ active, title, body, onClick }: MethodButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-xl border-2 p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7] focus-visible:ring-offset-2 ${
        active ? 'border-[#0284c7] bg-water-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <span className={`block text-sm font-bold ${active ? 'text-[#0284c7]' : 'text-[#1e293b]'}`}>{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-slate-500">{body}</span>
    </button>
  )
}

interface HomeDetailToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function HomeDetailToggle({ label, checked, onChange }: HomeDetailToggleProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-[#1e293b]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-[#0284c7] focus:ring-[#0284c7]"
      />
      {label}
    </label>
  )
}
