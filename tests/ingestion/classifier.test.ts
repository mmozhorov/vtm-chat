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
