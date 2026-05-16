import { describe, it, expect, afterAll } from 'vitest'
import { LanceDB } from '@langchain/community/vectorstores/lancedb'
import { createEmbeddings } from '../../src/shared/embeddings.js'
import { rm } from 'fs/promises'
import path from 'path'

const TEST_DB = path.resolve('./data/test-retriever-db')

// Requires: Ollama running with nomic-embed-text pulled
// Run manually: npx vitest run tests/shared/retriever.test.ts
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
