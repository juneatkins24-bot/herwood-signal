export const metadata = {
  title: 'The Herwood Signal',
  description: 'Brand intelligence by Herwood Creative',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#F2F4F7' }}>{children}</body>
    </html>
  )
}
