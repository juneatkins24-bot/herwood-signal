'use client'

import { useState, useEffect, useCallback } from 'react'

const CACHE_KEY = 'herwood-signal-live-v5'
const HOUR_MS = 3_600_000

function lerp(a, b, t) { return a + (b - a) * t }

function getHeatColor(score) {
  const s = Math.max(0, Math.min(100, score)) / 100
  if (s < 0.5) {
    const t = s / 0.5
    return { r: Math.round(lerp(168, 240, t)), g: Math.round(lerp(196, 170, t)), b: Math.round(lerp(224, 80, t)) }
  } else {
    const t = (s - 0.5) / 0.5
    return { r: Math.round(lerp(240, 184, t)), g: Math.round(lerp(170, 58, t)), b: Math.round(lerp(80, 42, t)) }
  }
}

function toRgb({ r, g, b }, a = 1) { return `rgba(${r},${g},${b},${a})` }

function getHeatLabel(s) {
  if (s >= 85) return 'SCORCHING'
  if (s >= 70) return 'HOT'
  if (s >= 55) return 'WARM'
  if (s >= 40) return 'TEPID'
  if (s >= 25) return 'COOLING'
  return 'COLD'
}

function getCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts < HOUR_MS) return { data, ts }
    return null
  } catch { return null }
}

function setCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })) } catch (_) {}
}

// Fetch brands from Google Sheet via Vercel proxy
async function fetchBrands() {
  const res = await fetch('/api/brands')
  const { brands } = await res.json()
  return brands || []
}

// Fetch hot takes from Google Sheet
async function fetchTakes() {
  try {
    const res = await fetch('/api/takes')
    const { takes } = await res.json()
    return takes || []
  } catch { return [] }
}

async function fetchWikiViews(article) {
  const url = `/api/wiki?article=${encodeURIComponent(article)}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (!data.items || data.items.length === 0) return { total: 0, trend: 'flat' }
    const views = data.items.map(i => i.views)
    const total = views.reduce((a, b) => a + b, 0)
    const firstHalf = views.slice(0, 3).reduce((a, b) => a + b, 0) / 3
    const secondHalf = views.slice(-3).reduce((a, b) => a + b, 0) / 3
    const trend = secondHalf > firstHalf * 1.15 ? 'up' : secondHalf < firstHalf * 0.85 ? 'down' : 'flat'
    return { total, trend }
  } catch { return { total: 0, trend: 'flat' } }
}

async function fetchNews(query) {
  const url = `/api/news?q=${encodeURIComponent(query)}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== 'ok') return { count: 0, headlines: [] }
    return {
      count: Math.min(data.totalResults || 0, 999),
      headlines: (data.articles || []).slice(0, 3).map(a => ({
        title: a.title?.replace(/\s*[-|].*$/, '').trim(),
        source: a.source?.name,
      })),
    }
  } catch { return { count: 0, headlines: [] } }
}

function computeScore(wikiTotal, newsCount, wikiTrend) {
  const wikiScore = Math.min(60, Math.round((Math.log1p(wikiTotal) / Math.log1p(100000)) * 60))
  const newsScore = Math.min(40, Math.round((Math.log1p(newsCount) / Math.log1p(500)) * 40))
  let score = wikiScore + newsScore
  if (wikiTrend === 'up') score = Math.min(100, score + 8)
  if (wikiTrend === 'down') score = Math.max(0, score - 8)
  return score
}

async function generateVerdicts(brands) {
  const summary = brands
    .map(b => `${b.name}: score ${b.score}, wiki ${b.wikiTotal} views/week, news ${b.newsCount} articles, trend ${b.trend}`)
    .join('\n')
  const res = await fetch('/api/signal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{
        role: 'user',
        content: `You are the editorial voice of THE HERWOOD SIGNAL, a brand intelligence dashboard by Herwood Creative. Voice: direct, dry, specific. No hedging. No em dashes.

Based on this REAL data, write a short verdict for each brand. Return ONLY valid JSON, no markdown, no backticks.

${summary}

{
  "brands": [
    { "name": "...", "verdict": "max 8 words lowercase no period" }
  ],
  "tickerTake": "one sharp 10-word editorial take on what the data is saying overall"
}`,
      }],
    }),
  })
  const d = await res.json()
  const text = d.content.filter(b => b.type === 'text').map(b => b.text).join('')
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

