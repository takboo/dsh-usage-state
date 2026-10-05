/**
 * Where the status line is mounted.
 *
 * There is exactly one mount point on purpose: the **input dock** —
 * `conversation.input.dock`, the full-width column slot inside the composer stack,
 * directly above the input card. DSH 0.2 declares it as `{kind: "list", scope:
 * "session"}` and its own queued-message dock registers there, so a contribution is
 * a stretched block in `.composerStack` rather than a cell in a row.
 *
 * `conversation.composer.dock` (used up to 0.4.1) is the row *below* the card, but
 * 0.2 renders it as one centered flex row holding the platform's own stats pill
 * (`id: "stats"`) and the context meter, so a contribution there is a pill beside
 * the platform's statistics — not a line of its own. The composer stack ends at the
 * input card, so no slot exists below it: above the card is the only place a reading
 * gets a line to itself (see `design-consensus.md` revisions 19 and 20).
 *
 * A reading is account-level, and a completed turn is the wrong axis for it — the
 * same number would be rendered under every past turn even though it describes the
 * whole account (including other sessions, subagents and clients) at the moment of
 * the refresh, not that turn. `conversation.chat.turnTail` is a **chain** slot
 * (exactly one entry renders) and both the platform's deliverables plugin and
 * `dsh-better-sidebar` register there, so a line mounted there silently disappeared
 * on any turn that produced files; `conversation.chat.assistant-actions` is a list
 * slot, but it is rendered inside the turn action strip, which the platform shows on
 * the latest turn only and behind `:hover` on older ones. Both are turn-scoped, so
 * neither is used.
 */
export interface StatusLineSlot {
  /** Slot key to register into. */
  name: string
  /** Entry id inside that slot. */
  id: string
  /** Position among the slot's entries. */
  order: number
  /** Dictionary namespace, so the framework injects `t`. */
  locale: string
}

export const STATUS_LINE_SLOTS: readonly StatusLineSlot[] = [
  // After the platform's queued-message dock (`order: 20`): a queue is transient and
  // sits closest to the input.
  { name: 'conversation.input.dock', id: 'usage-state', order: 200, locale: 'usage-state' },
]
