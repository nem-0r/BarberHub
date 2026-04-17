"use client"

import { useState, useRef, useEffect } from "react"
import { useChatContext } from "@/context/chat-context"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

const FAB_SIZE = 56  // w-14 h-14 in px
const CHAT_W   = 320 // w-80
const CHAT_H   = 500 // h-[500px]
const GAP      = 8   // gap between FAB and chat window
const MARGIN   = 8   // min distance from any viewport edge

/**
 * Given the FAB's top-left corner (fabX, fabY), compute the best
 * top-left corner for the chat window so it stays fully inside the viewport.
 *
 * Vertical: prefer above the FAB, fall back to below, clamp if neither fits.
 * Horizontal: align to the same half of the screen the FAB is in, then clamp.
 */
function computeChatPos(fabX: number, fabY: number): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // ── Vertical ──────────────────────────────────────────────────────────────
  const spaceAbove = fabY - MARGIN
  const spaceBelow = vh - (fabY + FAB_SIZE) - MARGIN

  let cy: number
  if (spaceAbove >= CHAT_H) {
    cy = fabY - CHAT_H - GAP
  } else if (spaceBelow >= CHAT_H) {
    cy = fabY + FAB_SIZE + GAP
  } else if (spaceAbove >= spaceBelow) {
    // More room above but not enough — push window up as far as it fits
    cy = Math.max(MARGIN, fabY - CHAT_H - GAP)
  } else {
    // More room below — push down as far as it fits
    cy = Math.min(vh - CHAT_H - MARGIN, fabY + FAB_SIZE + GAP)
  }

  // ── Horizontal ────────────────────────────────────────────────────────────
  // If FAB is in the right half → right-align the chat window with the FAB's right edge.
  // If FAB is in the left half  → left-align the chat window with the FAB's left edge.
  let cx: number
  if (fabX + FAB_SIZE / 2 >= vw / 2) {
    cx = fabX + FAB_SIZE - CHAT_W // right-aligned
  } else {
    cx = fabX                     // left-aligned
  }
  cx = Math.max(MARGIN, Math.min(cx, vw - CHAT_W - MARGIN))

  return { x: cx, y: cy }
}

export function FloatingChatWidget() {
  const { messages, addMessage, open, setOpen, position, setPosition } = useChatContext()
  const [input, setInput]   = useState("")
  const [loading, setLoading] = useState(false)

  const fabRef    = useRef<HTMLButtonElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  // Drag state in refs — no re-renders during mousemove
  const isDragging = useRef(false)
  const hasDragged = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, open])

  // ── Drag (Pointer Events + setPointerCapture) ─────────────────────────────
  function onDragStart(e: React.PointerEvent) {
    if (!fabRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = fabRef.current.getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    isDragging.current = true
    hasDragged.current = false
  }

  function onDragMove(e: React.PointerEvent) {
    if (!isDragging.current) return
    hasDragged.current = true
    setPosition({
      x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth  - FAB_SIZE)),
      y: Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - FAB_SIZE)),
    })
  }

  function onDragEnd() {
    isDragging.current = false
    // Persist final position to localStorage (one write per gesture, not per frame)
    if (hasDragged.current) {
      setPosition((prev) => {
        if (prev) localStorage.setItem("chatWidgetPos", JSON.stringify(prev))
        return prev
      })
    }
  }

  function handleFabClick() {
    if (!hasDragged.current) setOpen((v) => !v)
  }
  // ─────────────────────────────────────────────────────────────────────────

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    // Snapshot last 6 non-error messages as conversation history
    const history = messages
      .filter((m) => !m.isError)
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }))

    addMessage({ role: "user", text })
    setInput("")
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unknown error" }))
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }

      const data: { reply: string; sources: string[] } = await res.json()
      addMessage({ role: "bot", text: data.reply, sources: data.sources })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ошибка соединения"
      addMessage({
        role: "bot",
        text: `Произошла ошибка: ${message}. Попробуйте ещё раз.`,
        isError: true,
      })
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // FAB CSS: uses computed position after mount, falls back to bottom-right during SSR
  const fabStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y }
    : { bottom: "1.5rem", right: "1.5rem" }

  // Chat window position — computed fresh each render from current FAB position
  const chatPos = position && open ? computeChatPos(position.x, position.y) : null

  return (
    <>
      {/* ── Chat window ─ independently positioned ───────────────────────── */}
      {open && chatPos && (
        <div
          className="fixed z-40 w-80 h-[500px] bg-white/80 backdrop-blur-md shadow-2xl rounded-2xl flex flex-col border border-white/20 overflow-hidden"
          style={{ left: chatPos.x, top: chatPos.y }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 text-white rounded-t-2xl flex-shrink-0 select-none">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm font-semibold">BarberHub Ассистент</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Закрыть чат"
              className="text-zinc-400 hover:text-white transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-zinc-50">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-zinc-900 text-white rounded-br-sm"
                      : msg.isError
                      ? "bg-red-50 text-red-700 border border-red-200 rounded-bl-sm"
                      : "bg-white text-zinc-800 shadow-sm border border-zinc-100 rounded-bl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {msg.sources && msg.sources.length > 0 && (
                    <p className="mt-1 text-[10px] text-zinc-400">
                      📄 {msg.sources.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white shadow-sm border border-zinc-100 rounded-2xl rounded-bl-sm px-3 py-2">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 px-3 py-3 border-t border-zinc-200 bg-white flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Задайте вопрос..."
              disabled={loading}
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:border-zinc-400 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              aria-label="Отправить"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-900 text-white hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.9 28.9 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.9 28.9 0 0 0 3.105 2.288Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── FAB ─ draggable, always on top ───────────────────────────────── */}
      <button
        ref={fabRef}
        className="fixed z-50 w-14 h-14 rounded-full bg-zinc-900 text-white shadow-lg hover:bg-zinc-700 transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing"
        style={fabStyle}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onClick={handleFabClick}
        aria-label={open ? "Закрыть чат" : "Открыть чат"}
      >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-6 h-6"
          >
            <path
              fillRule="evenodd"
              d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902.848.137 1.705.248 2.57.331v3.443a.75.75 0 0 0 1.28.53l3.58-3.579a.78.78 0 0 1 .527-.224 41.202 41.202 0 0 0 5.183-.5c1.437-.232 2.43-1.49 2.43-2.903V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0 0 10 2Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM8 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm5 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
    </>
  )
}
