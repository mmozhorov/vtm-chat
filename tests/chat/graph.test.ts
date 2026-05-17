import { describe, it, expect } from 'vitest'
import type { ChatStateType } from '../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../src/story/types.js'

function makeState(overrides: Partial<ChatStateType>): ChatStateType {
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

describe('routeByIntent', () => {
  it('routes lore_question to rag_lookup', async () => {
    const { routeByIntent } = await import('../../src/chat/graph.js')
    expect(routeByIntent(makeState({ intent: 'lore_question' }))).toBe('rag_lookup')
  })

  it('routes make_choice to navigate_graph', async () => {
    const { routeByIntent } = await import('../../src/chat/graph.js')
    expect(routeByIntent(makeState({ intent: 'make_choice' }))).toBe('navigate_graph')
  })

  it('routes explore_scene to navigate_graph', async () => {
    const { routeByIntent } = await import('../../src/chat/graph.js')
    expect(routeByIntent(makeState({ intent: 'explore_scene' }))).toBe('navigate_graph')
  })

  it('routes null intent to navigate_graph as default', async () => {
    const { routeByIntent } = await import('../../src/chat/graph.js')
    expect(routeByIntent(makeState({ intent: null }))).toBe('navigate_graph')
  })
})
