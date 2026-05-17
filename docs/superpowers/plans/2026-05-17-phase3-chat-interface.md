# Phase 3: Chat Interface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable VtM chat interface — Express.js backend with SSE streaming + React frontend — backed by a LangGraph agent that routes player input through RAG lookup or story graph navigation.

**Architecture:** LangGraph `ChatState` graph with 6 nodes: `parse_intent → [route] → rag_lookup | navigate_graph → expand_scene → generate_response → save_session`. Backend streams `generate_response` LLM tokens to the browser via `graph.streamEvents()`. Frontend is React + Vite on port 3000 proxied to Express on port 3001.

**Tech Stack:** TypeScript ESM (Node16), `@langchain/langgraph` StateGraph, `@langchain/ollama` (qwen2.5:14b), Express.js + CORS, Vite + React, `concurrently` (dev runner), Vitest.

---

## Codebase Context

This is a TypeScript ESM project (`"type": "module"`, `moduleResolution: "Node16"`). All imports require `.js` extensions. Existing patterns:
- Nodes are pure functions or async functions accepting `(state, ...deps)` — see `src/story/nodes/`
- `BaseLLM` calls use `llm.invoke(prompt as never)` → returns string via `String(...)`
- `DriveClient` interface from `src/shared/drive.ts` (methods: `readJSON`, `writeJSON`)
- Tests mock LLM/retriever/drive with `vi.fn()` and cast to `never`

Story types already exist in `src/story/types.ts`: `StoryNode`, `StoryEdge`, `LoreEntry`.

---

## File Map

| File | Create/Modify | Responsibility |
|---|---|---|
| `package.json` | Modify | Add express, cors, react, vite, concurrently; add `dev`/`server` scripts |
| `.env.example` | Modify | Add `SESSION_PATH` |
| `src/chat/types.ts` | Create | `Session` interface, `Intent` type, `ChatState` LangGraph Annotation |
| `src/chat/session.ts` | Create | `readSession` / `writeSession` / `createSession` |
| `src/chat/graph-cache.ts` | Create | `GraphCache` interface + `loadGraphCache(drive, folderId)` |
| `src/chat/nodes/parse_intent.ts` | Create | LLM intent classifier → `'lore_question' \| 'make_choice' \| 'explore_scene'` |
| `src/chat/nodes/rag_lookup.ts` | Create | LanceDB retriever → fills `ragContext` |
| `src/chat/nodes/navigate_graph.ts` | Create | Pure function: parse choice number → update `session.current_node_id` |
| `src/chat/nodes/expand_scene.ts` | Create | If `is_expanded === false`: RAG + LLM fill + Drive write |
| `src/chat/nodes/generate_response.ts` | Create | LLM narrative generation (streamed by server via `streamEvents`) |
| `src/chat/nodes/save_session.ts` | Create | Append `history`, call `writeSession` |
| `src/chat/graph.ts` | Create | StateGraph wiring + `routeByIntent` conditional edge function |
| `src/chat/server.ts` | Create | Express app: 4 endpoints, SSE streaming via `graph.streamEvents()` |
| `frontend/index.html` | Create | Vite HTML entrypoint |
| `frontend/tsconfig.json` | Create | Frontend TS config (jsx, bundler moduleResolution) |
| `frontend/vite.config.ts` | Create | Vite config with port 3000 + `/api` proxy to 3001 |
| `frontend/src/main.tsx` | Create | React entrypoint |
| `frontend/src/App.tsx` | Create | Chat UI with SSE streaming, choice buttons, dark gothic CSS |
| `tests/chat/session.test.ts` | Create | readSession / writeSession / createSession tests |
| `tests/chat/graph-cache.test.ts` | Create | loadGraphCache tests (mocked DriveClient) |
| `tests/chat/nodes/parse_intent.test.ts` | Create | Intent classification (mocked LLM) |
| `tests/chat/nodes/rag_lookup.test.ts` | Create | Retriever → ragContext (mocked retriever) |
| `tests/chat/nodes/navigate_graph.test.ts` | Create | Pure function tests |
| `tests/chat/nodes/expand_scene.test.ts` | Create | expand/no-op (mocked retriever + LLM + drive) |
| `tests/chat/nodes/generate_response.test.ts` | Create | LLM prompt shape (mocked LLM) |
| `tests/chat/nodes/save_session.test.ts` | Create | History append (mocked writeSession) |
| `tests/chat/graph.test.ts` | Create | `routeByIntent` pure function |

---

## Task 1: Dependencies + Scripts

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Add dependencies**

In `package.json`, add to `"dependencies"`:
```json
"cors": "^2.8.5",
"express": "^4.19.2"
```

Add to `"devDependencies"`:
```json
"@types/cors": "^2.8.17",
"@types/express": "^5.0.0",
"@vitejs/plugin-react": "^4.3.1",
"concurrently": "^9.1.0",
"react": "^18.3.1",
"react-dom": "^18.3.1",
"vite": "^5.4.0"
```

Add `@types/react` and `@types/react-dom` to devDependencies:
```json
"@types/react": "^18.3.0",
"@types/react-dom": "^18.3.0"
```

