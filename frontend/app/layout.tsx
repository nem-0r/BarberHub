import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'
import { FloatingChatWidget } from '@/components/ui/floating-chat'
import { ChatProvider } from '@/context/chat-context'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// Use Inter as fallback for Clash Display since it's a premium font
const clashDisplay = Inter({
  subsets: ['latin'],
  variable: '--font-clash',
  display: 'swap',
  weight: ['700', '800'],
})

export const metadata: Metadata = {
  title: 'BarberHub — Discover & Book Top Barbershops',
  description: 'Find and book appointments at the best barbershops near you. Premium grooming services, easy online booking, and verified reviews.',
  generator: 'v0.app',
}

export const viewport = {
  themeColor: '#0e0e0e',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <body className={`${inter.variable} ${clashDisplay.variable} font-sans antialiased bg-background text-foreground`}>
        <ChatProvider>
          {children}
          <FloatingChatWidget />
        </ChatProvider>
      </body>
    </html>
  )
}
