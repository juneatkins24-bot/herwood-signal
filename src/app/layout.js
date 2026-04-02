export const metadata = {
  title: 'The Herwood Signal',
  description: 'Brand intelligence by Herwood Creative',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#0E1820' }}>{children}</body>
    </html>
  )
}