- [ ] **Step 2: Add npm scripts**

In `package.json` `"scripts"`, add:
```json
"dev": "concurrently \"tsx watch src/chat/server.ts\" \"vite frontend\"",
"server": "tsx src/chat/server.ts"
```

- [ ] **Step 3: Add SESSION_PATH to .env.example**

Append to `.env.example`:
```
# Phase 3
SESSION_PATH=./data/session.json
```

- [ ] **Step 4: Install**

Run: `npm install`
Expected: installs express, cors, vite, react, etc. No errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat: add Phase 3 deps (express, vite, react, concurrently)"
```

---

## Task 2: Chat Types + Session

**Files:**
- Create: `src/chat/types.ts`
- Create: `src/chat/session.ts`
- Create: `tests/chat/session.test.ts`

- [ ] **Step 1: Write failing tests for session.ts**

Create `tests/chat/session.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'

vi.mock('fs')

describe('session', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('readSession returns null when file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { readSession } = await import('../../src/chat/session.js')
    expect(readSession()).toBeNull()
  })

  it('readSession returns parsed session when file exists', async () => {
    const session = { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] }
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(session) as never)
    const { readSession } = await import('../../src/chat/session.js')
    expect(readSession()).toEqual(session)
  })

  it('writeSession serializes session to file', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as never)
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined)
    const { writeSession } = await import('../../src/chat/session.js')
    const session = { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] }
    writeSession(session)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('session.json'),
      expect.stringContaining('"id": "s1"'),
    )
  })

  it('createSession initializes session with player and intro node', async () => {
    const { createSession } = await import('../../src/chat/session.js')
    const session = createSession('Луций', 'n_intro')
    expect(session.player_name).toBe('Луций')
    expect(session.current_node_id).toBe('n_intro')
    expect(session.visited_nodes).toEqual(['n_intro'])
    expect(session.history).toEqual([])
    expect(session.id).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/chat/session.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `src/chat/types.ts`**

```typescript
import { Annotation } from '@langchain/langgraph'
import type { StoryNode, StoryEdge, LoreEntry } from '../story/types.js'

export interface Session {
  id: string
  player_name: string
  current_node_id: string
  visited_nodes: string[]
  history: { role: 'user' | 'assistant'; content: string }[]
}

export type Intent = 'lore_question' | 'make_choice' | 'explore_scene'

export const ChatState = Annotation.Root({
  message: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  intent: Annotation<Intent | null>({ reducer: (_, b) => b, default: () => null }),
  session: Annotation<Session>({
    reducer: (_, b) => b,
    default: () => ({ id: '', player_name: '', current_node_id: '', visited_nodes: [], history: [] }),
  }),
  nodes: Annotation<StoryNode[]>({ reducer: (_, b) => b, default: () => [] }),
  edges: Annotation<StoryEdge[]>({ reducer: (_, b) => b, default: () => [] }),
  lore: Annotation<LoreEntry[]>({ reducer: (_, b) => b, default: () => [] }),
  ragContext: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  response: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
})

export type ChatStateType = typeof ChatState.State
```

- [ ] **Step 4: Create `src/chat/session.ts`**

```typescript
import fs from 'fs'
import { randomUUID } from 'crypto'
import type { Session } from './types.js'

const SESSION_PATH = process.env.SESSION_PATH ?? './data/session.json'

export function readSession(): Session | null {
  if (!fs.existsSync(SESSION_PATH)) return null
  return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf-8')) as Session
}

export function writeSession(session: Session): void {
  fs.mkdirSync('./data', { recursive: true })
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2))
}

export function createSession(playerName: string, introNodeId: string): Session {
  return {
    id: randomUUID(),
    player_name: playerName,
    current_node_id: introNodeId,
    visited_nodes: [introNodeId],
    history: [],
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/chat/session.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/chat/types.ts src/chat/session.ts tests/chat/session.test.ts
git commit -m "feat: chat types, Session interface, ChatState annotation, session I/O"
```

---

## Task 3: Graph Cache

**Files:**
- Create: `src/chat/graph-cache.ts`
- Create: `tests/chat/graph-cache.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/chat/graph-cache.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { StoryNode, StoryEdge, LoreEntry } from '../../src/story/types.js'

const nodes: StoryNode[] = [{ id: 'n1', title: 'Intro', description_template: '{{details}}', npc_ids: [], location: 'Chicago', type: 'intro', is_expanded: false }]
const edges: StoryEdge[] = [{ id: 'e1', from_node_id: 'n1', to_node_id: 'n2', choice_text: 'Enter', condition: '' }]
const lore: LoreEntry[] = [{ id: 'l1', type: 'character', name: 'Луций', summary: 'Древний вампир' }]

describe('loadGraphCache', () => {
  it('reads nodes, edges, and lore from Drive', async () => {
    const mockDrive = {
      readJSON: vi.fn()
        .mockResolvedValueOnce(nodes)
        .mockResolvedValueOnce(edges)
        .mockResolvedValueOnce(lore),
      writeJSON: vi.fn(),
    }
    const { loadGraphCache } = await import('../../src/chat/graph-cache.js')
    const cache = await loadGraphCache(mockDrive, 'folder1')
    expect(cache.nodes).toEqual(nodes)
    expect(cache.edges).toEqual(edges)
    expect(cache.lore).toEqual(lore)
    expect(mockDrive.readJSON).toHaveBeenCalledWith('folder1', 'nodes.json')
    expect(mockDrive.readJSON).toHaveBeenCalledWith('folder1', 'edges.json')
    expect(mockDrive.readJSON).toHaveBeenCalledWith('folder1', 'lore.json')
  })

  it('returns empty arrays when Drive files are missing', async () => {
    const mockDrive = { readJSON: vi.fn().mockResolvedValue(null), writeJSON: vi.fn() }
    const { loadGraphCache } = await import('../../src/chat/graph-cache.js')
    const cache = await loadGraphCache(mockDrive, 'folder1')
    expect(cache.nodes).toEqual([])
    expect(cache.edges).toEqual([])
    expect(cache.lore).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/chat/graph-cache.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `src/chat/graph-cache.ts`**

```typescript
import type { DriveClient } from '../shared/drive.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../story/types.js'

export interface GraphCache {
  nodes: StoryNode[]
  edges: StoryEdge[]
  lore: LoreEntry[]
}

export async function loadGraphCache(
  drive: DriveClient,
  folderId: string,
): Promise<GraphCache> {
  const [nodes, edges, lore] = await Promise.all([
    drive.readJSON<StoryNode[]>(folderId, 'nodes.json'),
    drive.readJSON<StoryEdge[]>(folderId, 'edges.json'),
    drive.readJSON<LoreEntry[]>(folderId, 'lore.json'),
  ])
  return {
    nodes: nodes ?? [],
    edges: edges ?? [],
    lore: lore ?? [],
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/chat/graph-cache.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/chat/graph-cache.ts tests/chat/graph-cache.test.ts
git commit -m "feat: graph cache — loads nodes/edges/lore from Drive at server start"
```

---

## Task 4: parse_intent Node

**Files:**
- Create: `src/chat/nodes/parse_intent.ts`
- Create: `tests/chat/nodes/parse_intent.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/chat/nodes/parse_intent.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { ChatStateType } from '../../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../../src/story/types.js'

function makeState(overrides: Partial<ChatStateType> = {}): ChatStateType {
  return {
    message: '',
    intent: null,
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [] as StoryNode[],
    edges: [] as StoryEdge[],
    lore: [] as LoreEntry[],
    ragContext: '',
    response: '',
    ...overrides,
  }
}

describe('parseIntentNode', () => {
  it('returns lore_question when LLM responds with lore_question', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('lore_question') }
    const { parseIntentNode } = await import('../../../src/chat/nodes/parse_intent.js')
    const result = await parseIntentNode(makeState({ message: 'Кто такой Лукиан?' }), mockLlm as never)
    expect(result.intent).toBe('lore_question')
  })

  it('returns make_choice when LLM responds with make_choice', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('make_choice') }
    const { parseIntentNode } = await import('../../../src/chat/nodes/parse_intent.js')
    const result = await parseIntentNode(makeState({ message: '2' }), mockLlm as never)
    expect(result.intent).toBe('make_choice')
  })

  it('returns explore_scene for free actions (default)', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('explore_scene') }
    const { parseIntentNode } = await import('../../../src/chat/nodes/parse_intent.js')
    const result = await parseIntentNode(makeState({ message: 'Осматриваю зал' }), mockLlm as never)
    expect(result.intent).toBe('explore_scene')
  })

  it('defaults to explore_scene on unrecognized LLM response', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('UNKNOWN') }
    const { parseIntentNode } = await import('../../../src/chat/nodes/parse_intent.js')
    const result = await parseIntentNode(makeState({ message: 'привет' }), mockLlm as never)
    expect(result.intent).toBe('explore_scene')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/chat/nodes/parse_intent.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `src/chat/nodes/parse_intent.ts`**