async function fetchAllData() {
  // Pull brands and takes from Google Sheet in parallel
  const [sheetBrands, takes] = await Promise.all([fetchBrands(), fetchTakes()])

  const results = await Promise.all(
    sheetBrands.map(async brand => {
      // If sheet has a score override, skip API calls for this brand
      if (brand.scoreOverride) {
        return {
          name: brand.name,
          score: brand.scoreOverride,
          trend: 'flat',
          wikiTotal: 0,
          newsCount: 0,
          headlines: [],
          hasOverride: true,
        }
      }
      const [wiki, news] = await Promise.all([
        fetchWikiViews(brand.wiki),
        fetchNews(brand.news || brand.name),
      ])
      const score = computeScore(wiki.total, news.count, wiki.trend)
      return {
        name: brand.name,
        score,
        trend: wiki.trend,
        wikiTotal: wiki.total,
        newsCount: news.count,
        headlines: news.headlines,
        hasOverride: false,
      }
    })
  )

  const ai = await generateVerdicts(results)
  const verdictMap = {}
  ai.brands.forEach(b => { verdictMap[b.name] = b.verdict })

  return {
    brands: results.map(b => ({ ...b, verdict: verdictMap[b.name] || '' })),
    tickerTake: ai.tickerTake,
    takes,
  }
}

function buildTicker(data) {
  if (!data) return ''
  const parts = []

  // Sheet hot takes first — your voice front and center
  if (data.takes?.length) {
    data.takes.forEach(t => {
      const prefix = t.type === 'NOISE' ? '◆ NOISE' : t.type === 'TAKE' ? '◆ TAKE' : '◆ SIGNAL'
      const brand = t.brand ? `  [${t.brand}]` : ''
      parts.push(`${prefix}  ${t.text}${brand}`)
    })
  }

  // AI editorial take
  if (data.tickerTake) parts.push(`◆ SIGNAL  ${data.tickerTake}`)

  // Latest headlines
  data.brands.slice(0, 5).forEach(b => {
    if (b.headlines?.[0]?.title) parts.push(`◆ ${b.name.toUpperCase()}  ${b.headlines[0].title}`)
  })

  // Brand verdicts + stats
  data.brands.forEach(b => {
    parts.push(`◆ ${b.name.toUpperCase()}  ${b.verdict}${b.wikiTotal ? `  ·  ${b.wikiTotal.toLocaleString()} wiki views` : ''}`)
  })

  return parts.join('          ')
}

