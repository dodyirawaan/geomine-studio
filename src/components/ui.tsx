import type { ButtonHTMLAttributes, ComponentType, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle'

/** Shared button look, also used for links that act as buttons. */
function buttonClass(variant: Variant = 'primary', className?: string): string {
  return cx(
    'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50',
    // amber-700 keeps white text above 4.5:1 contrast.
    variant === 'primary' && 'bg-amber-700 text-white shadow-sm hover:bg-amber-800 active:bg-amber-900',
    variant === 'ghost' &&
      'border border-stone-300 bg-white text-stone-800 shadow-xs hover:bg-stone-50 active:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800',
    variant === 'subtle' && 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
    variant === 'danger' && 'bg-red-700 text-white shadow-sm hover:bg-red-800',
    className,
  )
}

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={buttonClass(variant, className)} />
}

export function ButtonLink({ variant = 'primary', className, ...props }: LinkProps & { variant?: Variant }) {
  return <Link {...props} className={buttonClass(variant, className)} />
}

const field =
  'min-h-9 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 shadow-xs outline-none transition-colors placeholder:text-stone-400 focus:border-amber-500 focus:ring-3 focus:ring-amber-500/20 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500'

/** Fields are full width unless the caller sets a width of its own. */
const fieldClass = (className?: string) => cx(field, !/(^|\s)(w-|basis-|flex-1)/.test(className ?? '') && 'w-full', className)

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={fieldClass(className)} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={fieldClass(className)} />
}

export function Card({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 rounded-xl border border-stone-200 bg-white p-4 shadow-xs sm:p-5 dark:border-stone-800 dark:bg-stone-900', className)}>
      {title && <h2 className="mb-3 text-base font-semibold tracking-tight">{title}</h2>}
      {children}
    </section>
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
      {children}
      {hint && <span className="ml-1 font-normal text-stone-400">{hint}</span>}
    </span>
  )
}

/** Title block at the top of every page: icon, title, one-line purpose, and actions on the right. */
export function PageHeader({ icon: Icon, title, description, actions }: { icon?: ComponentType<{ className?: string }>; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
      {Icon && (
        <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 sm:flex dark:bg-amber-950/60 dark:text-amber-400">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-stone-600 dark:text-stone-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Badge({ children, tone = 'stone' }: { children: ReactNode; tone?: 'stone' | 'amber' | 'green' | 'red' }) {
  const tones = {
    stone: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}
