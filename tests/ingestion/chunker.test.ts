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