```typescript
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { ChatStateType, Intent } from '../types.js'

function buildIntentPrompt(message: string): string {
  return `Classify this player input in a Vampire: The Masquerade game.
Answer with ONLY one word: "lore_question", "make_choice", or "explore_scene".

- lore_question: player asks about the world, NPCs, factions, or history
- make_choice: player selects a numbered option (e.g. "1", "2", "выбираю 2", "первый")
- explore_scene: player performs a free action or says something in-character

Player input: "${message}"

Classification:`
}

export async function parseIntentNode(
  state: ChatStateType,
  llm: BaseLLM,
): Promise<Partial<ChatStateType>> {
  const response = String(await llm.invoke(buildIntentPrompt(state.message) as never)).toLowerCase().trim()
  let intent: Intent = 'explore_scene'
  if (response.includes('lore_question')) intent = 'lore_question'
  else if (response.includes('make_choice')) intent = 'make_choice'
  return { intent }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/chat/nodes/parse_intent.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/chat/nodes/parse_intent.ts tests/chat/nodes/parse_intent.test.ts
git commit -m "feat: parse_intent node — LLM intent classification"
```

---

## Task 5: rag_lookup Node

**Files:**
- Create: `src/chat/nodes/rag_lookup.ts`
- Create: `tests/chat/nodes/rag_lookup.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/chat/nodes/rag_lookup.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { ChatStateType } from '../../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../../src/story/types.js'

function makeState(overrides: Partial<ChatStateType> = {}): ChatStateType {
  return {
    message: 'Кто такой Луций?',
    intent: 'lore_question',
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [] as StoryNode[],
    edges: [] as StoryEdge[],
    lore: [] as LoreEntry[],
    ragContext: '',
    response: '',
    ...overrides,
  }
}

describe('ragLookupNode', () => {
  it('joins retrieved doc content into ragContext', async () => {
    const mockRetriever = {
      invoke: vi.fn().mockResolvedValue([
        { pageContent: 'Луций — вампир клана Вентру.' },
        { pageContent: 'Он правит Чикаго уже 200 лет.' },
      ]),
    }
    const { ragLookupNode } = await import('../../../src/chat/nodes/rag_lookup.js')
    const result = await ragLookupNode(makeState(), mockRetriever as never)
    expect(result.ragContext).toContain('Луций — вампир клана Вентру.')
    expect(result.ragContext).toContain('Он правит Чикаго уже 200 лет.')
  })

  it('uses message as retriever query', async () => {
    const mockRetriever = { invoke: vi.fn().mockResolvedValue([]) }
    const { ragLookupNode } = await import('../../../src/chat/nodes/rag_lookup.js')
    await ragLookupNode(makeState({ message: 'Где находится Элизиум?' }), mockRetriever as never)
    expect(mockRetriever.invoke).toHaveBeenCalledWith('Где находится Элизиум?')
  })

  it('returns empty ragContext when no docs found', async () => {
    const mockRetriever = { invoke: vi.fn().mockResolvedValue([]) }
    const { ragLookupNode } = await import('../../../src/chat/nodes/rag_lookup.js')
    const result = await ragLookupNode(makeState(), mockRetriever as never)
    expect(result.ragContext).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/chat/nodes/rag_lookup.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `src/chat/nodes/rag_lookup.ts`**

```typescript
import type { BaseRetriever } from '@langchain/core/retrievers'
import type { ChatStateType } from '../types.js'

