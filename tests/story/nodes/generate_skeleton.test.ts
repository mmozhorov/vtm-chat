import { describe, it, expect, vi } from 'vitest'
import { generateSkeletonNode } from '../../../src/story/nodes/generate_skeleton.js'
import type { PreGenStateType } from '../../../src/story/types.js'

const baseState: PreGenStateType = {
  lore: [
    { id: 'lore_0', type: 'character', name: 'Баллард', summary: 'Лидер Тремере' },
    { id: 'lore_1', type: 'location', name: 'Двор Принца', summary: 'Резиденция принца Чикаго' },
  ],
  nodes: [],
  edges: [],
  validationErrors: [],
  retryCount: 0,
}

const validGraphJSON = JSON.stringify({
  nodes: [
    { id: 'n1', title: 'Прибытие', description_template: 'Вы прибываете в {{details}}', npc_ids: [], location: 'Чикаго', type: 'intro', is_expanded: false },
    { id: 'n2', title: 'Встреча', description_template: 'Вы встречаете {{details}}', npc_ids: ['lore_0'], location: 'Двор Принца', type: 'scene', is_expanded: false },
    { id: 'n3', title: 'Конец', description_template: 'История завершается {{details}}', npc_ids: [], location: 'Чикаго', type: 'ending', is_expanded: false },
  ],
  edges: [
    { id: 'e1', from_node_id: 'n1', to_node_id: 'n2', choice_text: 'Идти во Двор', condition: '' },
    { id: 'e2', from_node_id: 'n2', to_node_id: 'n3', choice_text: 'Принять судьбу', condition: '' },
  ],
})

describe('generateSkeletonNode', () => {
  it('parses valid LLM JSON response into nodes and edges', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue(validGraphJSON) } as never
    const result = await generateSkeletonNode(baseState, mockLlm)
    expect(result.nodes).toHaveLength(3)
    expect(result.edges).toHaveLength(2)
    expect(result.nodes![0].type).toBe('intro')
  })

  it('returns empty arrays when LLM returns invalid JSON', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('not valid json { at all') } as never
    const result = await generateSkeletonNode(baseState, mockLlm)
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })

  it('includes validation errors in prompt when retrying', async () => {
    const stateWithErrors: PreGenStateType = {
      ...baseState,
      validationErrors: ['No node of type "intro" found'],
      retryCount: 1,
    }
    const mockLlm = { invoke: vi.fn().mockResolvedValue(validGraphJSON) } as never
    await generateSkeletonNode(stateWithErrors, mockLlm)
    const prompt = vi.mocked(mockLlm.invoke).mock.calls[0][0] as string
    expect(prompt).toContain('No node of type "intro" found')
  })

  it('returns empty arrays when LLM returns JSON without nodes/edges keys', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('{"foo":"bar"}') } as never
    const result = await generateSkeletonNode(baseState, mockLlm)
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })
})
