import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

/** Plugin-owned controls: native semantics, with only theme aliases shared with the shell. */
export function ControlStyles() {
  return <style>{`
.dsh-usage-state-button, .dsh-usage-state-input, .dsh-usage-state-switch, .dsh-usage-state-select {
  box-sizing: border-box; font-family: inherit; color: var(--dsw-alias-label-primary);
}
.dsh-usage-state-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 30px; padding: 0 10px; border: 1px solid transparent; border-radius: 5px;
  font-size: 13px; line-height: 20px; background: transparent; cursor: pointer;
}
.dsh-usage-state-button[data-size="sm"] { height: 26px; padding: 0 8px; border-radius: 4px; font-size: 12px; line-height: 18px; }
.dsh-usage-state-button[data-variant="outline"] { border-color: var(--dsw-alias-border-l2); }
.dsh-usage-state-button[data-variant="primary"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); border-color: var(--dsw-alias-brand-primary); }
.dsh-usage-state-button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.dsh-usage-state-button:active:not(:disabled) { background: var(--dsw-alias-bg-layer-1); }
.dsh-usage-state-button:disabled, .dsh-usage-state-input:disabled, .dsh-usage-state-switch:disabled, .dsh-usage-state-select:disabled { opacity: .45; cursor: not-allowed; }
.dsh-usage-state-input, .dsh-usage-state-select {
  min-width: 0; max-width: 100%; height: 28px; padding: 0 7px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 4px; background: var(--dsw-alias-bg-layer-1); font-size: 12px; line-height: 20px;
}
.dsh-usage-state-select { cursor: pointer; }
.dsh-usage-state-input::placeholder { color: var(--dsw-alias-label-secondary); }
.dsh-usage-state-button:focus-visible, .dsh-usage-state-input:focus-visible, .dsh-usage-state-switch:focus-visible, .dsh-usage-state-select:focus-visible, .dsh-usage-state-settings summary:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px;
}
.dsh-usage-state-switch {
  position: relative; flex: 0 0 auto; width: 36px; height: 20px; padding: 2px;
  border: 0; border-radius: 999px; background: var(--dsw-alias-border-l1); cursor: pointer;
}
.dsh-usage-state-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-usage-state-switch > span { display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-bg-overlay); }
.dsh-usage-state-switch[aria-checked="true"] > span { transform: translateX(16px); }
.dsh-usage-state-tag { display: inline-flex; align-items: center; border-radius: 4px; padding: 1px 5px; font-size: 11px; line-height: 17px; white-space: nowrap; }
.dsh-usage-state-tag[data-tone="neutral"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
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
          background: 'var(--dsw-alias-bg-overlay)', color: 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l1)' }}>{label}</span>
      </span>
    </span>
  )
}
