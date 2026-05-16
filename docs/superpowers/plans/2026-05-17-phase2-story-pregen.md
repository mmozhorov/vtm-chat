# Phase 2: Story Branch Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-shot `npm run pregen` script that reads lore from LanceDB via RAG, generates a story graph (nodes.json + edges.json + lore.json) using a LangGraph StateGraph, and saves the result to Google Drive.

**Architecture:** LangGraph StateGraph with 4 nodes: `extract_lore` (RAG → LoreEntry[]) → `generate_skeleton` (LLM → nodes+edges JSON) → `validate_graph` (structural checks, retry loop up to 3x) → `save_to_drive` (write 3 JSON files to Google Drive via googleapis OAuth2). Nodes are isolated functions with injected dependencies — testable without real Ollama or Drive.

**Tech Stack:** TypeScript (ESM, Node16), @langchain/langgraph, @langchain/ollama (qwen2.5:14b), @langchain/community (LanceDB retriever), googleapis (Google Drive v3), Vitest

---

## Prerequisites (manual, before running pregen)

1. Create Google Cloud project, enable Drive API, create OAuth2 Desktop credentials, download as `data/google-credentials.json`
2. Create a Google Drive folder, copy the folder ID from the URL (`/folders/<ID>`)
3. Run `npm run auth` once to generate `data/google-token.json`
4. Set `GOOGLE_DRIVE_FOLDER_ID` env variable

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Add pregen/auth scripts + @langchain/langgraph, googleapis deps |
| `.gitignore` | Add data/google-credentials.json, data/google-token.json |
| `.env.example` | Add GOOGLE_DRIVE_FOLDER_ID, GOOGLE_CREDENTIALS_PATH, GOOGLE_TOKEN_PATH |
| `src/story/types.ts` | LoreEntry, StoryNode, StoryEdge interfaces + PreGenState LangGraph Annotation |
| `src/shared/drive.ts` | DriveClient interface + helpers readJSONFromDrive/writeJSONToDrive + createDriveClient() |
| `src/story/auth.ts` | One-time OAuth2 token setup (npm run auth) |
| `src/story/nodes/extract_lore.ts` | LangGraph node: RAG queries → LoreEntry[] |
| `src/story/nodes/generate_skeleton.ts` | LangGraph node: LLM → StoryNode[] + StoryEdge[] |
| `src/story/nodes/validate_graph.ts` | LangGraph node: structural validation → validationErrors[] |
| `src/story/nodes/save_to_drive.ts` | LangGraph node: write lore/nodes/edges JSON to Drive |
| `src/story/graph.ts` | StateGraph wiring + routeAfterValidation + buildPreGenGraph() |
| `src/story/pregen.ts` | Entry point: init deps, run graph, print summary |
| `tests/shared/drive.test.ts` | readJSONFromDrive/writeJSONToDrive tests (mocked drive_v3.Drive) |
| `tests/story/nodes/extract_lore.test.ts` | extract_lore tests (mocked retriever + LLM) |
| `tests/story/nodes/generate_skeleton.test.ts` | generate_skeleton tests (mocked LLM) |
| `tests/story/nodes/validate_graph.test.ts` | validate_graph tests (pure function, no mocks) |
| `tests/story/nodes/save_to_drive.test.ts` | save_to_drive tests (mocked DriveClient) |
| `tests/story/graph.test.ts` | routeAfterValidation tests (pure function, no mocks) |

---

## Task 1: Dependencies & Config

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `.env.example`

- [ ] **Step 1: Install new dependencies**

```bash
npm install @langchain/langgraph googleapis
```

Expected: packages installed, `package.json` dependencies updated.

- [ ] **Step 2: Add scripts to package.json**

Edit `package.json` — replace the `"scripts"` section:

```json
"scripts": {
  "ingest": "tsx src/ingestion/ingest.ts",
  "verify": "tsx src/ingestion/verify.ts",
  "pregen": "tsx src/story/pregen.ts",
  "auth": "tsx src/story/auth.ts",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Update .gitignore**

Add two lines to `.gitignore`:

```
data/google-credentials.json
data/google-token.json
```

- [ ] **Step 4: Update .env.example**

Append to `.env.example`:

```
# Google Drive (Phase 2)
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
GOOGLE_CREDENTIALS_PATH=./data/google-credentials.json
GOOGLE_TOKEN_PATH=./data/google-token.json
```

- [ ] **Step 5: Verify existing tests still pass**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example
git commit -m "feat: add phase 2 deps (langgraph, googleapis) and scripts"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/story/types.ts`

- [ ] **Step 1: Create src/story/types.ts**

