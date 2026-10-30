export async function api(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-usage-state-compatibility', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'content-type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    const error = new Error(`GitHub API ${path}: HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return response.json()
}
export async function pages(path, token) {
  const result = []
  for (let page = 1; page <= 100; page++) {
    const data = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, token)
    if (!Array.isArray(data)) throw new Error(`Unexpected GitHub response for ${path}`)
    result.push(...data)
    if (data.length < 100) return result
  }
  throw new Error(`Pagination limit exceeded for ${path}`)
}
