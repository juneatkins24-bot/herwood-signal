const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTT0y1M7zRKbO8x0e_tNF7tzqFOE-04bXorKZ-EAo1jTzom44IaooyhMp75oCGf1a-OLDz-ZkcoVinC/pub?gid=1254170717&single=true&output=csv'

export async function GET() {
  try {
    const res = await fetch(SHEET_CSV, { cache: 'no-store' })
    const text = await res.text()

    const rows = text.trim().split('\n').map(r => {
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
    const takes = rows.slice(2).filter(r => {
      const status = r[4]?.toLowerCase()
      return r[2] && status === 'live'
    }).map(r => ({
      type: r[1] || 'SIGNAL',
      text: r[2] || '',
      brand: r[3] || '',
    }))

    return Response.json({ takes })
  } catch (e) {
    return Response.json({ takes: [], error: e.message })
  }
}
