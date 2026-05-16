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