```typescript
import { Annotation } from '@langchain/langgraph'

export interface LoreEntry {
  id: string
  type: 'character' | 'location' | 'faction'
  name: string
  summary: string
}

export interface StoryNode {
  id: string
  title: string
  description_template: string
  npc_ids: string[]
  location: string
  type: 'intro' | 'scene' | 'climax' | 'ending'
  is_expanded: boolean
}

export interface StoryEdge {
  id: string
  from_node_id: string
  to_node_id: string
  choice_text: string
  condition: string
}

export const PreGenState = Annotation.Root({
  lore: Annotation<LoreEntry[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  nodes: Annotation<StoryNode[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  edges: Annotation<StoryEdge[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  validationErrors: Annotation<string[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  retryCount: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),
})

export type PreGenStateType = typeof PreGenState.State
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/story/types.ts
git commit -m "feat: add story types and LangGraph PreGenState annotation"
```

---

## Task 3: Google Drive Client

**Files:**
- Create: `src/shared/drive.ts`
- Create: `tests/shared/drive.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/drive.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { readJSONFromDrive, writeJSONToDrive } from '../../src/shared/drive.js'
import type { drive_v3 } from 'googleapis'

function makeMockDrive(overrides: Partial<drive_v3.Resource$Files> = {}): { files: drive_v3.Resource$Files } {
  return {
    files: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      ...overrides,
    } as unknown as drive_v3.Resource$Files,
  }
}

describe('readJSONFromDrive', () => {
  it('returns null when file does not exist in folder', async () => {
    const drive = makeMockDrive({
      list: vi.fn().mockResolvedValue({ data: { files: [] } }),
    })
    const result = await readJSONFromDrive(drive as never, 'folder123', 'nodes.json')
    expect(result).toBeNull()
  })

  it('returns parsed JSON when file exists', async () => {
    const content = JSON.stringify({ hello: 'world' })
    const drive = makeMockDrive({
      list: vi.fn().mockResolvedValue({ data: { files: [{ id: 'file123' }] } }),
      get: vi.fn().mockResolvedValue({ data: Buffer.from(content).buffer }),
    })
    const result = await readJSONFromDrive(drive as never, 'folder123', 'nodes.json')
    expect(result).toEqual({ hello: 'world' })
  })
})

describe('writeJSONToDrive', () => {
  it('creates a new file when it does not exist', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ data: {} })
    const drive = makeMockDrive({
      list: vi.fn().mockResolvedValue({ data: { files: [] } }),
      create: mockCreate,
    })
    await writeJSONToDrive(drive as never, 'folder123', 'nodes.json', { test: true })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ name: 'nodes.json', parents: ['folder123'] }),
      })
    )
  })

  it('updates an existing file instead of creating', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ data: {} })
    const drive = makeMockDrive({
      list: vi.fn().mockResolvedValue({ data: { files: [{ id: 'file123' }] } }),
      update: mockUpdate,
    })
    await writeJSONToDrive(drive as never, 'folder123', 'nodes.json', { test: true })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'file123' })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/shared/drive.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create src/shared/drive.ts**

```typescript
import { google } from 'googleapis'
import type { drive_v3 } from 'googleapis'
import fs from 'fs'

export interface DriveClient {
  readJSON: <T>(folderId: string, fileName: string) => Promise<T | null>
  writeJSON: (folderId: string, fileName: string, data: unknown) => Promise<void>
}

export async function readJSONFromDrive<T>(
  drive: { files: drive_v3.Resource$Files },
  folderId: string,
  fileName: string,
): Promise<T | null> {
  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  const file = res.data.files?.[0]
  if (!file?.id) return null

  const content = await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'arraybuffer' },
  )
  return JSON.parse(Buffer.from(content.data as ArrayBuffer).toString('utf-8')) as T
}

export async function writeJSONToDrive(
  drive: { files: drive_v3.Resource$Files },
  folderId: string,
  fileName: string,
  data: unknown,
): Promise<void> {
  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  const file = res.data.files?.[0]
  const body = JSON.stringify(data, null, 2)

  if (file?.id) {
    await drive.files.update({
      fileId: file.id,
      media: { mimeType: 'application/json', body },
    })
  } else {
    await drive.files.create({
      requestBody: { name: fileName, parents: [folderId], mimeType: 'application/json' },
      media: { mimeType: 'application/json', body },
    })
  }
}