export async function ragLookupNode(
  state: ChatStateType,
  retriever: BaseRetriever,
): Promise<Partial<ChatStateType>> {
  const docs = await retriever.invoke(state.message as never)
  const ragContext = (docs as Array<{ pageContent: string }>)
    .map(d => d.pageContent)
    .join('\n\n---\n\n')
  return { ragContext }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/chat/nodes/rag_lookup.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/chat/nodes/rag_lookup.ts tests/chat/nodes/rag_lookup.test.ts
git commit -m "feat: rag_lookup node — LanceDB retrieval into ragContext"
```

---

## Task 6: navigate_graph Node

**Files:**
- Create: `src/chat/nodes/navigate_graph.ts`
- Create: `tests/chat/nodes/navigate_graph.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/chat/nodes/navigate_graph.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import type { ChatStateType } from '../../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../../src/story/types.js'

const edges: StoryEdge[] = [
  { id: 'e1', from_node_id: 'n1', to_node_id: 'n2', choice_text: 'Enter the club', condition: '' },
  { id: 'e2', from_node_id: 'n1', to_node_id: 'n3', choice_text: 'Stay outside', condition: '' },
]

function makeState(overrides: Partial<ChatStateType>): ChatStateType {
  return {
    message: '1',
    intent: 'make_choice',
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [] as StoryNode[],
    edges,
    lore: [] as LoreEntry[],
    ragContext: '',
    response: '',
    ...overrides,
  }
}

describe('navigateGraphNode', () => {
  it('navigates to first edge target when player chooses "1"', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ message: '1' }))
    expect(result.session?.current_node_id).toBe('n2')
  })

  it('navigates to second edge target when player chooses "2"', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ message: '2' }))
    expect(result.session?.current_node_id).toBe('n3')
  })

  it('adds new node to visited_nodes', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ message: '1' }))
    expect(result.session?.visited_nodes).toContain('n2')
  })

  it('returns empty object for explore_scene (no navigation)', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ intent: 'explore_scene', message: 'Осматриваюсь' }))
    expect(result).toEqual({})
  })

  it('returns empty object when choice number is out of range', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ message: '9' }))
    expect(result).toEqual({})
  })

  it('returns empty object when message contains no number', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ message: 'иду туда' }))
    expect(result).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/chat/nodes/navigate_graph.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `src/chat/nodes/navigate_graph.ts`**

