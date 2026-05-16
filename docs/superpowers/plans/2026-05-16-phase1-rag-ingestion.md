# Phase 1: RAG Ingestion Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-shot ingestion script (`npm run ingest`) that reads Chicago by Night PDF, chunks it, classifies each chunk with an LLM, embeds with Ollama, and stores in LanceDB — plus a retriever factory used by later phases.

**Architecture:** PDFLoader → RecursiveCharacterTextSplitter → LLM classifier (qwen2.5:14b) → OllamaEmbeddings (nomic-embed-text) → LanceDB. Each step is a focused module. The retriever factory wraps LanceDB and is the only export shared with Phases 2 and 3.

**Tech Stack:** TypeScript (ESM), LangChain.js v0.3, @lancedb/lancedb, @langchain/ollama, Vitest

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Scripts, deps |
| `tsconfig.json` | TypeScript ESM config |
| `vitest.config.ts` | Test runner config |
| `.env.example` | Env variable documentation |
| `src/ingestion/loader.ts` | PDF → Document[] |
| `src/ingestion/chunker.ts` | Document[] → chunks with metadata |
| `src/ingestion/classifier.ts` | LLM chunk classification |
| `src/ingestion/store.ts` | Write chunks to LanceDB (idempotent) |
| `src/ingestion/ingest.ts` | Main script — wires all steps |
| `src/shared/embeddings.ts` | OllamaEmbeddings factory |
| `src/shared/retriever.ts` | LanceDB retriever factory (used by Phase 2 & 3) |
| `tests/ingestion/loader.test.ts` | PDF loader tests |
| `tests/ingestion/chunker.test.ts` | Chunker tests |
| `tests/ingestion/classifier.test.ts` | Classifier tests (mocked LLM) |
| `tests/shared/retriever.test.ts` | Retriever integration test (skipped by default) |

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "vtm-chat",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "ingest": "tsx src/ingestion/ingest.ts",
    "verify": "tsx src/ingestion/verify.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@langchain/community": "^0.3.37",
    "@langchain/core": "^0.3.37",
    "@langchain/ollama": "^0.1.8",
    "@langchain/textsplitters": "^0.1.0",
    "@lancedb/lancedb": "^0.12.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 4: Create .env.example**

```
OLLAMA_BASE_URL=http://localhost:11434
LANCEDB_PATH=./data/lancedb
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected output: `added N packages` with no errors.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (no errors). If errors appear, fix tsconfig.json first.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .env.example package-lock.json
git commit -m "chore: bootstrap TypeScript + Vitest project"
```

---

## Task 2: PDF Loader

**Files:**
- Create: `src/ingestion/loader.ts`
- Create: `tests/ingestion/loader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ingestion/loader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { loadPDF } from '../../src/ingestion/loader.js'
import path from 'path'

const PDF_PATH = path.resolve('./Chicago_by_Night_(2nd_Edition)_ru.pdf')

describe('loadPDF', () => {
  it('returns at least one page', async () => {
    const docs = await loadPDF(PDF_PATH)
    expect(docs.length).toBeGreaterThan(0)
  })

  it('each page has non-empty pageContent', async () => {
    const docs = await loadPDF(PDF_PATH)
    const nonEmpty = docs.filter(d => d.pageContent.trim().length > 0)
    expect(nonEmpty.length).toBeGreaterThan(0)
  })

  it('metadata includes source path', async () => {
    const docs = await loadPDF(PDF_PATH)
    expect(docs[0].metadata.source).toBe(PDF_PATH)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose tests/ingestion/loader.test.ts
```

Expected: FAIL — `Cannot find module '../../src/ingestion/loader.js'`

- [ ] **Step 3: Create src/ingestion/loader.ts**

```typescript
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import type { Document } from '@langchain/core/documents'

export async function loadPDF(pdfPath: string): Promise<Document[]> {
  const loader = new PDFLoader(pdfPath, { splitPages: true })
  return loader.load()
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --reporter=verbose tests/ingestion/loader.test.ts
```

Expected: all 3 tests PASS. If Cyrillic text appears garbled (only boxes/question marks), check that `pdf-parse` is installed: `npm install pdf-parse`.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/loader.ts tests/ingestion/loader.test.ts
git commit -m "feat(ingestion): add PDF loader"
```

---

## Task 3: Text Chunker

**Files:**
- Create: `src/ingestion/chunker.ts`
- Create: `tests/ingestion/chunker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ingestion/chunker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { chunkDocuments } from '../../src/ingestion/chunker.js'
import type { Document } from '@langchain/core/documents'

