const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTT0y1M7zRKbO8x0e_tNF7tzqFOE-04bXorKZ-EAo1jTzom44IaooyhMp75oCGf1a-OLDz-ZkcoVinC/pub?gid=428892484&single=true&output=csv'

export async function GET() {
  try {
    const res = await fetch(SHEET_CSV, { cache: 'no-store' })
    const text = await res.text()

    const rows = text.trim().split('\n').map(r => {
      // Handle quoted CSV fields properly
      const cols = []
      let cur = '', inQuote = false
      for (const ch of r) {
        if (ch === '"') { inQuote = !inQuote }
        else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
        else { cur += ch }
      }
      cols.push(cur.trim())
      return cols
    })

    // Skip header rows (row 1 = title, row 2 = column headers)
    const brands = rows.slice(2).filter(r => {
      const status = r[4]?.toLowerCase()
      return r[1] && status === 'live'
    }).map(r => ({
      name: r[1] || '',
      wiki: r[2] || '',
      news: r[3] || r[1] || '',
      scoreOverride: r[5] ? parseInt(r[5]) : null,
      note: r[6] || '',
    }))

    return Response.json({ brands })
  } catch (e) {
    return Response.json({ brands: [], error: e.message })
  }
}
