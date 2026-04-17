"use client"

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react"

export type Message = {
  role: "user" | "bot"
  text: string
  sources?: string[]
  isError?: boolean  // error messages are excluded from history sent to the API
}

interface ChatContextValue {
  messages: Message[]
  addMessage: (msg: Message) => void
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  position: { x: number; y: number } | null
  setPosition: Dispatch<SetStateAction<{ x: number; y: number } | null>>
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "Привет! Я помощник BarberHub. Спросите меня о правилах платформы, стрижках или ценах в Алматы.",
    },
  ])
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  // Restore FAB position from localStorage, or default to bottom-right corner.
  // Clamped to FAB_SIZE (not chat window width) — smart placement handles
  // the chat window separately at render time.
  useEffect(() => {
    const FAB  = 56  // w-14 h-14
    const M    = 8   // margin from edges

    const saved = localStorage.getItem("chatWidgetPos")
    if (saved) {
      try {
        const p = JSON.parse(saved) as { x: number; y: number }
        setPosition({
          x: Math.max(0, Math.min(p.x, window.innerWidth  - FAB - M)),
          y: Math.max(0, Math.min(p.y, window.innerHeight - FAB - M)),
        })
        return
      } catch {
        // Corrupt data — fall through to default
      }
    }

    setPosition({
      x: window.innerWidth  - FAB - M,
      y: window.innerHeight - FAB - M,
    })
  }, [])

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  return (
    <ChatContext.Provider value={{ messages, addMessage, open, setOpen, position, setPosition }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error("useChatContext must be used within <ChatProvider>")
  return ctx
}