```typescript
import type { ChatStateType } from '../types.js'

export function navigateGraphNode(state: ChatStateType): Partial<ChatStateType> {
  if (state.intent !== 'make_choice') return {}

  const match = state.message.match(/\b([1-9])\b/)
  if (!match) return {}
  const choiceIndex = parseInt(match[1]) - 1

  const currentEdges = state.edges.filter(e => e.from_node_id === state.session.current_node_id)
  const chosenEdge = currentEdges[choiceIndex]
  if (!chosenEdge) return {}

  return {
    session: {
      ...state.session,
      current_node_id: chosenEdge.to_node_id,
      visited_nodes: [...state.session.visited_nodes, chosenEdge.to_node_id],
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/chat/nodes/navigate_graph.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/chat/nodes/navigate_graph.ts tests/chat/nodes/navigate_graph.test.ts
git commit -m "feat: navigate_graph node — parse choice number, advance current_node_id"
```

---

## Task 7: expand_scene Node

**Files:**
- Create: `src/chat/nodes/expand_scene.ts`
- Create: `tests/chat/nodes/expand_scene.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/chat/nodes/expand_scene.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { ChatStateType } from '../../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../../src/story/types.js'

const unexpandedNode: StoryNode = {
  id: 'n1', title: 'Клуб Элизиум', description_template: 'Тёмный клуб. {{details}}',
  npc_ids: ['marcus'], location: 'Чикаго', type: 'scene', is_expanded: false,
}
const expandedNode: StoryNode = { ...unexpandedNode, is_expanded: true }

function makeState(overrides: Partial<ChatStateType>): ChatStateType {
  return {
    message: 'Вхожу в клуб',
    intent: 'explore_scene',
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [unexpandedNode],
    edges: [] as StoryEdge[],
    lore: [] as LoreEntry[],
    ragContext: '',
    response: '',
    ...overrides,
  }
}

describe('expandSceneNode', () => {
  it('expands the current node when is_expanded is false', async () => {
    const mockRetriever = { invoke: vi.fn().mockResolvedValue([{ pageContent: 'Элизиум — нейтральная территория вампиров.' }]) }
    const mockLlm = { invoke: vi.fn().mockResolvedValue('Тёмный клуб с готическими колоннами и красным светом.') }
    const mockDrive = { readJSON: vi.fn(), writeJSON: vi.fn().mockResolvedValue(undefined) }

    const { expandSceneNode } = await import('../../../src/chat/nodes/expand_scene.js')
    const result = await expandSceneNode(makeState({}), mockRetriever as never, mockLlm as never, mockDrive, 'folder1')

    expect(result.nodes?.[0].is_expanded).toBe(true)
    expect(result.nodes?.[0].description_template).toBe('Тёмный клуб с готическими колоннами и красным светом.')
    expect(mockDrive.writeJSON).toHaveBeenCalledWith('folder1', 'nodes.json', result.nodes)
  })

  it('is a no-op when current node is already expanded', async () => {
    const mockDrive = { readJSON: vi.fn(), writeJSON: vi.fn() }
    const mockRetriever = { invoke: vi.fn() }
    const mockLlm = { invoke: vi.fn() }

    const { expandSceneNode } = await import('../../../src/chat/nodes/expand_scene.js')
    const result = await expandSceneNode(
      makeState({ nodes: [expandedNode] }),
      mockRetriever as never, mockLlm as never, mockDrive, 'folder1',
    )

    expect(result).toEqual({})
    expect(mockDrive.writeJSON).not.toHaveBeenCalled()
  })

  it('is a no-op when current node is not found', async () => {
    const mockDrive = { readJSON: vi.fn(), writeJSON: vi.fn() }
    const { expandSceneNode } = await import('../../../src/chat/nodes/expand_scene.js')
    const result = await expandSceneNode(
      makeState({ session: { id: 's1', player_name: 'Игрок', current_node_id: 'MISSING', visited_nodes: [], history: [] } }),
      {} as never, {} as never, mockDrive, 'folder1',
    )
    expect(result).toEqual({})
    expect(mockDrive.writeJSON).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/chat/nodes/expand_scene.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `src/chat/nodes/expand_scene.ts`**

```typescript
import type { BaseRetriever } from '@langchain/core/retrievers'
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { DriveClient } from '../../shared/drive.js'
import type { ChatStateType } from '../types.js'
import type { StoryNode } from '../../story/types.js'

function buildExpandPrompt(node: StoryNode, context: string): string {
  return `Ты заполняешь шаблон сцены для игры Vampire: The Masquerade.

Контекст из книги:
${context}

Шаблон сцены: ${node.description_template}

Заполни шаблон: замени {{details}} конкретными деталями (3-5 предложений). Стиль: мрачный готический нуар. Язык: русский.
Верни ТОЛЬКО заполненный текст без объяснений.`
}

