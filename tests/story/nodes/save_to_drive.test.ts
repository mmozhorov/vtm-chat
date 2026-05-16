import { describe, it, expect, vi } from 'vitest'
import { saveToDriveNode } from '../../../src/story/nodes/save_to_drive.js'
import type { DriveClient } from '../../../src/shared/drive.js'
import type { PreGenStateType } from '../../../src/story/types.js'

const state: PreGenStateType = {
  lore: [{ id: 'l1', type: 'character', name: 'Баллард', summary: 'Лидер' }],
  nodes: [{ id: 'n1', title: 'Intro', description_template: '{{details}}', npc_ids: [], location: 'Chicago', type: 'intro', is_expanded: false }],
  edges: [{ id: 'e1', from_node_id: 'n1', to_node_id: 'n1', choice_text: 'Go', condition: '' }],
  validationErrors: [],
  retryCount: 0,
}

describe('saveToDriveNode', () => {
  it('writes lore.json, nodes.json, and edges.json to Drive', async () => {
    const mockDrive: DriveClient = {
      readJSON: vi.fn(),
      writeJSON: vi.fn().mockResolvedValue(undefined),
    }
    await saveToDriveNode(state, mockDrive, 'folder123')

    expect(mockDrive.writeJSON).toHaveBeenCalledTimes(3)
    expect(mockDrive.writeJSON).toHaveBeenCalledWith('folder123', 'lore.json', state.lore)
    expect(mockDrive.writeJSON).toHaveBeenCalledWith('folder123', 'nodes.json', state.nodes)
    expect(mockDrive.writeJSON).toHaveBeenCalledWith('folder123', 'edges.json', state.edges)
  })

  it('returns empty partial state (does not modify state)', async () => {
    const mockDrive: DriveClient = {
      readJSON: vi.fn(),
      writeJSON: vi.fn().mockResolvedValue(undefined),
    }
    const result = await saveToDriveNode(state, mockDrive, 'folder123')
    expect(result).toEqual({})
  })
})
