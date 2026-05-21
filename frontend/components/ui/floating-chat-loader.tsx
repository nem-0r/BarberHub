"use client"

import dynamic from "next/dynamic"

// Load the chat widget as a separate client chunk so its JS isn't parsed on initial navigation.
const FloatingChatWidget = dynamic(
  () => import("@/components/ui/floating-chat").then((m) => m.FloatingChatWidget),
  { ssr: false }
)

export function FloatingChatLoader() {
  return <FloatingChatWidget />
}
