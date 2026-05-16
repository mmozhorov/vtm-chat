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
