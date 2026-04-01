# The Herwood Signal

Live brand intelligence banner by Herwood Creative.
Pulls real data from Wikipedia Pageviews + NewsAPI, scored and verdicted by Claude AI.

---

## Deploy to Vercel in 5 steps

### 1. Install dependencies
```
npm install
```

### 2. Add your environment variables
Create a `.env.local` file in the root:
```
ANTHROPIC_API_KEY=your_anthropic_key_here
NEXT_PUBLIC_NEWSAPI_KEY=your_newsapi_key_here
```

> **Note:** `ANTHROPIC_API_KEY` is server-side only (safe).
> `NEXT_PUBLIC_NEWSAPI_KEY` is client-side (visible in source — fine for dev/testing).

### 3. Run locally to test
```
npm run dev
```
Open http://localhost:3000

### 4. Push to GitHub
Create a new repo and push this folder to it.

### 5. Deploy on Vercel
- Go to vercel.com → New Project → Import your repo
- In Project Settings → Environment Variables, add:
  - `ANTHROPIC_API_KEY` → your key
  - `NEXT_PUBLIC_NEWSAPI_KEY` → your key
- Hit Deploy

---

## To embed on Squarespace
Once deployed, grab your Vercel URL (e.g. `https://herwood-signal.vercel.app`) and embed it:
```html
<iframe
  src="https://herwood-signal.vercel.app"
  width="100%"
  height="220"
  frameborder="0"
  scrolling="no"
  style="border-radius:4px;"
></iframe>
```

## Swap brands
Edit `src/components/HerwoodSignal.js` — find the `BRANDS` array at the top.
Each entry needs:
- `name` — display name
- `wiki` — Wikipedia article slug (from the URL)
- `news` — NewsAPI search query

## Add Airtable hot takes (next phase)
See AIRTABLE.md (coming soon)