export default function HerwoodSignal() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loadMsg, setLoadMsg] = useState('Reading the sheet')

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCached()
      if (cached) { setData(cached.data); setLastUpdated(new Date(cached.ts)); return }
    }
    setLoading(true)
    const msgs = ['Reading the sheet', 'Fetching Wikipedia', 'Scanning news', 'Computing scores', 'Writing verdicts', 'Almost live']
    let i = 0; setLoadMsg(msgs[0])
    const iv = setInterval(() => { i = Math.min(i + 1, msgs.length - 1); setLoadMsg(msgs[i]) }, 3000)
    try {
      const result = await fetchAllData()
      setCache(result)
      setData(result)
      setLastUpdated(new Date())
    } catch (e) { console.error(e) }
    finally { clearInterval(iv); setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const fmt = d => !d ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
  const sorted = data ? [...data.brands].sort((a, b) => b.score - a.score) : []
  const tickerText = buildTicker(data)

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Abril+Fatface&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:0.15}}
    @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    @keyframes cellIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
    @keyframes mobileTicker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
    .banner{background:#0E1820;font-family:'DM Sans',sans-serif;width:100%;overflow:visible;}
    .header{display:flex;align-items:center;justify-content:space-between;padding:0 18px;height:36px;border-bottom:1px solid rgba(168,196,224,0.1);}
    .masthead{font-family:'Abril Fatface',serif;font-size:13px;letter-spacing:0.18em;color:#F2F4F7;white-space:nowrap;}
    .grid{display:flex;height:140px;position:relative;overflow:visible;}
    .mobile-track{display:contents;}
    .cell{flex:1;min-width:0;border-right:1px solid rgba(14,24,32,0.7);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;position:relative;cursor:default;animation:cellIn 0.4s ease both;transition:filter 0.15s;}
    .cell:hover{filter:brightness(1.18);}
    .cell:last-child{border-right:none;}
    .cell-dup{display:none;}
    .tbar{position:absolute;top:0;left:0;right:0;height:3px;}
    .score{font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:700;line-height:1;}
    .hlabel{font-size:7.5px;font-weight:600;letter-spacing:0.14em;}
    .cname{font-size:8px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(242,244,247,0.45);}
    .trend{position:absolute;top:5px;right:7px;font-size:10px;}
    .ticker{height:38px;display:flex;align-items:center;border-top:1px solid rgba(168,196,224,0.1);overflow:hidden;}
    .tlabel{padding:0 14px;height:100%;display:flex;align-items:center;gap:6px;border-right:1px solid rgba(168,196,224,0.1);flex-shrink:0;}
    .tscroll{flex:1;overflow:hidden;display:flex;align-items:center;}
    .tinner{display:inline-block;white-space:nowrap;animation:ticker 160s linear infinite;}
    .rbtn{background:none;border:1px solid rgba(184,58,42,0.6);color:#B83A2A;padding:3px 9px;font-family:'DM Sans',sans-serif;font-size:9px;letter-spacing:0.14em;cursor:pointer;transition:all 0.2s;font-weight:600;}
    .rbtn:hover{background:#B83A2A;color:#F2F4F7;}
    .loading{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;height:214px;background:#0E1820;}
    .datasrc{display:flex;align-items:center;gap:10px;padding:0 18px;height:26px;border-bottom:1px solid rgba(168,196,224,0.07);}
    .srctag{font-size:8.5px;letter-spacing:0.1em;color:rgba(168,196,224,0.35);display:flex;align-items:center;gap:4px;}
    .srcdot{width:4px;height:4px;border-radius:50%;background:rgba(168,196,224,0.35);display:inline-block;}
    @media(max-width:768px){
      .grid{display:block;height:110px;overflow:hidden;position:relative;}
      .mobile-track{display:flex;height:110px;animation:mobileTicker 40s linear infinite;width:max-content;}
      .cell{flex:0 0 80px;width:80px;height:110px;border-right:1px solid rgba(14,24,32,0.7);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;position:relative;animation:none;}
      .cell-dup{display:flex;flex:0 0 80px;width:80px;height:110px;border-right:1px solid rgba(14,24,32,0.7);flex-direction:column;align-items:center;justify-content:center;gap:3px;position:relative;}
      .score{font-size:22px;}
      .hlabel{font-size:6px;letter-spacing:0.1em;}
      .cname{font-size:6.5px;letter-spacing:0.08em;}
      .datasrc{display:none;}
      .masthead{font-size:10px;letter-spacing:0.08em;}
      .header{padding:0 10px;height:34px;}
    }
  `

  const renderCell = (brand, i, isDup = false) => {
    const c = getHeatColor(brand.score)
    const rgb = toRgb(c)
    const faint = toRgb(c, 0.12)
    const mid = toRgb(c, 0.22)
    const trendColor = brand.trend === 'up' ? '#6fcf97' : brand.trend === 'down' ? '#B83A2A' : 'rgba(242,244,247,0.18)'
    return (
      <div
        key={isDup ? `${brand.name}-dup` : brand.name}
        className={isDup ? 'cell cell-dup' : 'cell'}
        style={{ background: `linear-gradient(to bottom,${faint},${mid})`, animationDelay: isDup ? undefined : `${i * 0.06}s` }}
      >
        <div className="tbar" style={{ background: rgb }} />
        <div className="trend" style={{ color: trendColor }}>
          {brand.trend === 'up' ? '↑' : brand.trend === 'down' ? '↓' : ''}
        </div>
        <div className="score" style={{ color: rgb }}>{brand.score}</div>
        <div className="hlabel" style={{ color: toRgb(c, 0.8) }}>{getHeatLabel(brand.score)}</div>
        <div className="cname">{brand.name}</div>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <>
        <style>{css}</style>
        <div className="loading">
          <div style={{ fontFamily: "'Abril Fatface',serif", fontSize: 15, letterSpacing: '0.18em', color: '#F2F4F7' }}>THE HERWOOD SIGNAL</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#B83A2A' }}>
            <span style={{ animation: 'blink 1.2s infinite', fontSize: 8 }}>●</span>
            {loadMsg}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(168,196,224,0.3)', letterSpacing: '0.1em' }}>Wikipedia · Guardian · Claude AI · Google Sheets</div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{css}</style>
      <div className="banner">

        <div className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="masthead">THE HERWOOD SIGNAL</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#B83A2A', display: 'inline-block', animation: 'blink 2s infinite' }} />
              <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(168,196,224,0.65)' }}>LIVE</span>
            </div>
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(168,196,224,0.28)' }}>{today}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'rgba(168,196,224,0.4)' }}>Updated {fmt(lastUpdated)}</span>
            <button className="rbtn" onClick={() => load(true)}>↺ Refresh</button>
          </div>
        </div>

        <div className="datasrc">
          <span className="srctag"><span className="srcdot" />Wikipedia</span>
          <span className="srctag"><span className="srcdot" />Guardian</span>
          <span className="srctag"><span className="srcdot" />Claude AI</span>
          <span className="srctag"><span className="srcdot" />Google Sheets CMS</span>
          <span style={{ marginLeft: 'auto', fontSize: 8.5, color: 'rgba(168,196,224,0.25)', letterSpacing: '0.08em' }}>Scores refresh hourly</span>
        </div>

        <div className="grid">
          <div className="mobile-track">
            {sorted.map((brand, i) => renderCell(brand, i, false))}
            {sorted.map((brand, i) => renderCell(brand, i, true))}
          </div>
        </div>

        <div className="ticker">
          <div className="tlabel">
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#A8C4E0', display: 'inline-block' }} />
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', color: '#A8C4E0', textTransform: 'uppercase' }}>Signal</span>
          </div>
          <div className="tscroll">
            <div className="tinner" style={{ fontSize: 11, color: 'rgba(242,244,247,0.6)', letterSpacing: '0.04em' }}>
              {tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{tickerText}
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
