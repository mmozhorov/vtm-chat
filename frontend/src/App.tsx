import { useState, useRef, useEffect, FormEvent } from 'react'

interface Message { role: 'user' | 'assistant'; content: string }
interface Choice { id: string; index: number; text: string }

const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0d0d0d; color: #c8a96e; font-family: Georgia, serif; height: 100vh; overflow: hidden; }
.start-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; gap: 20px; }
.start-screen h1 { font-size: 2.5rem; color: #8b0000; text-shadow: 0 0 20px #8b000088; letter-spacing: 2px; }
.start-screen p { color: #555; font-style: italic; }
.chat-container { display: flex; flex-direction: column; height: 100vh; max-width: 800px; margin: 0 auto; }
.messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.messages::-webkit-scrollbar { width: 4px; }
.messages::-webkit-scrollbar-track { background: #111; }
.messages::-webkit-scrollbar-thumb { background: #8b0000; }
.message { display: flex; gap: 12px; align-items: flex-start; }
.message-icon { font-size: 1.1rem; min-width: 20px; margin-top: 2px; }
.message.user .message-icon { color: #555; }
.message.assistant .message-icon { color: #8b0000; }
.message-content { white-space: pre-wrap; line-height: 1.7; flex: 1; }
.message.user .message-content { color: #888; }
.message.assistant .message-content { color: #c8a96e; }
.choices { padding: 8px 20px 12px; display: flex; flex-wrap: wrap; gap: 8px; border-top: 1px solid #1a0000; }
.choices button { background: #110000; border: 1px solid #8b0000; color: #c8a96e; padding: 8px 16px; cursor: pointer; font-family: Georgia, serif; font-size: 0.9rem; transition: background 0.2s; }
.choices button:hover { background: #2d0000; }
.input-form { display: flex; padding: 16px; border-top: 1px solid #1a1a1a; gap: 8px; }
.input-form input { flex: 1; background: #0f0f0f; border: 1px solid #2a2a2a; color: #c8a96e; padding: 10px 14px; font-family: Georgia, serif; font-size: 0.95rem; }
.input-form input:focus { outline: none; border-color: #8b0000; }
.input-form input::placeholder { color: #333; }
.input-form button { background: #8b0000; border: none; color: #c8a96e; padding: 10px 20px; cursor: pointer; font-size: 1.1rem; }
.input-form button:disabled { opacity: 0.35; cursor: not-allowed; }
.start-screen input { background: #0f0f0f; border: 1px solid #333; color: #c8a96e; padding: 10px 16px; font-family: Georgia, serif; font-size: 1rem; width: 260px; text-align: center; }
.start-screen button { background: #8b0000; border: 1px solid #8b0000; color: #c8a96e; padding: 10px 28px; cursor: pointer; font-family: Georgia, serif; font-size: 1rem; letter-spacing: 1px; }
`

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [choices, setChoices] = useState<Choice[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [sessionStarted, setSessionStarted] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const streamChat = async (message: string) => {
    setChoices([])
    setStreaming(true)
    setMessages(prev => [
      ...prev,
      { role: 'user', content: message },
      { role: 'assistant', content: '' },
    ])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.token) {
              setMessages(prev => {
                const last = prev[prev.length - 1]
                return [...prev.slice(0, -1), { ...last, content: last.content + data.token }]
              })
            }
            if (data.done) setChoices(data.choices ?? [])
            if (data.error) console.error('Agent error:', data.error)
          } catch { /* partial chunk */ }
        }
      }
    } finally {
      setStreaming(false)
    }
  }

  const startSession = async () => {
    await fetch('/api/session/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_name: playerName || 'Игрок' }),
    })
    setSessionStarted(true)
    await streamChat('Начало игры. Опиши вступительную сцену.')
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || streaming) return
    const msg = input.trim()
    setInput('')
    void streamChat(msg)
  }

  if (!sessionStarted) {
    return (
      <>
        <style>{css}</style>
        <div className="start-screen">
          <h1>Vampire: The Masquerade</h1>
          <p>Chicago by Night — II Edition</p>
          <input
            placeholder="Имя вашего персонажа"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void startSession()}
          />
          <button onClick={() => void startSession()}>Войти в ночь</button>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{css}</style>
      <div className="chat-container">
        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <span className="message-icon">{m.role === 'user' ? '▶' : '◆'}</span>
              <span className="message-content">{m.content}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {choices.length > 0 && !streaming && (
          <div className="choices">
            {choices.map(c => (
              <button key={c.id} onClick={() => void streamChat(String(c.index))}>
                {c.index}. {c.text}
              </button>
            ))}
          </div>
        )}

        <form className="input-form" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={streaming ? '...' : 'Действие или вопрос...'}
            disabled={streaming}
          />
          <button type="submit" disabled={streaming || !input.trim()}>→</button>
        </form>
      </div>
    </>
  )
}
