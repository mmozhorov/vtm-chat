import { describe, it, expect } from 'vitest'
import type { ChatStateType } from '../../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../../src/story/types.js'

const edges: StoryEdge[] = [
  { id: 'e1', from_node_id: 'n1', to_node_id: 'n2', choice_text: 'Enter the club', condition: '' },
  { id: 'e2', from_node_id: 'n1', to_node_id: 'n3', choice_text: 'Stay outside', condition: '' },
]

function makeState(overrides: Partial<ChatStateType>): ChatStateType {
  return {
    message: '1',
    intent: 'make_choice',
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [] as StoryNode[],
    edges,
    lore: [] as LoreEntry[],
    ragContext: '',
    response: '',
    ...overrides,
  }
}

describe('navigateGraphNode', () => {
  it('navigates to first edge target when player chooses "1"', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ message: '1' }))
    expect(result.session?.current_node_id).toBe('n2')
  })

  it('navigates to second edge target when player chooses "2"', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ message: '2' }))
    expect(result.session?.current_node_id).toBe('n3')
  })

  it('adds new node to visited_nodes', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ message: '1' }))
    expect(result.session?.visited_nodes).toContain('n2')
  })

  it('returns empty object for explore_scene (no navigation)', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ intent: 'explore_scene', message: 'Осматриваюсь' }))
    expect(result).toEqual({})
  })

  it('returns empty object when choice number is out of range', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ message: '9' }))
    expect(result).toEqual({})
  })

  it('returns empty object when message contains no number', async () => {
    const { navigateGraphNode } = await import('../../../src/chat/nodes/navigate_graph.js')
    const result = navigateGraphNode(makeState({ message: 'иду туда' }))
    expect(result).toEqual({})
  })
})
