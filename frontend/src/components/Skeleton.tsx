import { twMerge } from 'tailwind-merge'

export function Skeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <div
      className={twMerge('skeleton-shimmer rounded-xl', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'status' : undefined}
    />
  )
}

export function SkeletonBlock({ className, label }: { className?: string; label?: string }) {
  return <Skeleton className={twMerge('rounded-lg', className)} label={label} />
}
