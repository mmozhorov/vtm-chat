import express from 'express'
import cors from 'cors'
import { Ollama } from '@langchain/ollama'
import { createRetriever } from '../shared/retriever.js'
import { createDriveClient } from '../shared/drive.js'
import { loadGraphCache } from './graph-cache.js'
import { readSession, writeSession, createSession } from './session.js'
import { buildChatGraph } from './graph.js'
import type { GraphCache } from './graph-cache.js'
import type { Session } from './types.js'

const app = express()
app.use(cors())
app.use(express.json())

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? ''
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'

let cache: GraphCache = { nodes: [], edges: [], lore: [] }
let session: Session | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let graph: any = null

app.get('/api/session', (_req, res) => {
  res.json({ session })
})

app.post('/api/session/new', (req, res) => {
  const playerName: string = req.body.player_name ?? 'Игрок'
  const introNode = cache.nodes.find(n => n.type === 'intro')
  if (!introNode) {
    res.status(400).json({ error: 'No intro node found. Run npm run pregen first.' })
    return
  }
  session = createSession(playerName, introNode.id)
  writeSession(session)
  res.json({ session })
})

app.get('/api/choices', (_req, res) => {
  const currentNodeId = session?.current_node_id ?? ''
  const choices = cache.edges
    .filter(e => e.from_node_id === currentNodeId)
    .map((e, i) => ({ id: e.id, index: i + 1, text: e.choice_text }))
  res.json({ choices })
})

app.post('/api/chat', async (req, res) => {
  if (!session) {
    res.status(400).json({ error: 'No active session. POST /api/session/new first.' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const input = {
    message: String(req.body.message ?? ''),
    session,
    nodes: cache.nodes,
    edges: cache.edges,
    lore: cache.lore,
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalState: any = null

    const eventStream = graph.streamEvents(input, { version: 'v2' })
    for await (const event of eventStream) {
      if (
        event.event === 'on_llm_stream' &&
        event.metadata?.langgraph_node === 'generate_response'
      ) {
        const token: string = event.data?.chunk?.text ?? event.data?.chunk ?? ''
        if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`)
      }
      if (event.event === 'on_chain_end' && event.name === 'LangGraph') {
        finalState = event.data?.output
      }
    }

    // Update server-side cache and session from final state
    if (finalState?.nodes) cache.nodes = finalState.nodes
    if (finalState?.session) {
      session = finalState.session
    }

    const currentNodeId = finalState?.session?.current_node_id ?? session?.current_node_id ?? ''
    const choices = cache.edges
      .filter(e => e.from_node_id === currentNodeId)
      .map((e, i) => ({ id: e.id, index: i + 1, text: e.choice_text }))

    res.write(`data: ${JSON.stringify({ done: true, choices })}\n\n`)
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
  }
  res.end()
})

async function start() {
  if (!FOLDER_ID) {
    console.error('✗ GOOGLE_DRIVE_FOLDER_ID environment variable is required')
    process.exit(1)
  }

  console.log('=== VtM Chat Server ===\n')
  console.log('Connecting to services...')

  const [retriever, drive] = await Promise.all([
    createRetriever(),
    createDriveClient(),
  ])
  console.log('  ✓ LanceDB + Drive connected')

  cache = await loadGraphCache(drive, FOLDER_ID)
  console.log(`  ✓ Loaded ${cache.nodes.length} nodes, ${cache.edges.length} edges`)

  session = readSession()
  console.log(session ? `  ✓ Session restored: ${session.player_name}` : '  ℹ No saved session (POST /api/session/new to start)')

  const llm = new Ollama({ model: 'qwen2.5:14b', baseUrl: OLLAMA_BASE_URL })
  graph = buildChatGraph(retriever, llm, drive, FOLDER_ID)

  app.listen(3001, () => {
    console.log('\n✓ Server ready on http://localhost:3001')
    console.log('  Run: npm run dev  (starts both server + frontend)')
  })
}

start().catch(err => {
  console.error('✗ Server failed to start:', err.message)
  process.exit(1)
})
