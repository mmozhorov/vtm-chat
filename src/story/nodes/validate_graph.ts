import type { PreGenStateType } from '../types.js'

export function validateGraphNode(state: PreGenStateType): Partial<PreGenStateType> {
  const errors: string[] = []
  const nodeIds = new Set(state.nodes.map(n => n.id))

  for (const edge of state.edges) {
    if (!nodeIds.has(edge.from_node_id)) {
      errors.push(`Edge ${edge.id}: from_node_id '${edge.from_node_id}' does not exist`)
    }
    if (!nodeIds.has(edge.to_node_id)) {
      errors.push(`Edge ${edge.id}: to_node_id '${edge.to_node_id}' does not exist`)
    }
  }

  if (!state.nodes.some(n => n.type === 'intro')) {
    errors.push('No node of type "intro" found')
  }
  if (!state.nodes.some(n => n.type === 'ending')) {
    errors.push('No node of type "ending" found')
  }

  const nodesWithOutgoing = new Set(state.edges.map(e => e.from_node_id))
  for (const node of state.nodes) {
    if (node.type !== 'ending' && !nodesWithOutgoing.has(node.id)) {
      errors.push(`Node '${node.id}' (${node.type}) has no outgoing edges`)
    }
  }

  if (errors.length > 0) {
    console.log(`  Validation failed (${errors.length} errors, retry ${state.retryCount + 1}/3)`)
  } else {
    console.log('  Graph valid')
  }

  return {
    validationErrors: errors,
    retryCount: errors.length > 0 ? state.retryCount + 1 : state.retryCount,
  }
}
