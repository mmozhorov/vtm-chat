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
.message.user .message-content { color: #7a9e7e; font-style: italic; border-left: 2px solid #2a4a2e; padding-left: 10px; }
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
.audio-btn { position: fixed; top: 14px; right: 20px; background: transparent; border: 1px solid #222; color: #3a3a3a; padding: 5px 10px; cursor: pointer; font-size: 1rem; font-family: Georgia, serif; z-index: 1000; transition: all 0.2s; }
.audio-btn:hover { border-color: #444; color: #666; }
.audio-btn.on { color: #c8a96e; border-color: #555; }
@keyframes blink { 0%, 80%, 100% { opacity: 0.15 } 40% { opacity: 1 } }
.dots { display: inline-flex; gap: 6px; align-items: center; padding: 6px 0; }
.dots span { width: 7px; height: 7px; background: #8b0000; border-radius: 50%; animation: blink 1.4s ease-in-out infinite; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
.thinking-label { color: #444; font-size: 0.85rem; font-style: italic; margin-left: 8px; }
`

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [choices, setChoices] = useState<Choice[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [sessionStarted, setSessionStarted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [muted, setMuted] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytPlayer = useRef<any>(null)

  // Load YouTube IFrame API and create hidden background player
  useEffect(() => {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).onYouTubeIframeAPIReady = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ytPlayer.current = new (window as any).YT.Player('ytplayer', {
        playerVars: {
          listType: 'playlist',
          list: 'PLfzW_wEeYxk6xZzzUQIJnunXj98WGFb07',
          autoplay: 1,
          loop: 1,
          controls: 0,
          mute: 1,
          index: Math.floor(Math.random() * 20),
        },
        events: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: (e: any) => {
            e.target.mute()
            e.target.setVolume(40)
            e.target.playVideo()
          },
        },
      })
    }
  }, [])

  useEffect(() => {
    const fetchSession = async () => {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const r = await fetch('/api/session')
          const { session } = await r.json() as { session: { history: { role: 'user' | 'assistant'; content: string }[]; player_name: string } | null }
          if (session) {
            setMessages(session.history.map(h => ({ role: h.role, content: h.content })))
            setPlayerName(session.player_name)
            setSessionStarted(true)
            const choicesRes = await fetch('/api/choices')
            const { choices: current } = await choicesRes.json() as { choices: Choice[] }
            setChoices(current ?? [])
          }
          setLoading(false)
          return
        } catch {
          if (attempt < 5) await new Promise(res => setTimeout(res, 500 * (attempt + 1)))
        }
      }
      setLoading(false)
    }
    void fetchSession()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const toggleMute = () => {
    if (!ytPlayer.current) return
    if (muted) {
      ytPlayer.current.unMute()
      ytPlayer.current.setVolume(40)
    } else {
      ytPlayer.current.mute()
    }
    setMuted(m => !m)
  }

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

  // Hidden YouTube player (1×1, off-screen — must always be in DOM)
  const ytDiv = (
    <div
      id="ytplayer"
      style={{ position: 'fixed', bottom: 0, left: '-2px', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none' }}
    />
  )

  // Audio toggle button (always visible, dims when muted)
  const audioBtn = (
    <button className={`audio-btn${!muted ? ' on' : ''}`} onClick={toggleMute} title={muted ? 'Включить музыку' : 'Выключить музыку'}>
      {muted ? '🔇' : '🔊'}
    </button>
  )

  if (loading) {
    return (
      <>
        <style>{css}</style>
        {ytDiv}
        <div className="start-screen">
          <div className="dots"><span /><span /><span /></div>
        </div>
      </>
    )
  }

  if (!sessionStarted) {
    return (
      <>
        <style>{css}</style>
        {ytDiv}
        {audioBtn}
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
      {ytDiv}
      {audioBtn}
      <div className="chat-container">
        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <span className="message-icon">{m.role === 'user' ? '▶' : '◆'}</span>
              {m.role === 'assistant' && m.content === '' && streaming && i === messages.length - 1 ? (
                <span className="message-content">
                  <span className="dots"><span /><span /><span /></span>
                  <span className="thinking-label">рассказчик думает...</span>
                </span>
              ) : (
                <span className="message-content">{m.content}</span>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {choices.length > 0 && !streaming && (
          <div className="choices">
            {choices.map(c => (
              <button key={c.id} onClick={() => void streamChat(`${c.index}. ${c.text}`)}>
                {c.text}
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
