import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatStateType } from '../../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../../src/story/types.js'

vi.mock('../../../src/chat/session.js', () => ({ writeSession: vi.fn() }))

function makeState(overrides: Partial<ChatStateType>): ChatStateType {
  return {
    message: 'Привет',
    intent: 'explore_scene',
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [] as StoryNode[],
    edges: [] as StoryEdge[],
    lore: [] as LoreEntry[],
    ragContext: '',
    response: 'Добро пожаловать.',
    ...overrides,
  }
}

describe('saveSessionNode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('appends user and assistant messages to history', async () => {
    const { saveSessionNode } = await import('../../../src/chat/nodes/save_session.js')
    const result = saveSessionNode(makeState({}))
    expect(result.session?.history).toEqual([
      { role: 'user', content: 'Привет' },
      { role: 'assistant', content: 'Добро пожаловать.' },
    ])
  })

  it('calls writeSession with updated session', async () => {
    const { saveSessionNode } = await import('../../../src/chat/nodes/save_session.js')
    const { writeSession } = await import('../../../src/chat/session.js')
    saveSessionNode(makeState({}))
    expect(writeSession).toHaveBeenCalledOnce()
  })

  it('preserves existing history', async () => {
    const { saveSessionNode } = await import('../../../src/chat/nodes/save_session.js')
    const existing = [{ role: 'user' as const, content: 'Ранее' }, { role: 'assistant' as const, content: 'Ответ ранее' }]
    const result = saveSessionNode(makeState({ session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: existing } }))
    expect(result.session?.history).toHaveLength(4)
    expect(result.session?.history[0]).toEqual({ role: 'user', content: 'Ранее' })
  })
})
