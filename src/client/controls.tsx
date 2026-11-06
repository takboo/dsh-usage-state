import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

/** Plugin-owned controls: native semantics, with only theme aliases shared with the shell. */
export function ControlStyles() {
  return <style>{`
.dsh-usage-state-button, .dsh-usage-state-input, .dsh-usage-state-switch {
  box-sizing: border-box; font-family: inherit; color: var(--dsw-alias-label-primary);
}
.dsh-usage-state-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 36px; padding: 0 14px; border: 0; border-radius: 6px;
  font-size: 14px; line-height: 22px; background: transparent; cursor: pointer;
}
.dsh-usage-state-button[data-size="sm"] { height: 28px; padding: 0 10px; border-radius: 4px; font-size: 12px; line-height: 18px; }
.dsh-usage-state-button[data-variant="outline"] { border: .5px solid var(--dsw-alias-border-l3); }
.dsh-usage-state-button[data-variant="primary"] { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.dsh-usage-state-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-usage-state-button[data-variant="primary"]:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dsh-usage-state-button:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
.dsh-usage-state-button:disabled, .dsh-usage-state-input:disabled, .dsh-usage-state-switch:disabled { opacity: .4; cursor: not-allowed; }
.dsh-usage-state-input {
  min-width: 0; height: 32px; padding: 0 8px; border: .5px solid var(--dsw-alias-border-l4);
  border-radius: 6px; background: var(--dsw-alias-bg-layer-1); font-size: 14px; line-height: 22px;
}
.dsh-usage-state-input::placeholder { color: var(--dsw-alias-label-dimmed); }
.dsh-usage-state-button:focus-visible, .dsh-usage-state-input:focus-visible, .dsh-usage-state-switch:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px;
}
.dsh-usage-state-switch {
  position: relative; flex: 0 0 auto; width: 36px; height: 20px; padding: 2px;
  border: 0; border-radius: 999px; corner-shape: round; background: var(--dsw-alias-border-l3); cursor: pointer;
}
.dsh-usage-state-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-usage-state-switch > span { display: block; width: 16px; height: 16px; border-radius: 50%; corner-shape: round; background: var(--dsw-alias-switch-thumb); }
.dsh-usage-state-switch[aria-checked="true"] > span { transform: translateX(16px); background: var(--dsw-alias-label-primary-foreground); }
.dsh-usage-state-tag { display: inline-flex; align-items: center; border-radius: 999px; corner-shape: round; padding: 1px 8px; font-size: 11px; line-height: 17px; font-weight: 500; white-space: nowrap; }
.dsh-usage-state-tag[data-tone="neutral"] { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); }
.dsh-usage-state-tag[data-tone="success"] { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent); color: var(--dsw-alias-state-success-primary); }
.dsh-usage-state-tag[data-tone="warning"] { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); color: var(--dsw-alias-state-warn-primary); }
`}</style>
}

export function Button({ variant = 'outline', size = 'md', className = '', type = 'button', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline' | 'primary' | 'ghost'; size?: 'sm' | 'md' }) {
  return <button {...props} type={type} className={`dsh-usage-state-button ${className}`} data-variant={variant} data-size={size} />
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`dsh-usage-state-input ${className}`} />
}

export function Switch({ checked, disabled, label, onChange }: {
  checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button type="button" role="switch" className="dsh-usage-state-switch" aria-checked={checked}
        aria-label={label} disabled={disabled} onClick={() => { if (!disabled) onChange(!checked) }}>
        <span aria-hidden="true" />
      </button>
      <span>{label}</span>
    </label>
  )
}

export function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning'; children: ReactNode }) {
  return <span className="dsh-usage-state-tag" data-tone={tone}>{children}</span>
}

/** Kept inside its owner tree; no portal, global stylesheet, or body mutation. */
export function Tooltip({ label, side = 'top', children }: { label: string; side?: 'top' | 'bottom'; children: ReactNode }) {
  const id = useId()
  const anchor = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const hovered = useRef(false)
  const focused = useRef(false)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number; side: 'top' | 'bottom' }>()

  useEffect(() => {
    if (!open) return
    const node = anchor.current
    const tooltip = bubble.current
    const document = node?.ownerDocument
    const view = document?.defaultView
    if (node === null || tooltip === null || document === undefined || view === null || view === undefined) return
    const place = () => {
      const rect = node.getBoundingClientRect()
      const size = tooltip.getBoundingClientRect()
      const below = side === 'bottom' ? rect.bottom + size.height <= view.innerHeight - 8 : rect.top - size.height < 8
      setPosition({
        left: Math.max(8, Math.min(rect.left + (rect.width - size.width) / 2, view.innerWidth - size.width - 8)),
        top: Math.max(8, Math.min(below ? rect.bottom : rect.top - size.height, view.innerHeight - size.height - 8)),
        side: below ? 'bottom' : 'top',
      })
    }
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    place()
    view.addEventListener('resize', place)
    view.addEventListener('scroll', place, true)
    document.addEventListener('keydown', dismiss)
    return () => {
      view.removeEventListener('resize', place)
      view.removeEventListener('scroll', place, true)
      document.removeEventListener('keydown', dismiss)
    }
  }, [open, side, label])

  return (
    <span ref={anchor} data-usage-tooltip-anchor="" tabIndex={0} aria-describedby={id}
      style={{ display: 'inline-flex' }}
      onMouseEnter={() => { hovered.current = true; setOpen(true) }}
      onMouseLeave={() => { hovered.current = false; if (!focused.current) setOpen(false) }}
      onFocus={() => { focused.current = true; setOpen(true) }}
      onBlur={() => { focused.current = false; if (!hovered.current) setOpen(false) }}
      onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
      {children}
      <span ref={bubble} id={id} role="tooltip" hidden={!open} data-side={position?.side ?? side}
        style={{ position: 'fixed', zIndex: 100, left: position?.left ?? 0, top: position?.top ?? 0,
          visibility: position === undefined ? 'hidden' : undefined, width: 'max-content', maxWidth: 'min(50vw, 360px)',
          paddingTop: (position?.side ?? side) === 'bottom' ? '6px' : 0,
          paddingBottom: (position?.side ?? side) === 'top' ? '6px' : 0,
          fontSize: '13px', lineHeight: '20px', fontWeight: 400, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
        <span style={{ display: 'block', padding: '3px 7px', borderRadius: '4px',
          background: 'var(--dsw-alias-tooltip-bg)', color: 'var(--dsw-alias-label-primary-foreground)' }}>{label}</span>
      </span>
    </span>
  )
}
