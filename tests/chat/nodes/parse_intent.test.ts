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