export async function expandSceneNode(
  state: ChatStateType,
  retriever: BaseRetriever,
  llm: BaseLLM,
  drive: DriveClient,
  folderId: string,
): Promise<Partial<ChatStateType>> {
  const currentNode = state.nodes.find(n => n.id === state.session.current_node_id)
  if (!currentNode || currentNode.is_expanded) return {}

  const docs = await retriever.invoke((currentNode.title + ' ' + currentNode.location) as never)
  const context = (docs as Array<{ pageContent: string }>).map(d => d.pageContent).join('\n\n')

  const expanded = String(await llm.invoke(buildExpandPrompt(currentNode, context) as never))
  const updatedNode: StoryNode = { ...currentNode, description_template: expanded, is_expanded: true }
  const updatedNodes = state.nodes.map(n => n.id === currentNode.id ? updatedNode : n)

  await drive.writeJSON(folderId, 'nodes.json', updatedNodes)
  return { nodes: updatedNodes }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/chat/nodes/expand_scene.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/chat/nodes/expand_scene.ts tests/chat/nodes/expand_scene.test.ts
git commit -m "feat: expand_scene node — RAG fill + Drive write for unexpanded scenes"
```

---

## Task 8: generate_response + save_session Nodes

**Files:**
- Create: `src/chat/nodes/generate_response.ts`
- Create: `src/chat/nodes/save_session.ts`
- Create: `tests/chat/nodes/generate_response.test.ts`
- Create: `tests/chat/nodes/save_session.test.ts`

- [ ] **Step 1: Write failing tests for generate_response**

Create `tests/chat/nodes/generate_response.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { ChatStateType } from '../../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../../src/story/types.js'

const node: StoryNode = { id: 'n1', title: 'Элизиум', description_template: 'Тёмный клуб.', npc_ids: [], location: 'Чикаго', type: 'scene', is_expanded: true }
const edge: StoryEdge = { id: 'e1', from_node_id: 'n1', to_node_id: 'n2', choice_text: 'Поговорить с Луцием', condition: '' }

function makeState(overrides: Partial<ChatStateType>): ChatStateType {
  return {
    message: '',
    intent: 'explore_scene',
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [node],
    edges: [edge],
    lore: [] as LoreEntry[],
    ragContext: '',
    response: '',
    ...overrides,
  }
}

describe('generateResponseNode', () => {
  it('stores LLM response in state.response', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('Добро пожаловать в Элизиум.') }
    const { generateResponseNode } = await import('../../../src/chat/nodes/generate_response.js')
    const result = await generateResponseNode(makeState({ message: 'Осматриваюсь' }), mockLlm as never)
    expect(result.response).toBe('Добро пожаловать в Элизиум.')
  })

  it('includes ragContext in prompt for lore_question', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('Луций — Принц Чикаго.') }
    const { generateResponseNode } = await import('../../../src/chat/nodes/generate_response.js')
    await generateResponseNode(
      makeState({ intent: 'lore_question', message: 'Кто Луций?', ragContext: 'Луций правит 200 лет.' }),
      mockLlm as never,
    )
    const prompt = mockLlm.invoke.mock.calls[0][0] as string
    expect(prompt).toContain('Луций правит 200 лет.')
  })

  it('includes scene description and choices in prompt for make_choice', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('Вы подходите к Луцию.') }
    const { generateResponseNode } = await import('../../../src/chat/nodes/generate_response.js')
    await generateResponseNode(
      makeState({ intent: 'make_choice', message: '1' }),
      mockLlm as never,
    )
    const prompt = mockLlm.invoke.mock.calls[0][0] as string
    expect(prompt).toContain('Тёмный клуб.')
    expect(prompt).toContain('Поговорить с Луцием')
  })
})
```

- [ ] **Step 2: Write failing tests for save_session**

Create `tests/chat/nodes/save_session.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatStateType } from '../../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../../src/story/types.js'

vi.mock('../../../src/chat/session.js', () => ({ writeSession: vi.fn() }))

function makeState(overrides: Partial<ChatStateType>): ChatStateType {
  return {
    message: 'Привет',
    intent: 'explore_scene',
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [] as StoryNode[],
    edges: [] as StoryEdge[],
    lore: [] as LoreEntry[],
    ragContext: '',
    response: 'Добро пожаловать.',
    ...overrides,
  }
}

describe('saveSessionNode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('appends user and assistant messages to history', async () => {
    const { saveSessionNode } = await import('../../../src/chat/nodes/save_session.js')
    const result = saveSessionNode(makeState({}))
    expect(result.session?.history).toEqual([
      { role: 'user', content: 'Привет' },
      { role: 'assistant', content: 'Добро пожаловать.' },
    ])
  })

  it('calls writeSession with updated session', async () => {
    const { saveSessionNode } = await import('../../../src/chat/nodes/save_session.js')
    const { writeSession } = await import('../../../src/chat/session.js')
    saveSessionNode(makeState({}))
    expect(writeSession).toHaveBeenCalledOnce()
  })

  it('preserves existing history', async () => {
    const { saveSessionNode } = await import('../../../src/chat/nodes/save_session.js')
    const existing = [{ role: 'user' as const, content: 'Ранее' }, { role: 'assistant' as const, content: 'Ответ ранее' }]
    const result = saveSessionNode(makeState({ session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: existing } }))
    expect(result.session?.history).toHaveLength(4)
    expect(result.session?.history[0]).toEqual({ role: 'user', content: 'Ранее' })
  })
})
```

- [ ] **Step 3: Run both test files to verify they fail**

Run: `npx vitest run tests/chat/nodes/generate_response.test.ts tests/chat/nodes/save_session.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Create `src/chat/nodes/generate_response.ts`**

