import { describe, it, expect } from 'vitest'
import { validateGraphNode } from '../../../src/story/nodes/validate_graph.js'
import type { PreGenStateType, StoryNode, StoryEdge } from '../../../src/story/types.js'

const intro: StoryNode = { id: 'n1', title: 'Intro', description_template: '{{details}}', npc_ids: [], location: 'Chicago', type: 'intro', is_expanded: false }
const scene: StoryNode = { id: 'n2', title: 'Scene', description_template: '{{details}}', npc_ids: [], location: 'Chicago', type: 'scene', is_expanded: false }
const ending: StoryNode = { id: 'n3', title: 'End', description_template: '{{details}}', npc_ids: [], location: 'Chicago', type: 'ending', is_expanded: false }
const e12: StoryEdge = { id: 'e1', from_node_id: 'n1', to_node_id: 'n2', choice_text: 'Go', condition: '' }
const e23: StoryEdge = { id: 'e2', from_node_id: 'n2', to_node_id: 'n3', choice_text: 'End', condition: '' }

function state(nodes: StoryNode[], edges: StoryEdge[], retryCount = 0): PreGenStateType {
  return { lore: [], nodes, edges, validationErrors: [], retryCount }
}

describe('validateGraphNode', () => {
  it('returns no errors for a valid graph', () => {
    const result = validateGraphNode(state([intro, scene, ending], [e12, e23]))
    expect(result.validationErrors).toEqual([])
    expect(result.retryCount).toBe(0)
  })

  it('reports missing intro node', () => {
    const result = validateGraphNode(state([scene, ending], [e23]))
    expect(result.validationErrors).toContain('No node of type "intro" found')
  })

  it('reports missing ending node', () => {
    const result = validateGraphNode(state([intro, scene], [e12]))
    expect(result.validationErrors).toContain('No node of type "ending" found')
  })

  it('reports edge referencing non-existent to_node_id', () => {
    const badEdge: StoryEdge = { id: 'e1', from_node_id: 'n1', to_node_id: 'n999', choice_text: 'Go', condition: '' }
    const result = validateGraphNode(state([intro, ending], [badEdge]))
    expect(result.validationErrors!.some(e => e.includes('n999'))).toBe(true)
  })

  it('reports isolated non-ending node with no outgoing edges', () => {
    const result = validateGraphNode(state([intro, scene, ending], [e23]))
    expect(result.validationErrors!.some(e => e.includes('n1'))).toBe(true)
  })

  it('increments retryCount when there are validation errors', () => {
    const result = validateGraphNode(state([scene, ending], [e23], 1))
    expect(result.retryCount).toBe(2)
  })

  it('does not increment retryCount when graph is valid', () => {
    const result = validateGraphNode(state([intro, scene, ending], [e12, e23], 2))
    expect(result.retryCount).toBe(2)
  })
})