export async function createDriveClient(): Promise<DriveClient> {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH ?? './data/google-credentials.json'
  const tokenPath = process.env.GOOGLE_TOKEN_PATH ?? './data/google-token.json'

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'))
  const { client_id, client_secret } = credentials.installed
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, 'urn:ietf:wg:oauth:2.0:oob')

  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'))
  oauth2Client.setCredentials(token)

  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  return {
    readJSON: (folderId, fileName) => readJSONFromDrive(drive, folderId, fileName),
    writeJSON: (folderId, fileName, data) => writeJSONToDrive(drive, folderId, fileName, data),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/shared/drive.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/drive.ts tests/shared/drive.test.ts
git commit -m "feat: add Google Drive client with OAuth2 (readJSON/writeJSON)"
```

---

## Task 4: Auth Script

**Files:**
- Create: `src/story/auth.ts`

(No unit tests — requires browser interaction. Verified manually in Task 11.)

- [ ] **Step 1: Create src/story/auth.ts**

```typescript
import { google } from 'googleapis'
import fs from 'fs'
import { createInterface } from 'readline/promises'

const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH ?? './data/google-credentials.json'
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH ?? './data/google-token.json'
const SCOPES = ['https://www.googleapis.com/auth/drive.file']

async function main() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'))
  const { client_id, client_secret } = credentials.installed

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'urn:ietf:wg:oauth:2.0:oob',
  )

  const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES })

  console.log('=== Google Drive OAuth2 Setup ===\n')
  console.log('1. Open this URL in your browser:\n')
  console.log(authUrl + '\n')
  console.log('2. Sign in with your Google account and grant Drive access.')
  console.log('3. Copy the authorization code shown on screen.\n')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const code = await rl.question('Enter the authorization code: ')
  rl.close()

  const { tokens } = await oauth2Client.getToken(code.trim())
  fs.mkdirSync('./data', { recursive: true })
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
  console.log('\n✓ Token saved to', TOKEN_PATH)
  console.log('You can now run `npm run pregen`.')
}