```typescript
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { ChatStateType } from '../types.js'

const SYSTEM_PROMPT = 'Ты — рассказчик в мире Vampire: the Masquerade. Стиль: мрачный готический нуар, атмосфера опасности и интриг. Язык: русский. Не выходи за рамки лора книги. В конце сцены с выборами — предложи варианты нумерованным списком.'

export async function generateResponseNode(
  state: ChatStateType,
  llm: BaseLLM,
): Promise<Partial<ChatStateType>> {
  const currentNode = state.nodes.find(n => n.id === state.session.current_node_id)
  const currentEdges = state.edges.filter(e => e.from_node_id === state.session.current_node_id)

  let content: string
  if (state.intent === 'lore_question') {
    content = `${SYSTEM_PROMPT}\n\nВопрос игрока: ${state.message}\n\nИнформация из лора:\n${state.ragContext}\n\nОтветь кратко, в стиле рассказчика.`
  } else {
    const sceneDesc = currentNode?.description_template ?? 'Вы в незнакомом месте.'
    const choicesText =
      currentEdges.length > 0
        ? '\n\nДоступные варианты:\n' + currentEdges.map((e, i) => `${i + 1}. ${e.choice_text}`).join('\n')
        : ''
    content = `${SYSTEM_PROMPT}\n\nТекущая сцена: ${sceneDesc}\n\nИгрок: ${state.message}${choicesText}`
  }

  const response = String(await llm.invoke(content as never))
  return { response }
}
```

- [ ] **Step 5: Create `src/chat/nodes/save_session.ts`**

```typescript
import type { ChatStateType, Session } from '../types.js'
import { writeSession } from '../session.js'

export function saveSessionNode(state: ChatStateType): Partial<ChatStateType> {
  const updatedSession: Session = {
    ...state.session,
    history: [
      ...state.session.history,
      { role: 'user', content: state.message },
      { role: 'assistant', content: state.response },
    ],
  }
  writeSession(updatedSession)
  return { session: updatedSession }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/chat/nodes/generate_response.test.ts tests/chat/nodes/save_session.test.ts`
Expected: PASS (6 tests total)

- [ ] **Step 7: Commit**

```bash
git add src/chat/nodes/generate_response.ts src/chat/nodes/save_session.ts tests/chat/nodes/generate_response.test.ts tests/chat/nodes/save_session.test.ts
git commit -m "feat: generate_response and save_session nodes"
```

---

## Task 9: Chat Graph Wiring

**Files:**
- Create: `src/chat/graph.ts`
- Create: `tests/chat/graph.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/chat/graph.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import type { ChatStateType } from '../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../src/story/types.js'

function makeState(overrides: Partial<ChatStateType>): ChatStateType {
  return {
    message: '',
    intent: null,
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [] as StoryNode[],
    edges: [] as StoryEdge[],
    lore: [] as LoreEntry[],
    ragContext: '',
    response: '',
    ...overrides,
  }
}

describe('routeByIntent', () => {
  it('routes lore_question to rag_lookup', async () => {
    const { routeByIntent } = await import('../../src/chat/graph.js')
    expect(routeByIntent(makeState({ intent: 'lore_question' }))).toBe('rag_lookup')
  })

  it('routes make_choice to navigate_graph', async () => {
    const { routeByIntent } = await import('../../src/chat/graph.js')
    expect(routeByIntent(makeState({ intent: 'make_choice' }))).toBe('navigate_graph')
  })

  it('routes explore_scene to navigate_graph', async () => {
    const { routeByIntent } = await import('../../src/chat/graph.js')
    expect(routeByIntent(makeState({ intent: 'explore_scene' }))).toBe('navigate_graph')
  })

  it('routes null intent to navigate_graph as default', async () => {
    const { routeByIntent } = await import('../../src/chat/graph.js')
    expect(routeByIntent(makeState({ intent: null }))).toBe('navigate_graph')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/chat/graph.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `src/chat/graph.ts`**

```typescript
import { StateGraph, START, END } from '@langchain/langgraph'
import type { BaseRetriever } from '@langchain/core/retrievers'
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { DriveClient } from '../shared/drive.js'
import { ChatState } from './types.js'
import type { ChatStateType } from './types.js'
import { parseIntentNode } from './nodes/parse_intent.js'
import { ragLookupNode } from './nodes/rag_lookup.js'
import { navigateGraphNode } from './nodes/navigate_graph.js'
import { expandSceneNode } from './nodes/expand_scene.js'
import { generateResponseNode } from './nodes/generate_response.js'
import { saveSessionNode } from './nodes/save_session.js'

export function routeByIntent(state: ChatStateType): 'rag_lookup' | 'navigate_graph' {
  return state.intent === 'lore_question' ? 'rag_lookup' : 'navigate_graph'
}