const makeDoc = (content: string, pageNumber = 1): Document => ({
  pageContent: content,
  metadata: { source: 'test.pdf', loc: { pageNumber } },
})

describe('chunkDocuments', () => {
  it('splits a 3000-char document into multiple chunks', async () => {
    const docs = [makeDoc('А'.repeat(3000))]
    const chunks = await chunkDocuments(docs)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('each chunk is under 1200 characters', async () => {
    const docs = [makeDoc('Вампир '.repeat(500))]
    const chunks = await chunkDocuments(docs)
    chunks.forEach(chunk => {
      expect(chunk.pageContent.length).toBeLessThanOrEqual(1200)
    })
  })

  it('adds chunk_id, source_page, chunk_type, entity_name to metadata', async () => {
    const docs = [makeDoc('Клан Тремер обитает в Вене.', 42)]
    const chunks = await chunkDocuments(docs)
    expect(chunks[0].metadata.chunk_id).toMatch(/^chunk_\d+$/)
    expect(chunks[0].metadata.source_page).toBe(42)
    expect(chunks[0].metadata.chunk_type).toBe('lore')
    expect(chunks[0].metadata.entity_name).toBe('')
  })

  it('preserves content from source document', async () => {
    const text = 'Чикаго — город на берегу Мичигана.'
    const docs = [makeDoc(text)]
    const chunks = await chunkDocuments(docs)
    expect(chunks[0].pageContent).toContain('Чикаго')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose tests/ingestion/chunker.test.ts
```

Expected: FAIL — `Cannot find module '../../src/ingestion/chunker.js'`

- [ ] **Step 3: Create src/ingestion/chunker.ts**

```typescript
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { Document } from '@langchain/core/documents'

export async function chunkDocuments(docs: Document[]): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  })

  const chunks = await splitter.splitDocuments(docs)

  return chunks.map((chunk, i) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      chunk_id: `chunk_${i}`,
      source_page: chunk.metadata.loc?.pageNumber ?? 0,
      chunk_type: 'lore' as const,
      entity_name: '',
    },
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --reporter=verbose tests/ingestion/chunker.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/chunker.ts tests/ingestion/chunker.test.ts
git commit -m "feat(ingestion): add text chunker with metadata"
```

---

## Task 4: LLM Chunk Classifier

**Files:**
- Create: `src/ingestion/classifier.ts`
- Create: `tests/ingestion/classifier.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ingestion/classifier.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { classifyChunk, classifyBatch } from '../../src/ingestion/classifier.js'
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { Document } from '@langchain/core/documents'

function mockLLM(response: string): BaseLLM {
  return { invoke: vi.fn().mockResolvedValue(response) } as unknown as BaseLLM
}

describe('classifyChunk', () => {
  it('parses character type correctly', async () => {
    const llm = mockLLM('{"chunk_type": "character", "entity_name": "Лукиан"}')
    const result = await classifyChunk(llm, 'Описание Лукиана.')
    expect(result.chunk_type).toBe('character')
    expect(result.entity_name).toBe('Лукиан')
  })

  it('parses location type correctly', async () => {
    const llm = mockLLM('{"chunk_type": "location", "entity_name": "Чикаго"}')
    const result = await classifyChunk(llm, 'Описание Чикаго.')
    expect(result.chunk_type).toBe('location')
    expect(result.entity_name).toBe('Чикаго')
  })

  it('defaults to lore on invalid JSON', async () => {
    const llm = mockLLM('not json')
    const result = await classifyChunk(llm, 'Текст')
    expect(result.chunk_type).toBe('lore')
    expect(result.entity_name).toBe('')
  })

  it('defaults to lore on unknown chunk_type value', async () => {
    const llm = mockLLM('{"chunk_type": "monster", "entity_name": ""}')
    const result = await classifyChunk(llm, 'Текст')
    expect(result.chunk_type).toBe('lore')
  })
})

describe('classifyBatch', () => {
  it('enriches all documents with classification metadata', async () => {
    const llm = mockLLM('{"chunk_type": "faction", "entity_name": "Тремер"}')
    const docs: Document[] = [
      { pageContent: 'text1', metadata: {} },
      { pageContent: 'text2', metadata: {} },
    ]
    const result = await classifyBatch(llm, docs)
    expect(result).toHaveLength(2)
    expect(result[0].metadata.chunk_type).toBe('faction')
    expect(result[1].metadata.entity_name).toBe('Тремер')
  })

  it('preserves existing metadata', async () => {
    const llm = mockLLM('{"chunk_type": "lore", "entity_name": ""}')
    const docs: Document[] = [
      { pageContent: 'text', metadata: { chunk_id: 'chunk_0', source_page: 5 } },
    ]
    const result = await classifyBatch(llm, docs)
    expect(result[0].metadata.chunk_id).toBe('chunk_0')
    expect(result[0].metadata.source_page).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose tests/ingestion/classifier.test.ts
```

Expected: FAIL — `Cannot find module '../../src/ingestion/classifier.js'`

- [ ] **Step 3: Create src/ingestion/classifier.ts**

```typescript
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { Document } from '@langchain/core/documents'

export type ChunkType = 'lore' | 'character' | 'location' | 'faction'

export interface ChunkMeta {
  chunk_type: ChunkType
  entity_name: string
}

const VALID_TYPES: ChunkType[] = ['lore', 'character', 'location', 'faction']

function buildPrompt(text: string): string {
  return `Classify this text from a Vampire: The Masquerade sourcebook.
Respond ONLY with a single line of JSON. No explanation.
{"chunk_type": "lore"|"character"|"location"|"faction", "entity_name": "name or empty string"}

Text:
${text.slice(0, 400)}

JSON:`
}

export async function classifyChunk(
  llm: BaseLLM,
  content: string
): Promise<ChunkMeta> {
  try {
    const response = String(await llm.invoke(buildPrompt(content)))
    const match = response.match(/\{[^}]+\}/)
    if (!match) return { chunk_type: 'lore', entity_name: '' }
    const parsed = JSON.parse(match[0])
    return {
      chunk_type: VALID_TYPES.includes(parsed.chunk_type)
        ? (parsed.chunk_type as ChunkType)
        : 'lore',
      entity_name: String(parsed.entity_name ?? ''),
    }
  } catch {
    return { chunk_type: 'lore', entity_name: '' }
  }
}

export async function classifyBatch(
  llm: BaseLLM,
  chunks: Document[],
  batchSize = 10
): Promise<Document[]> {
  const results: Document[] = []
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const classified = await Promise.all(
      batch.map(async chunk => {
        const meta = await classifyChunk(llm, chunk.pageContent)
        return { ...chunk, metadata: { ...chunk.metadata, ...meta } }
      })
    )
    results.push(...classified)
    process.stdout.write(
      `  Classified ${Math.min(i + batchSize, chunks.length)}/${chunks.length} chunks\r`
    )
  }
  process.stdout.write('\n')
  return results
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --reporter=verbose tests/ingestion/classifier.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/classifier.ts tests/ingestion/classifier.test.ts
git commit -m "feat(ingestion): add LLM chunk classifier with fallback"
```

---

## Task 5: Embeddings Factory

**Files:**
- Create: `src/shared/embeddings.ts`

No unit test — wraps OllamaEmbeddings directly. Tested implicitly in Task 6.

- [ ] **Step 1: Create src/shared/embeddings.ts**

```typescript
import { OllamaEmbeddings } from '@langchain/ollama'

export function createEmbeddings() {
  return new OllamaEmbeddings({
    model: 'nomic-embed-text',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/embeddings.ts
git commit -m "feat(shared): add Ollama embeddings factory"
```

---

## Task 6: LanceDB Store

**Files:**
- Create: `src/ingestion/store.ts`

- [ ] **Step 1: Create src/ingestion/store.ts**

```typescript
import { LanceDB } from '@langchain/community/vectorstores/lancedb'
import * as lancedb from '@lancedb/lancedb'
import type { Embeddings } from '@langchain/core/embeddings'
import type { Document } from '@langchain/core/documents'

const TABLE_NAME = 'chunks'

export async function storeChunks(
  chunks: Document[],
  embeddings: Embeddings,
  dbPath: string
): Promise<void> {
  const db = await lancedb.connect(dbPath)
  const tableNames = await db.tableNames()

  if (tableNames.includes(TABLE_NAME)) {
    console.log(`Table '${TABLE_NAME}' already exists — skipping ingestion.`)
    console.log('To re-ingest, delete ./data/lancedb and run again.')
    return
  }

  console.log(`Storing ${chunks.length} chunks into LanceDB...`)
  await LanceDB.fromDocuments(chunks, embeddings, {
    uri: dbPath,
    tableName: TABLE_NAME,
  })
  console.log('Stored successfully.')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ingestion/store.ts
git commit -m "feat(ingestion): add idempotent LanceDB store"
```

---

## Task 7: Retriever Factory

**Files:**
- Create: `src/shared/retriever.ts`
- Create: `tests/shared/retriever.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/shared/retriever.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest'
import { LanceDB } from '@langchain/community/vectorstores/lancedb'
import { createEmbeddings } from '../../src/shared/embeddings.js'
import { rm } from 'fs/promises'
import path from 'path'

const TEST_DB = path.resolve('./data/test-retriever-db')

// Requires: Ollama running with nomic-embed-text pulled
// Run manually: npm test -- tests/shared/retriever.test.ts
describe.skip('createRetriever (integration — requires Ollama)', () => {
  afterAll(async () => {
    await rm(TEST_DB, { recursive: true, force: true })
  })

  it('retrieves relevant document from seeded store', async () => {
    const embeddings = createEmbeddings()
    const docs = [
      {
        pageContent: 'Клан Тремер — вампиры-маги, бывшие смертные волшебники.',
        metadata: { chunk_type: 'faction', entity_name: 'Тремер', chunk_id: 'c1', source_page: 1 },
      },
      {
        pageContent: 'Чикаго расположен на берегу озера Мичиган.',
        metadata: { chunk_type: 'location', entity_name: 'Чикаго', chunk_id: 'c2', source_page: 2 },
      },
    ]

    await LanceDB.fromDocuments(docs, embeddings, {
      uri: TEST_DB,
      tableName: 'chunks',
    })

    const { createRetriever } = await import('../../src/shared/retriever.js')
    const retriever = await createRetriever(1, TEST_DB)
    const results = await retriever.invoke('маги вампиры волшебники')

    expect(results).toHaveLength(1)
    expect(results[0].metadata.entity_name).toBe('Тремер')
  })
})
```

- [ ] **Step 2: Run test to verify skip works**

```bash
npm test -- --reporter=verbose tests/shared/retriever.test.ts
```

Expected: 0 tests run (all skipped), no failures.

- [ ] **Step 3: Create src/shared/retriever.ts**

```typescript
import { LanceDB } from '@langchain/community/vectorstores/lancedb'
import * as lancedb from '@lancedb/lancedb'
import { createEmbeddings } from './embeddings.js'

const TABLE_NAME = 'chunks'

export async function createRetriever(k = 5, dbPath?: string) {
  const resolvedPath = dbPath ?? process.env.LANCEDB_PATH ?? './data/lancedb'
  const db = await lancedb.connect(resolvedPath)
  const table = await db.openTable(TABLE_NAME)
  const embeddings = createEmbeddings()
  const vectorStore = new LanceDB(embeddings, { table })
  return vectorStore.asRetriever({ k })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/retriever.ts tests/shared/retriever.test.ts
git commit -m "feat(shared): add LanceDB retriever factory"
```

---

## Task 8: Ingestion Orchestrator

**Files:**
- Create: `src/ingestion/ingest.ts`
- Create: `src/ingestion/verify.ts`

- [ ] **Step 1: Create src/ingestion/ingest.ts**

```typescript
import { loadPDF } from './loader.js'
import { chunkDocuments } from './chunker.js'
import { classifyBatch } from './classifier.js'
import { storeChunks } from './store.js'
import { createEmbeddings } from '../shared/embeddings.js'
import { Ollama } from '@langchain/ollama'
import path from 'path'

const PDF_PATH = path.resolve('./Chicago_by_Night_(2nd_Edition)_ru.pdf')
const DB_PATH = process.env.LANCEDB_PATH ?? './data/lancedb'
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'

async function main() {
  console.log('=== VtM Chat — RAG Ingestion Pipeline ===\n')

  console.log('Step 1/4: Loading PDF...')
  const pages = await loadPDF(PDF_PATH)
  console.log(`  Loaded ${pages.length} pages\n`)

  console.log('Step 2/4: Chunking text...')
  const chunks = await chunkDocuments(pages)
  console.log(`  Created ${chunks.length} chunks\n`)

  console.log('Step 3/4: Classifying chunks with LLM...')
  const llm = new Ollama({ model: 'qwen2.5:14b', baseUrl: OLLAMA_URL })
  const classified = await classifyBatch(llm, chunks)
  console.log(`  Done\n`)

  console.log('Step 4/4: Storing in LanceDB...')
  const embeddings = createEmbeddings()
  await storeChunks(classified, embeddings, DB_PATH)

  console.log('\n✓ Ingestion complete!')
  console.log(`  Vector store: ${DB_PATH}`)
  console.log('  Run `npm run verify` to test retrieval.\n')
}

main().catch(err => {
  console.error('\n✗ Ingestion failed:', err.message)
  process.exit(1)
})
```

- [ ] **Step 2: Create src/ingestion/verify.ts**

```typescript
import { createRetriever } from '../shared/retriever.js'

console.log('=== VtM Chat — Retrieval Verification ===\n')

const queries = [
  'клан Тремер Чикаго',
  'Принц города вампиры',
  'Носферату сборщики информации',
]

const retriever = await createRetriever(3)

for (const query of queries) {
  console.log(`Query: "${query}"`)
  const results = await retriever.invoke(query)
  results.forEach((doc, i) => {
    const type = doc.metadata.chunk_type
    const name = doc.metadata.entity_name || '—'
    const page = doc.metadata.source_page
    console.log(`  [${i + 1}] ${type}:${name} (стр. ${page})`)
    console.log(`       ${doc.pageContent.slice(0, 120).replace(/\n/g, ' ')}...`)
  })
  console.log()
}
```

- [ ] **Step 3: Run all unit tests to make sure nothing broke**

```bash
npm test
```

Expected: all non-skipped tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ingestion/ingest.ts src/ingestion/verify.ts
git commit -m "feat(ingestion): add orchestrator and verification script"
```

---

## Task 9: End-to-End Manual Test

Prerequisites — run these commands first, **before** `npm run ingest`:

- [ ] **Step 1: Start Ollama**

```bash
ollama serve
```

Leave running in a separate terminal.

- [ ] **Step 2: Pull required models**

```bash
ollama pull nomic-embed-text
ollama pull qwen2.5:14b
```

`nomic-embed-text` ~270MB, `qwen2.5:14b` ~9GB. `qwen2.5:14b` download may take 10-20 min depending on connection.

- [ ] **Step 3: Run ingestion**

```bash
npm run ingest
```

Expected output:
```
=== VtM Chat — RAG Ingestion Pipeline ===

Step 1/4: Loading PDF...
  Loaded NNN pages

Step 2/4: Chunking text...
  Created NNN chunks

Step 3/4: Classifying chunks with LLM...
  Classified NNN/NNN chunks

Step 4/4: Storing in LanceDB...
  Storing NNN chunks into LanceDB...
  Stored successfully.

✓ Ingestion complete!
  Vector store: ./data/lancedb
  Run `npm run verify` to test retrieval.
```

Total time: 10–30 minutes (classification is the bottleneck).

- [ ] **Step 4: Verify retrieval works**

```bash
npm run verify
```

Expected: 3 queries, each returning 3 documents with Russian text from the book. If results look wrong (unrelated content), the embedding quality is fine but chunk_type classification may be off — that's OK for Phase 1.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: complete Phase 1 RAG ingestion pipeline"
```

---

## Troubleshooting

**Cyrillic text appears as `?????` in chunks:**  
`pdf-parse` may not handle the specific PDF encoding. Run: `npm install pdf-parse@1.1.1`. If it still fails, try `pdfjs-dist` as alternative loader.

**`LanceDB.fromDocuments` throws schema error:**  
LanceDB needs at least one row to infer schema. If the chunks array is empty (PDF failed to load), fix the loader first.

**Ollama connection refused:**  
Make sure `ollama serve` is running. Check `curl http://localhost:11434/api/tags`.

**Classification is very slow:**  
Each chunk sends one LLM request. With 1000+ chunks this can take 30+ minutes. To speed up: reduce `batchSize` to 1 (parallel requests instead of sequential) — change `Promise.all` in `classifyBatch` already handles parallelism within each batch.

**`npm run ingest` fails on second run:**  
By design — the store is idempotent by table existence. Delete `./data/lancedb` and re-run to start fresh.

**`LanceDB.fromDocuments` throws `uri is not a valid parameter`:**  
Older versions of `@langchain/community` expect a `Table` object, not `{ uri, tableName }`. If this happens, pin to `@langchain/community@0.3.37` or replace store.ts Task 6 Step 1 with:
```typescript
const db = await lancedb.connect(dbPath)
const table = await db.createTable(TABLE_NAME, [{ vector: Array(768).fill(0), pageContent: '', metadata: {} }])
await LanceDB.fromDocuments(chunks, embeddings, { table })
```
Then delete the dummy first row: `await table.delete('pageContent = ""')`

**`Cannot find package 'vectordb'`:**  
Some LangChain versions still peer-depend on the old `vectordb` package. Run `npm install vectordb` if you see this error.
