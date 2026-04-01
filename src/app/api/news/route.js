export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${process.env.NEWSAPI_KEY}`

  try {
    const res = await fetch(url)
    const data = await res.json()
    return Response.json(data)
  } catch (e) {
    return Response.json({ status: 'error', totalResults: 0, articles: [] })
  }
}
