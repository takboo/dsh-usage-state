/** UTC calendar-month start, independent of the Host/Client local time zone. */
export function utcMonthStart(now: number): number {
  const date = new Date(now)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
}
