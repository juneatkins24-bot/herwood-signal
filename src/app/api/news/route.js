export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''

  const url = `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}&order-by=newest&page-size=5&api-key=${process.env.GUARDIAN_API_KEY}`

  try {
    const res = await fetch(url)
    const data = await res.json()

    // Normalize Guardian response to match the shape the component expects
    const articles = (data.response?.results || []).map(a => ({
      title: a.webTitle?.replace(/\s*[-|].*$/, '').trim(),
      source: { name: 'The Guardian' }
    }))

    return Response.json({
      status: 'ok',
      totalResults: data.response?.total || 0,
      articles
    })
  } catch (e) {
    return Response.json({ status: 'error', totalResults: 0, articles: [] })
  }
}
