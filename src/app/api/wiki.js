export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const article = searchParams.get('article') || ''
  
  const end = new Date()
  const start = new Date(end - 7 * 86400000)
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '')
  
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encodeURIComponent(article)}/daily/${fmt(start)}/${fmt(end)}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HerwoodSignal/1.0 (herwoodcreative.com)' }
    })
    const data = await res.json()
    return Response.json(data)
  } catch (e) {
    return Response.json({ items: [] })
  }
}
