import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'UnusualProbs - Prediction Market Aggregator',
  description: 'Compare prediction markets from Polymarket and Kalshi',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
