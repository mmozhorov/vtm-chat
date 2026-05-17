import { describe, it, expect, vi } from 'vitest'
import type { StoryNode, StoryEdge, LoreEntry } from '../../src/story/types.js'

const nodes: StoryNode[] = [{ id: 'n1', title: 'Intro', description_template: '{{details}}', npc_ids: [], location: 'Chicago', type: 'intro', is_expanded: false }]
const edges: StoryEdge[] = [{ id: 'e1', from_node_id: 'n1', to_node_id: 'n2', choice_text: 'Enter', condition: '' }]
const lore: LoreEntry[] = [{ id: 'l1', type: 'character', name: 'Луций', summary: 'Древний вампир' }]

describe('loadGraphCache', () => {
  it('reads nodes, edges, and lore from Drive', async () => {
    const mockDrive = {
      readJSON: vi.fn()
        .mockResolvedValueOnce(nodes)
        .mockResolvedValueOnce(edges)
        .mockResolvedValueOnce(lore),
      writeJSON: vi.fn(),
    }
    const { loadGraphCache } = await import('../../src/chat/graph-cache.js')
    const cache = await loadGraphCache(mockDrive, 'folder1')
    expect(cache.nodes).toEqual(nodes)
    expect(cache.edges).toEqual(edges)
    expect(cache.lore).toEqual(lore)
    expect(mockDrive.readJSON).toHaveBeenCalledWith('folder1', 'nodes.json')
    expect(mockDrive.readJSON).toHaveBeenCalledWith('folder1', 'edges.json')
    expect(mockDrive.readJSON).toHaveBeenCalledWith('folder1', 'lore.json')
  })

  it('returns empty arrays when Drive files are missing', async () => {
    const mockDrive = { readJSON: vi.fn().mockResolvedValue(null), writeJSON: vi.fn() }
    const { loadGraphCache } = await import('../../src/chat/graph-cache.js')
    const cache = await loadGraphCache(mockDrive, 'folder1')
    expect(cache.nodes).toEqual([])
    expect(cache.edges).toEqual([])
    expect(cache.lore).toEqual([])
  })
})
