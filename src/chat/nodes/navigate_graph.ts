import type { ChatStateType } from '../types.js'

export function navigateGraphNode(state: ChatStateType): Partial<ChatStateType> {
  if (state.intent !== 'make_choice') return {}

  const match = state.message.match(/\b([1-9])\b/)
  if (!match) return {}
  const choiceIndex = parseInt(match[1]) - 1

  const currentEdges = state.edges.filter(e => e.from_node_id === state.session.current_node_id)
  const chosenEdge = currentEdges[choiceIndex]
  if (!chosenEdge) return {}

  return {
    session: {
      ...state.session,
      current_node_id: chosenEdge.to_node_id,
      visited_nodes: [...state.session.visited_nodes, chosenEdge.to_node_id],
    },
  }
}
