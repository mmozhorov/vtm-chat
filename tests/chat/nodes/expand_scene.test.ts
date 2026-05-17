import { describe, it, expect, vi } from 'vitest'
import type { ChatStateType } from '../../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../../src/story/types.js'

const unexpandedNode: StoryNode = {
  id: 'n1', title: 'Клуб Элизиум', description_template: 'Тёмный клуб. {{details}}',
  npc_ids: ['marcus'], location: 'Чикаго', type: 'scene', is_expanded: false,
}
const expandedNode: StoryNode = { ...unexpandedNode, is_expanded: true }

function makeState(overrides: Partial<ChatStateType>): ChatStateType {
  return {
    message: 'Вхожу в клуб',
    intent: 'explore_scene',
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [unexpandedNode],
    edges: [] as StoryEdge[],
    lore: [] as LoreEntry[],
    ragContext: '',
    response: '',
    ...overrides,
  }
}

describe('expandSceneNode', () => {
  it('expands the current node when is_expanded is false', async () => {
    const mockRetriever = { invoke: vi.fn().mockResolvedValue([{ pageContent: 'Элизиум — нейтральная территория вампиров.' }]) }
    const mockLlm = { invoke: vi.fn().mockResolvedValue('Тёмный клуб с готическими колоннами и красным светом.') }
    const mockDrive = { readJSON: vi.fn(), writeJSON: vi.fn().mockResolvedValue(undefined) }

    const { expandSceneNode } = await import('../../../src/chat/nodes/expand_scene.js')
    const result = await expandSceneNode(makeState({}), mockRetriever as never, mockLlm as never, mockDrive, 'folder1')

    expect(result.nodes?.[0].is_expanded).toBe(true)
    expect(result.nodes?.[0].description_template).toBe('Тёмный клуб с готическими колоннами и красным светом.')
    expect(mockDrive.writeJSON).toHaveBeenCalledWith('folder1', 'nodes.json', result.nodes)
  })

  it('is a no-op when current node is already expanded', async () => {
    const mockDrive = { readJSON: vi.fn(), writeJSON: vi.fn() }
    const mockRetriever = { invoke: vi.fn() }
    const mockLlm = { invoke: vi.fn() }

    const { expandSceneNode } = await import('../../../src/chat/nodes/expand_scene.js')
    const result = await expandSceneNode(
      makeState({ nodes: [expandedNode] }),
      mockRetriever as never, mockLlm as never, mockDrive, 'folder1',
    )

    expect(result).toEqual({})
    expect(mockDrive.writeJSON).not.toHaveBeenCalled()
  })

  it('is a no-op when current node is not found', async () => {
    const mockDrive = { readJSON: vi.fn(), writeJSON: vi.fn() }
    const { expandSceneNode } = await import('../../../src/chat/nodes/expand_scene.js')
    const result = await expandSceneNode(
      makeState({ session: { id: 's1', player_name: 'Игрок', current_node_id: 'MISSING', visited_nodes: [], history: [] } }),
      {} as never, {} as never, mockDrive, 'folder1',
    )
    expect(result).toEqual({})
    expect(mockDrive.writeJSON).not.toHaveBeenCalled()
  })
})
