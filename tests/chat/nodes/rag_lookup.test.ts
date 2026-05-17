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