export function buildChatGraph(
  retriever: BaseRetriever,
  llm: BaseLLM,
  drive: DriveClient,
  folderId: string,
) {
  return new StateGraph(ChatState)
    .addNode('parse_intent', (state) => parseIntentNode(state, llm))
    .addNode('rag_lookup', (state) => ragLookupNode(state, retriever))
    .addNode('navigate_graph', (state) => navigateGraphNode(state))
    .addNode('expand_scene', (state) => expandSceneNode(state, retriever, llm, drive, folderId))
    .addNode('generate_response', (state) => generateResponseNode(state, llm))
    .addNode('save_session', (state) => saveSessionNode(state))
    .addEdge(START, 'parse_intent')
    .addConditionalEdges('parse_intent', routeByIntent, {
      rag_lookup: 'rag_lookup',
      navigate_graph: 'navigate_graph',
    })
    .addEdge('rag_lookup', 'generate_response')
    .addEdge('navigate_graph', 'expand_scene')
    .addEdge('expand_scene', 'generate_response')
    .addEdge('generate_response', 'save_session')
    .addEdge('save_session', END)
    .compile()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/chat/graph.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass (existing + new). Note exact count.

- [ ] **Step 6: Commit**

```bash
git add src/chat/graph.ts tests/chat/graph.test.ts
git commit -m "feat: chat LangGraph — 6-node StateGraph with intent routing"
```

---

## Task 10: Express Server + SSE

**Files:**
- Create: `src/chat/server.ts`

No automated test for server.ts (SSE is integration-level). Correctness is verified in Task 12 E2E test.

- [ ] **Step 1: Create `src/chat/server.ts`**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/chat/server.ts
git commit -m "feat: Express server with SSE streaming via graph.streamEvents()"
```

---

## Task 11: React Frontend

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VtM Chat — Chicago by Night</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
```

- [ ] **Step 4: Create `frontend/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 5: Create `frontend/src/App.tsx`**

```tsx
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
```

- [ ] **Step 6: Run TypeScript check on frontend**

Run: `npx tsc --noEmit -p frontend/tsconfig.json`
Expected: No errors (or only minor type warnings from jsx).

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: React frontend — gothic chat UI with SSE streaming and choice buttons"
```

---

## Task 12: E2E Manual Test

**Verify:** `npm run dev` starts both servers, the UI loads, a full game session works end-to-end.

**Prerequisites:**
- `data/google-credentials.json` exists
- `data/google-token.json` exists (run `npm run auth` if not)
- `GOOGLE_DRIVE_FOLDER_ID` is set (the folder where `npm run pregen` saved its files)
- Ollama running with `qwen2.5:14b` loaded

- [ ] **Step 1: Start dev environment**

```bash
GOOGLE_DRIVE_FOLDER_ID="<your-folder-id>" npm run dev
```

Expected output:
```
[0] === VtM Chat Server ===
[0]   ✓ LanceDB + Drive connected
[0]   ✓ Loaded 14 nodes, 13 edges
[0] ✓ Server ready on http://localhost:3001
[1]   VITE ready on http://localhost:3000
```

- [ ] **Step 2: Open browser at http://localhost:3000**

Expected: Start screen with "Vampire: The Masquerade" heading and name input.

- [ ] **Step 3: Enter a player name and click "Войти в ночь"**

Expected:
- Chat screen appears
- "◆" message starts streaming Gothic narrative text
- After stream ends, numbered choice buttons appear below

- [ ] **Step 4: Click a choice button**

Expected:
- User message "1" appears in chat
- New narrative streams in response to the choice
- New choices appear

- [ ] **Step 5: Ask a lore question**

Type: `Кто такой принц Чикаго?`
Expected: Response references VtM lore from RAG (Chicago by Night content), stays in GM voice.

- [ ] **Step 6: Verify session persistence**

Stop the server (Ctrl+C), restart with same command.
Expected:
- Server log shows "Session restored: [your name]"
- `GET http://localhost:3001/api/session` returns the restored session JSON

- [ ] **Step 7: Run full test suite one final time**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "feat: Phase 3 complete — VtM chat interface with SSE streaming and story graph navigation"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `parse_intent` → Task 4
- ✅ `rag_lookup` (LanceDB → ragContext) → Task 5
- ✅ `navigate_graph` (edges, make_choice/explore_scene) → Task 6
- ✅ `expand_scene` (is_expanded check, RAG fill, Drive write) → Task 7
- ✅ `generate_response` (qwen2.5:14b, system prompt, choices list) → Task 8
- ✅ `save_session` (history append, data/session.json) → Task 8
- ✅ `GET /api/session`, `POST /api/session/new`, `POST /api/chat`, `GET /api/choices` → Task 10
- ✅ SSE streaming from `graph.streamEvents()` → Task 10
- ✅ React + Vite, port 3000/3001 → Task 11
- ✅ Choice buttons from edges.json → Task 11
- ✅ Dark gothic theme → Task 11
- ✅ In-memory cache (nodes/edges/lore loaded at startup) → Task 3 + Task 10

**Streaming fallback note:** If `on_llm_stream` events are not emitted (Ollama streaming not configured), the response will still appear after the full generation completes — the `on_chain_end` event captures the final state including `response`. In this case, send the full response as a single token event before the `done` event. The graph still works correctly; only the streaming UX degrades to non-streaming.
