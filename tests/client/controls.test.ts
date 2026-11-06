import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'

import { Button, Switch, Tooltip } from '../../src/client/controls.tsx'

function tooltipPage(context: { after(callback: () => void): unknown }, side: 'top' | 'bottom' = 'top') {
  const listeners = new Map<string, (event: { key?: string }) => void>()
  const view = {
    innerWidth: 200, innerHeight: 200,
    addEventListener: (name: string, listener: (event: { key?: string }) => void) => { listeners.set(name, listener) },
    removeEventListener: (name: string) => { listeners.delete(name) },
  }
  const document = {
    defaultView: view,
    addEventListener: view.addEventListener,
    removeEventListener: view.removeEventListener,
  }
  let rect = { left: 180, top: 100, bottom: 120, width: 20 }
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(h(Tooltip, { label: 'Usage details', side, children: 'Reading' }), {
      createNodeMock: element => element.props.role === 'tooltip'
        ? { getBoundingClientRect: () => ({ width: 100, height: 40 }) }
        : { ownerDocument: document, getBoundingClientRect: () => rect },
    })
  })
  context.after(() => { act(() => renderer.unmount()) })
  const anchor = () => renderer.root.findByProps({ 'data-usage-tooltip-anchor': '' })
  const bubble = () => renderer.root.findByProps({ role: 'tooltip' })
  return { renderer, anchor, bubble, listeners, move: (next: typeof rect) => { rect = next } }
}

test('native controls keep button keyboard semantics and switch checked/disabled state', context => {
  const changes: boolean[] = []
  let renderer!: ReactTestRenderer
  act(() => { renderer = create(h(Switch, { checked: false, label: 'Progress bar', onChange: next => changes.push(next) })) })
  context.after(() => { act(() => renderer.unmount()) })
  let control = renderer.root.findByType('button')
  assert.equal(control.props.type, 'button')
  assert.equal(control.props.role, 'switch')
  assert.equal(control.props['aria-checked'], false)
  assert.equal(control.props['aria-label'], 'Progress bar')
  // Space/Enter activation is the native button's click, not a second key handler.
  assert.equal(control.props.onKeyDown, undefined)
  act(() => control.props.onClick())
  assert.deepEqual(changes, [true])
  act(() => renderer.update(h(Switch, { checked: true, disabled: true, label: 'Progress bar', onChange: next => changes.push(next) })))
  control = renderer.root.findByType('button')
  assert.equal(control.props.disabled, true)
  assert.equal(control.props['aria-checked'], true)
  act(() => control.props.onClick())
  assert.deepEqual(changes, [true])
  act(() => renderer.update(h(Button, { disabled: true, children: 'Save' })))
  assert.equal(renderer.root.findByType('button').props.type, 'button', 'settings actions never submit an enclosing form')
  assert.equal(renderer.root.findByType('button').props.disabled, true)
})

test('tooltip stays open through hover/focus transitions and supports Escape', context => {
  const { anchor, bubble, listeners } = tooltipPage(context)
  assert.equal(anchor().props.tabIndex, 0)
  assert.equal(anchor().props['aria-describedby'], bubble().props.id)
  assert.equal(bubble().props.hidden, true)
  act(() => anchor().props.onMouseEnter())
  assert.equal(bubble().props.hidden, false)
  act(() => anchor().props.onFocus())
  act(() => anchor().props.onMouseLeave())
  assert.equal(bubble().props.hidden, false, 'pointer exit must not hide a focused description')
  act(() => anchor().props.onBlur())
  assert.equal(bubble().props.hidden, true)
  act(() => anchor().props.onFocus())
  act(() => anchor().props.onMouseEnter())
  act(() => anchor().props.onBlur())
  assert.equal(bubble().props.hidden, false, 'blur must not hide a hovered description')
  act(() => listeners.get('keydown')?.({ key: 'Escape' }))
  assert.equal(bubble().props.hidden, true)
  assert.equal(listeners.size, 0, 'closing removes all document/view listeners')
  act(() => anchor().props.onFocus())
  act(() => anchor().props.onKeyDown({ key: 'Escape' }))
  assert.equal(bubble().props.hidden, true)
})

test('tooltip flips at top/bottom edges, clamps horizontally and repositions on scroll/resize', context => {
  const { anchor, bubble, listeners, move } = tooltipPage(context)
  act(() => anchor().props.onMouseEnter())
  assert.equal(bubble().props['data-side'], 'top')
  assert.equal(bubble().props.style.top, 60)
  assert.equal(bubble().props.style.left, 92, 'clamp to right viewport inset')
  move({ left: -10, top: 2, bottom: 22, width: 20 })
  act(() => listeners.get('scroll')?.({}))
  assert.equal(bubble().props['data-side'], 'bottom')
  assert.equal(bubble().props.style.top, 22)
  assert.equal(bubble().props.style.left, 8, 'clamp to left viewport inset')
  move({ left: 80, top: 110, bottom: 130, width: 20 })
  act(() => listeners.get('resize')?.({}))
  assert.equal(bubble().props['data-side'], 'top')
  assert.equal(bubble().props.style.left, 40)

  const preferredBottom = tooltipPage(context, 'bottom')
  preferredBottom.move({ left: 80, top: 170, bottom: 190, width: 20 })
  act(() => preferredBottom.anchor().props.onFocus())
  assert.equal(preferredBottom.bubble().props['data-side'], 'top')
  assert.equal(preferredBottom.bubble().props.style.top, 130)
})

test('unmounting an open tooltip removes every owned listener', context => {
  const { renderer, anchor, listeners } = tooltipPage(context)
  act(() => anchor().props.onFocus())
  assert.deepEqual([...listeners.keys()].sort(), ['keydown', 'resize', 'scroll'])
  act(() => renderer.unmount())
  assert.equal(listeners.size, 0)
})
