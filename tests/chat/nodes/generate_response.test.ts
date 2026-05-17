import { describe, it, expect, vi } from 'vitest'
import type { ChatStateType } from '../../../src/chat/types.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../../../src/story/types.js'

const node: StoryNode = { id: 'n1', title: 'Элизиум', description_template: 'Тёмный клуб.', npc_ids: [], location: 'Чикаго', type: 'scene', is_expanded: true }
const edge: StoryEdge = { id: 'e1', from_node_id: 'n1', to_node_id: 'n2', choice_text: 'Поговорить с Луцием', condition: '' }

function makeState(overrides: Partial<ChatStateType>): ChatStateType {
  return {
    message: '',
    intent: 'explore_scene',
    session: { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] },
    nodes: [node],
    edges: [edge],
    lore: [] as LoreEntry[],
    ragContext: '',
    response: '',
    ...overrides,
  }
}

describe('generateResponseNode', () => {
  it('stores LLM response in state.response', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('Добро пожаловать в Элизиум.') }
    const { generateResponseNode } = await import('../../../src/chat/nodes/generate_response.js')
    const result = await generateResponseNode(makeState({ message: 'Осматриваюсь' }), mockLlm as never)
    expect(result.response).toBe('Добро пожаловать в Элизиум.')
  })

  it('includes ragContext in prompt for lore_question', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('Луций — Принц Чикаго.') }
    const { generateResponseNode } = await import('../../../src/chat/nodes/generate_response.js')
    await generateResponseNode(
      makeState({ intent: 'lore_question', message: 'Кто Луций?', ragContext: 'Луций правит 200 лет.' }),
      mockLlm as never,
    )
    const prompt = mockLlm.invoke.mock.calls[0][0] as string
    expect(prompt).toContain('Луций правит 200 лет.')
  })

  it('includes scene description and choices in prompt for make_choice', async () => {
    const mockLlm = { invoke: vi.fn().mockResolvedValue('Вы подходите к Луцию.') }
    const { generateResponseNode } = await import('../../../src/chat/nodes/generate_response.js')
    await generateResponseNode(
      makeState({ intent: 'make_choice', message: '1' }),
      mockLlm as never,
    )
    const prompt = mockLlm.invoke.mock.calls[0][0] as string
    expect(prompt).toContain('Тёмный клуб.')
    expect(prompt).toContain('Поговорить с Луцием')
  })
})
