/** Classify a subprocess without mistaking incomplete execution for a test failure. */
export function processOutcome(result) {
  if (!result || result.error || result.status === null || result.status === undefined || result.signal) return 'retry'
  return result.ok && result.status === 0 ? 'passed' : 'failed'
}

/** A partial check must be retried, even if another check also failed. */
export function outcome(verify, contracts, web) {
  const checks = [processOutcome(verify), processOutcome(contracts)]
  if (checks.includes('retry')) return 'retry'
  if (checks.includes('failed')) return 'failed'
  if (web?.ok && web.status === 0) return 'passed'
  return web?.error || web?.signal || web?.status !== 1 ? 'retry' : 'failed'
}
