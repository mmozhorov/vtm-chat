import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { StoryNode, StoryEdge, PreGenStateType } from '../types.js'

function buildSkeletonPrompt(state: PreGenStateType): string {
  const loreContext = state.lore
    .map(e => `${e.type}: ${e.name} — ${e.summary}`)
    .join('\n')

  const retryContext =
    state.validationErrors.length > 0
      ? `\nPrevious attempt failed validation. Fix these issues:\n${state.validationErrors.join('\n')}\n`
      : ''

  return `You are creating a story graph for a Vampire: The Masquerade game set in Chicago.

AVAILABLE LORE:
${loreContext}
${retryContext}
Generate a story with 3 separate arcs. Each arc: 4-5 scenes (type "scene"), 1 climax (type "climax"), 1 ending (type "ending").
Plus exactly 1 intro node (type "intro") shared across arcs. Total: 15-20 nodes.

Return ONLY valid JSON — no explanation, no markdown backticks:
{
  "nodes": [
    {"id":"n1","title":"...","description_template":"Scene description with {{details}} placeholder","npc_ids":[],"location":"...","type":"intro","is_expanded":false}
  ],
  "edges": [
    {"id":"e1","from_node_id":"n1","to_node_id":"n2","choice_text":"Player choice text","condition":""}
  ]
}

Rules:
- Exactly 1 node with type "intro"
- Each non-ending node must have 2-3 outgoing edges
- All from_node_id and to_node_id must be ids of existing nodes
- description_template must contain the placeholder {{details}}

JSON:`
}

export async function generateSkeletonNode(
  state: PreGenStateType,
  llm: BaseLLM,
): Promise<Partial<PreGenStateType>> {
  try {
    const response = String(await llm.invoke(buildSkeletonPrompt(state) as never))
    const match = response.match(/\{[\s\S]*\}/)
    if (!match) return { nodes: [], edges: [] }

    const parsed = JSON.parse(match[0])
    const nodes: StoryNode[] = Array.isArray(parsed.nodes) ? parsed.nodes : []
    const edges: StoryEdge[] = Array.isArray(parsed.edges) ? parsed.edges : []

    console.log(`  Generated ${nodes.length} nodes, ${edges.length} edges`)
    return { nodes, edges }
  } catch {
    return { nodes: [], edges: [] }
  }
}
