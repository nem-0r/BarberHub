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
  id: string
  role: "user" | "bot"
  text: string
  sources?: string[]
  isError?: boolean
}

interface ChatContextValue {
  messages: Message[]
  addMessage: (msg: Omit<Message, "id"> & { id?: string }) => void
  updateLastBotMessage: (patch: (msg: Message) => Message) => void
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  position: { x: number; y: number } | null
  setPosition: Dispatch<SetStateAction<{ x: number; y: number } | null>>
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init-0",
      role: "bot",
      text: "Привет! Я помощник BarberHub. Спросите меня о правилах платформы, стрижках или ценах в Алматы.",
    },
  ])
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

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
        // ignore corrupt data
      }
    }

    setPosition({
      x: window.innerWidth  - FAB - M,
      y: window.innerHeight - FAB - M,
    })
  }, [])

  const addMessage = useCallback((msg: Omit<Message, "id"> & { id?: string }) => {
    const withId: Message = { id: msg.id ?? crypto.randomUUID(), ...msg }
    setMessages((prev) => [...prev, withId])
  }, [])

  const updateLastBotMessage = useCallback((patch: (msg: Message) => Message) => {
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "bot") {
          const next = prev.slice()
          next[i] = patch(prev[i])
          return next
        }
      }
      return prev
    })
  }, [])

  return (
    <ChatContext.Provider value={{ messages, addMessage, updateLastBotMessage, open, setOpen, position, setPosition }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error("useChatContext must be used within <ChatProvider>")
  return ctx
}