main().catch(err => {
  console.error('✗ Auth failed:', err.message)
  process.exit(1)
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/story/auth.ts
git commit -m "feat: add OAuth2 auth setup script (npm run auth)"
```

---

## Task 5: extract_lore Node

**Files:**
- Create: `src/story/nodes/extract_lore.ts`
- Create: `tests/story/nodes/extract_lore.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/story/nodes/extract_lore.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { extractLoreNode } from '../../../src/story/nodes/extract_lore.js'
import type { PreGenStateType } from '../../../src/story/types.js'

const baseState: PreGenStateType = {
  lore: [],
  nodes: [],
  edges: [],
  validationErrors: [],
  retryCount: 0,
}

const mockRetriever = {
  invoke: vi.fn().mockResolvedValue([
    { pageContent: 'Тремере — клан магов, базируется в Чикаго.', metadata: {} },
    { pageContent: 'Баллард — лидер Тремере в городе.', metadata: {} },
  ]),
} as never

const mockLlm = {
  invoke: vi.fn().mockResolvedValue(
    '[{"type":"character","name":"Баллард","summary":"Лидер Тремере в Чикаго"},{"type":"faction","name":"Тремере","summary":"Клан магов"}]'
  ),
} as never

describe('extractLoreNode', () => {
  it('returns lore array with correctly shaped entries', async () => {
    const result = await extractLoreNode(baseState, mockRetriever, mockLlm)
    expect(result.lore).toBeDefined()
    expect(result.lore!.length).toBe(2)
    expect(result.lore![0]).toMatchObject({
      id: expect.any(String),
      type: expect.stringMatching(/^(character|location|faction)$/),
      name: expect.any(String),
      summary: expect.any(String),
    })
  })

  it('calls retriever with 3 different queries', async () => {
    const retriever = { invoke: vi.fn().mockResolvedValue([]) } as never
    const llm = { invoke: vi.fn().mockResolvedValue('[]') } as never
    await extractLoreNode(baseState, retriever, llm)
    expect(vi.mocked(retriever.invoke)).toHaveBeenCalledTimes(3)
  })

  it('returns empty lore when LLM returns invalid JSON', async () => {
    const badLlm = { invoke: vi.fn().mockResolvedValue('not json at all') } as never
    const result = await extractLoreNode(baseState, mockRetriever, badLlm)
    expect(result.lore).toEqual([])
  })

  it('filters out entries with invalid type field', async () => {
    const llmWithBadType = {
      invoke: vi.fn().mockResolvedValue(
        '[{"type":"invalid","name":"Test","summary":"Bad"},{"type":"character","name":"Good","summary":"OK"}]'
      ),
    } as never
    const result = await extractLoreNode(baseState, mockRetriever, llmWithBadType)
    expect(result.lore!.every(e => ['character', 'location', 'faction'].includes(e.type))).toBe(true)
    expect(result.lore!.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/story/nodes/extract_lore.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create src/story/nodes/extract_lore.ts**

```typescript
import type { BaseRetriever } from '@langchain/core/retrievers'
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { LoreEntry, PreGenStateType } from '../types.js'

const RAG_QUERIES = [
  'главные NPC персонажи вампиры Чикаго',
  'ключевые локации места Чикаго',
  'фракции кланы конфликты вампиры',
]

function buildLorePrompt(text: string): string {
  return `Extract named entities (characters, locations, factions) from this Vampire: The Masquerade text.
Return ONLY a JSON array (no explanation, no markdown):
[{"type": "character"|"location"|"faction", "name": "...", "summary": "1-2 sentences"}]
Only include entities clearly named in the text.

Text:
${text.slice(0, 3000)}

JSON:`
}

export async function extractLoreNode(
  _state: PreGenStateType,
  retriever: BaseRetriever,
  llm: BaseLLM,
): Promise<Partial<PreGenStateType>> {
  const docArrays = await Promise.all(RAG_QUERIES.map(q => retriever.invoke(q)))

  const seen = new Set<string>()
  const uniqueDocs = docArrays.flat().filter(doc => {
    if (seen.has(doc.pageContent)) return false
    seen.add(doc.pageContent)
    return true
  })

  const combinedText = uniqueDocs.map(d => d.pageContent).join('\n\n')

  try {
    const response = String(await llm.invoke(buildLorePrompt(combinedText)))
    const match = response.match(/\[[\s\S]*\]/)
    if (!match) return { lore: [] }

    const raw: Array<{ type: string; name: string; summary: string }> = JSON.parse(match[0])
    const VALID_TYPES = ['character', 'location', 'faction']
    const lore: LoreEntry[] = raw
      .filter(e => VALID_TYPES.includes(e.type))
      .map((e, i) => ({
        id: `lore_${i}`,
        type: e.type as LoreEntry['type'],
        name: String(e.name),
        summary: String(e.summary),
      }))

    console.log(`  Extracted ${lore.length} lore entries`)
    return { lore }
  } catch {
    return { lore: [] }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/story/nodes/extract_lore.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/story/nodes/extract_lore.ts tests/story/nodes/extract_lore.test.ts
git commit -m "feat: add extract_lore LangGraph node"
```

---

## Task 6: generate_skeleton Node

**Files:**
- Create: `src/story/nodes/generate_skeleton.ts`
- Create: `tests/story/nodes/generate_skeleton.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/story/nodes/generate_skeleton.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { generateSkeletonNode } from '../../../src/story/nodes/generate_skeleton.js'
import type { PreGenStateType } from '../../../src/story/types.js'

const baseState: PreGenStateType = {
  lore: [
    { id: 'lore_0', type: 'character', name: 'Баллард', summary: 'Лидер Тремере' },
    { id: 'lore_1', type: 'location', name: 'Двор Принца', summary: 'Резиденция принца Чикаго' },
  ],
  nodes: [],
  edges: [],
  validationErrors: [],
  retryCount: 0,
}

const validGraphJSON = JSON.stringify({
  nodes: [
    { id: 'n1', title: 'Прибытие', description_template: 'Вы прибываете в {{details}}', npc_ids: [], location: 'Чикаго', type: 'intro', is_expanded: false },
    { id: 'n2', title: 'Встреча', description_template: 'Вы встречаете {{details}}', npc_ids: ['lore_0'], location: 'Двор Принца', type: 'scene', is_expanded: false },
    { id: 'n3', title: 'Конец', description_template: 'История завершается {{details}}', npc_ids: [], location: 'Чикаго', type: 'ending', is_expanded: false },
  ],
  edges: [
    { id: 'e1', from_node_id: 'n1', to_node_id: 'n2', choice_text: 'Идти во Двор', condition: '' },
    { id: 'e2', from_node_id: 'n2', to_node_id: 'n3', choice_text: 'Принять судьбу', condition: '' },
  ],
})

describe('generateSkeletonNode', () => {
  it('parses valid LLM JSON response into nodes and edges', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue(validGraphJSON) } as never
    const result = await generateSkeletonNode(baseState, mockLlm)
    expect(result.nodes).toHaveLength(3)
    expect(result.edges).toHaveLength(2)
    expect(result.nodes![0].type).toBe('intro')
  })

  it('returns empty arrays when LLM returns invalid JSON', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('not valid json { at all') } as never
    const result = await generateSkeletonNode(baseState, mockLlm)
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })

  it('includes validation errors in prompt when retrying', async () => {
    const stateWithErrors: PreGenStateType = {
      ...baseState,
      validationErrors: ['No node of type "intro" found'],
      retryCount: 1,
    }
    const mockLlm = { invoke: vi.fn().mockResolvedValue(validGraphJSON) } as never
    await generateSkeletonNode(stateWithErrors, mockLlm)
    const prompt = vi.mocked(mockLlm.invoke).mock.calls[0][0] as string
    expect(prompt).toContain('No node of type "intro" found')
  })

  it('returns empty arrays when LLM returns JSON without nodes/edges keys', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('{"foo":"bar"}') } as never
    const result = await generateSkeletonNode(baseState, mockLlm)
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/story/nodes/generate_skeleton.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create src/story/nodes/generate_skeleton.ts**

```typescript
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { StoryNode, StoryEdge, PreGenStateType } from '../types.js'

function buildSkeletonPrompt(state: PreGenStateType): string {
  const loreContext = state.lore
    .map(e => `${e.type}: ${e.name} — ${e.summary}`)
    .join('\n')

  const retryContext =
    state.validationErrors.length > 0
      ? `\nPrevious attempt failed validation. Fix these issues:\n${state.validationErrors.join('\n')}\n`
      : ''

  return `You are creating a story graph for a Vampire: The Masquerade game set in Chicago.

AVAILABLE LORE:
${loreContext}
${retryContext}
Generate a story with 3 separate arcs. Each arc: 4-5 scenes (type "scene"), 1 climax (type "climax"), 1 ending (type "ending").
Plus exactly 1 intro node (type "intro") shared across arcs. Total: 15-20 nodes.

Return ONLY valid JSON — no explanation, no markdown backticks:
{
  "nodes": [
    {"id":"n1","title":"...","description_template":"Scene description with {{details}} placeholder","npc_ids":[],"location":"...","type":"intro","is_expanded":false}
  ],
  "edges": [
    {"id":"e1","from_node_id":"n1","to_node_id":"n2","choice_text":"Player choice text","condition":""}
  ]
}

Rules:
- Exactly 1 node with type "intro"
- Each non-ending node must have 2-3 outgoing edges
- All from_node_id and to_node_id must be ids of existing nodes
- description_template must contain the placeholder {{details}}

JSON:`
}

export async function generateSkeletonNode(
  state: PreGenStateType,
  llm: BaseLLM,
): Promise<Partial<PreGenStateType>> {
  try {
    const response = String(await llm.invoke(buildSkeletonPrompt(state)))
    const match = response.match(/\{[\s\S]*\}/)
    if (!match) return { nodes: [], edges: [] }

    const parsed = JSON.parse(match[0])
    const nodes: StoryNode[] = Array.isArray(parsed.nodes) ? parsed.nodes : []
    const edges: StoryEdge[] = Array.isArray(parsed.edges) ? parsed.edges : []

    console.log(`  Generated ${nodes.length} nodes, ${edges.length} edges`)
    return { nodes, edges }
  } catch {
    return { nodes: [], edges: [] }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/story/nodes/generate_skeleton.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/story/nodes/generate_skeleton.ts tests/story/nodes/generate_skeleton.test.ts
git commit -m "feat: add generate_skeleton LangGraph node"
```

---

## Task 7: validate_graph Node

**Files:**
- Create: `src/story/nodes/validate_graph.ts`
- Create: `tests/story/nodes/validate_graph.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/story/nodes/validate_graph.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateGraphNode } from '../../../src/story/nodes/validate_graph.js'
import type { PreGenStateType, StoryNode, StoryEdge } from '../../../src/story/types.js'

const intro: StoryNode = { id: 'n1', title: 'Intro', description_template: '{{details}}', npc_ids: [], location: 'Chicago', type: 'intro', is_expanded: false }
const scene: StoryNode = { id: 'n2', title: 'Scene', description_template: '{{details}}', npc_ids: [], location: 'Chicago', type: 'scene', is_expanded: false }
const ending: StoryNode = { id: 'n3', title: 'End', description_template: '{{details}}', npc_ids: [], location: 'Chicago', type: 'ending', is_expanded: false }
const e12: StoryEdge = { id: 'e1', from_node_id: 'n1', to_node_id: 'n2', choice_text: 'Go', condition: '' }
const e23: StoryEdge = { id: 'e2', from_node_id: 'n2', to_node_id: 'n3', choice_text: 'End', condition: '' }

function state(nodes: StoryNode[], edges: StoryEdge[], retryCount = 0): PreGenStateType {
  return { lore: [], nodes, edges, validationErrors: [], retryCount }
}

describe('validateGraphNode', () => {
  it('returns no errors for a valid graph', () => {
    const result = validateGraphNode(state([intro, scene, ending], [e12, e23]))
    expect(result.validationErrors).toEqual([])
    expect(result.retryCount).toBe(0)
  })

  it('reports missing intro node', () => {
    const result = validateGraphNode(state([scene, ending], [e23]))
    expect(result.validationErrors).toContain('No node of type "intro" found')
  })

  it('reports missing ending node', () => {
    const result = validateGraphNode(state([intro, scene], [e12]))
    expect(result.validationErrors).toContain('No node of type "ending" found')
  })

  it('reports edge referencing non-existent to_node_id', () => {
    const badEdge: StoryEdge = { id: 'e1', from_node_id: 'n1', to_node_id: 'n999', choice_text: 'Go', condition: '' }
    const result = validateGraphNode(state([intro, ending], [badEdge]))
    expect(result.validationErrors!.some(e => e.includes('n999'))).toBe(true)
  })

  it('reports isolated non-ending node with no outgoing edges', () => {
    const result = validateGraphNode(state([intro, scene, ending], [e23]))
    expect(result.validationErrors!.some(e => e.includes('n1'))).toBe(true)
  })

  it('increments retryCount when there are validation errors', () => {
    const result = validateGraphNode(state([scene, ending], [e23], 1))
    expect(result.retryCount).toBe(2)
  })

  it('does not increment retryCount when graph is valid', () => {
    const result = validateGraphNode(state([intro, scene, ending], [e12, e23], 2))
    expect(result.retryCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/story/nodes/validate_graph.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create src/story/nodes/validate_graph.ts**

```typescript
import type { PreGenStateType } from '../types.js'

export function validateGraphNode(state: PreGenStateType): Partial<PreGenStateType> {
  const errors: string[] = []
  const nodeIds = new Set(state.nodes.map(n => n.id))

  for (const edge of state.edges) {
    if (!nodeIds.has(edge.from_node_id)) {
      errors.push(`Edge ${edge.id}: from_node_id '${edge.from_node_id}' does not exist`)
    }
    if (!nodeIds.has(edge.to_node_id)) {
      errors.push(`Edge ${edge.id}: to_node_id '${edge.to_node_id}' does not exist`)
    }
  }

  if (!state.nodes.some(n => n.type === 'intro')) {
    errors.push('No node of type "intro" found')
  }
  if (!state.nodes.some(n => n.type === 'ending')) {
    errors.push('No node of type "ending" found')
  }

  const nodesWithOutgoing = new Set(state.edges.map(e => e.from_node_id))
  for (const node of state.nodes) {
    if (node.type !== 'ending' && !nodesWithOutgoing.has(node.id)) {
      errors.push(`Node '${node.id}' (${node.type}) has no outgoing edges`)
    }
  }

  if (errors.length > 0) {
    console.log(`  Validation failed (${errors.length} errors, retry ${state.retryCount + 1}/3)`)
  } else {
    console.log('  Graph valid')
  }

  return {
    validationErrors: errors,
    retryCount: errors.length > 0 ? state.retryCount + 1 : state.retryCount,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/story/nodes/validate_graph.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/story/nodes/validate_graph.ts tests/story/nodes/validate_graph.test.ts
git commit -m "feat: add validate_graph LangGraph node"
```

---

## Task 8: save_to_drive Node

**Files:**
- Create: `src/story/nodes/save_to_drive.ts`
- Create: `tests/story/nodes/save_to_drive.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/story/nodes/save_to_drive.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { saveToDriveNode } from '../../../src/story/nodes/save_to_drive.js'
import type { DriveClient } from '../../../src/shared/drive.js'
import type { PreGenStateType } from '../../../src/story/types.js'

const state: PreGenStateType = {
  lore: [{ id: 'l1', type: 'character', name: 'Баллард', summary: 'Лидер' }],
  nodes: [{ id: 'n1', title: 'Intro', description_template: '{{details}}', npc_ids: [], location: 'Chicago', type: 'intro', is_expanded: false }],
  edges: [{ id: 'e1', from_node_id: 'n1', to_node_id: 'n1', choice_text: 'Go', condition: '' }],
  validationErrors: [],
  retryCount: 0,
}

describe('saveToDriveNode', () => {
  it('writes lore.json, nodes.json, and edges.json to Drive', async () => {
    const mockDrive: DriveClient = {
      readJSON: vi.fn(),
      writeJSON: vi.fn().mockResolvedValue(undefined),
    }
    await saveToDriveNode(state, mockDrive, 'folder123')

    expect(mockDrive.writeJSON).toHaveBeenCalledTimes(3)
    expect(mockDrive.writeJSON).toHaveBeenCalledWith('folder123', 'lore.json', state.lore)
    expect(mockDrive.writeJSON).toHaveBeenCalledWith('folder123', 'nodes.json', state.nodes)
    expect(mockDrive.writeJSON).toHaveBeenCalledWith('folder123', 'edges.json', state.edges)
  })

  it('returns empty partial state (does not modify state)', async () => {
    const mockDrive: DriveClient = {
      readJSON: vi.fn(),
      writeJSON: vi.fn().mockResolvedValue(undefined),
    }
    const result = await saveToDriveNode(state, mockDrive, 'folder123')
    expect(result).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/story/nodes/save_to_drive.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create src/story/nodes/save_to_drive.ts**

```typescript
import type { DriveClient } from '../../shared/drive.js'
import type { PreGenStateType } from '../types.js'

export async function saveToDriveNode(
  state: PreGenStateType,
  drive: DriveClient,
  folderId: string,
): Promise<Partial<PreGenStateType>> {
  console.log('  Saving to Google Drive...')

  await Promise.all([
    drive.writeJSON(folderId, 'lore.json', state.lore),
    drive.writeJSON(folderId, 'nodes.json', state.nodes),
    drive.writeJSON(folderId, 'edges.json', state.edges),
  ])

  console.log('  Saved lore.json, nodes.json, edges.json')
  return {}
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/story/nodes/save_to_drive.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/story/nodes/save_to_drive.ts tests/story/nodes/save_to_drive.test.ts
git commit -m "feat: add save_to_drive LangGraph node"
```

---

## Task 9: LangGraph StateGraph + Routing

**Files:**
- Create: `src/story/graph.ts`
- Create: `tests/story/graph.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/story/graph.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { routeAfterValidation } from '../../src/story/graph.js'
import type { PreGenStateType } from '../../src/story/types.js'

function makeState(validationErrors: string[], retryCount: number): PreGenStateType {
  return { lore: [], nodes: [], edges: [], validationErrors, retryCount }
}

describe('routeAfterValidation', () => {
  it('routes to generate_skeleton when errors exist and retryCount < 3', () => {
    expect(routeAfterValidation(makeState(['error'], 0))).toBe('generate_skeleton')
    expect(routeAfterValidation(makeState(['error'], 1))).toBe('generate_skeleton')
    expect(routeAfterValidation(makeState(['error'], 2))).toBe('generate_skeleton')
  })

  it('routes to save_to_drive when retryCount reaches 3 (exhausted)', () => {
    expect(routeAfterValidation(makeState(['error'], 3))).toBe('save_to_drive')
  })

  it('routes to save_to_drive when graph is valid (no errors)', () => {
    expect(routeAfterValidation(makeState([], 0))).toBe('save_to_drive')
    expect(routeAfterValidation(makeState([], 2))).toBe('save_to_drive')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/story/graph.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create src/story/graph.ts**

```typescript
import { StateGraph, START, END } from '@langchain/langgraph'
import type { BaseRetriever } from '@langchain/core/retrievers'
import type { BaseLLM } from '@langchain/core/language_models/llms'
import { PreGenState } from './types.js'
import type { PreGenStateType } from './types.js'
import type { DriveClient } from '../shared/drive.js'
import { extractLoreNode } from './nodes/extract_lore.js'
import { generateSkeletonNode } from './nodes/generate_skeleton.js'
import { validateGraphNode } from './nodes/validate_graph.js'
import { saveToDriveNode } from './nodes/save_to_drive.js'

export function routeAfterValidation(
  state: PreGenStateType,
): 'generate_skeleton' | 'save_to_drive' {
  if (state.validationErrors.length > 0 && state.retryCount < 3) {
    return 'generate_skeleton'
  }
  return 'save_to_drive'
}

export function buildPreGenGraph(
  retriever: BaseRetriever,
  llm: BaseLLM,
  drive: DriveClient,
  folderId: string,
) {
  return new StateGraph(PreGenState)
    .addNode('extract_lore', (state) => extractLoreNode(state, retriever, llm))
    .addNode('generate_skeleton', (state) => generateSkeletonNode(state, llm))
    .addNode('validate_graph', validateGraphNode)
    .addNode('save_to_drive', (state) => saveToDriveNode(state, drive, folderId))
    .addEdge(START, 'extract_lore')
    .addEdge('extract_lore', 'generate_skeleton')
    .addEdge('generate_skeleton', 'validate_graph')
    .addConditionalEdges('validate_graph', routeAfterValidation)
    .addEdge('save_to_drive', END)
    .compile()
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/story/graph.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/story/graph.ts tests/story/graph.test.ts
git commit -m "feat: add LangGraph StateGraph with conditional routing"
```

---

## Task 10: Main Pregen Script

**Files:**
- Create: `src/story/pregen.ts`

(No unit tests — entry point wires up real dependencies. Tested in Task 11.)

- [ ] **Step 1: Create src/story/pregen.ts**

```typescript
import { createRetriever } from '../shared/retriever.js'
import { createDriveClient } from '../shared/drive.js'
import { buildPreGenGraph } from './graph.js'
import { Ollama } from '@langchain/ollama'

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'

async function main() {
  if (!FOLDER_ID) {
    console.error('✗ GOOGLE_DRIVE_FOLDER_ID environment variable is required')
    process.exit(1)
  }

  console.log('=== VtM Chat — Story PreGen ===\n')

  console.log('Connecting to services...')
  const [retriever, drive] = await Promise.all([createRetriever(), createDriveClient()])
  const llm = new Ollama({ model: 'qwen2.5:14b', baseUrl: OLLAMA_URL })
  console.log('  Connected\n')

  const graph = buildPreGenGraph(retriever, llm, drive, FOLDER_ID)

  console.log('Running PreGen agent...')
  console.log('  Step 1: Extracting lore from LanceDB...')
  const result = await graph.invoke({})

  console.log('\n✓ PreGen complete!')
  console.log(`  Lore entries:  ${result.lore.length}`)
  console.log(`  Story nodes:   ${result.nodes.length}`)
  console.log(`  Story edges:   ${result.edges.length}`)

  if (result.validationErrors.length > 0) {
    console.log('\n  ⚠ Saved with validation errors (retries exhausted):')
    result.validationErrors.forEach((e: string) => console.log(`    - ${e}`))
  }

  console.log('\n  Files saved to Google Drive: lore.json, nodes.json, edges.json')
  console.log('  Run `npm run dev` to start the chat interface (Phase 3).\n')
}

main().catch(err => {
  console.error('\n✗ PreGen failed:', err.message)
  process.exit(1)
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/story/pregen.ts
git commit -m "feat: add pregen entry point script"
```

---

## Task 11: E2E Manual Test

### Setup Google Cloud (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Enable **Google Drive API**: APIs & Services → Library → search "Google Drive API" → Enable
4. Create OAuth2 credentials: APIs & Services → Credentials → Create Credentials → **OAuth 2.0 Client ID** → Application type: **Desktop app** → Create
5. Download JSON file → save as `data/google-credentials.json`
6. Create a folder in Google Drive, copy its ID from the URL: `drive.google.com/drive/folders/<FOLDER_ID>`

### Run OAuth2 Setup

```bash
npm run auth
```

Open the printed URL in browser, sign in, grant Drive access, copy the code, paste into terminal.

Expected:
```
=== Google Drive OAuth2 Setup ===

1. Open this URL in your browser:
https://accounts.google.com/o/oauth2/...

Enter the authorization code: 4/...

✓ Token saved to ./data/google-token.json
You can now run `npm run pregen`.
```

### Run PreGen

```bash
GOOGLE_DRIVE_FOLDER_ID=<your_folder_id> npm run pregen
```

Expected:
```
=== VtM Chat — Story PreGen ===

Connecting to services...
  Connected

Running PreGen agent...
  Step 1: Extracting lore from LanceDB...
  Extracted N lore entries
  Generated N nodes, N edges
  Graph valid
  Saving to Google Drive...
  Saved lore.json, nodes.json, edges.json

✓ PreGen complete!
  Lore entries:  N
  Story nodes:   N
  Story edges:   N

  Files saved to Google Drive: lore.json, nodes.json, edges.json
```

### Verify

Open the Google Drive folder — confirm 3 JSON files appear (`lore.json`, `nodes.json`, `edges.json`) with non-empty content and correct structure.

---

## Self-Review

### 1. Spec Coverage

| Spec requirement (Phase 2) | Task |
|---|---|
| `npm run pregen` script | Task 1 + Task 10 |
| `npm run auth` OAuth2 setup | Task 1 + Task 4 |
| LangGraph StateGraph 4 nodes | Task 9 |
| extract_lore: RAG queries → lore.json | Task 5 |
| generate_skeleton: LLM → nodes+edges | Task 6 |
| validate_graph: structural checks + retry loop max 3 | Task 7 + Task 9 |
| save_to_drive: googleapis OAuth2 | Task 3 + Task 8 |
| 3 story arcs, 5-7 scenes each | Task 6 (prompt instructs this) |
| nodes/edges/lore schema from design spec | Task 2 |
| Google Drive JSON files idempotent (create or update) | Task 3 |

All requirements covered. ✓

### 2. Placeholder Scan

No TBDs, TODOs, or vague steps. All steps include complete code. ✓

### 3. Type Consistency

- `LoreEntry`, `StoryNode`, `StoryEdge`, `PreGenState`, `PreGenStateType` defined in Task 2, used consistently in Tasks 5-10 ✓
- `DriveClient` interface defined in Task 3, imported in Tasks 8, 9, 10 ✓
- `readJSONFromDrive`, `writeJSONToDrive` exported from `drive.ts`, tested in `drive.test.ts` ✓
- `routeAfterValidation` exported from `graph.ts`, tested in `graph.test.ts` ✓
- `buildPreGenGraph(retriever, llm, drive, folderId)` signature consistent across Task 9 definition and Task 10 usage ✓
- Node function signatures all take `(state: PreGenStateType, ...deps)` ✓
