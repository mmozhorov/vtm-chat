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
