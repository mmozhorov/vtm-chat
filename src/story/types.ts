import { Annotation } from '@langchain/langgraph'

export interface LoreEntry {
  id: string
  type: 'character' | 'location' | 'faction'
  name: string
  summary: string
}

export interface StoryNode {
  id: string
  title: string
  description_template: string
  npc_ids: string[]
  location: string
  type: 'intro' | 'scene' | 'climax' | 'ending'
  is_expanded: boolean
}

export interface StoryEdge {
  id: string
  from_node_id: string
  to_node_id: string
  choice_text: string
  condition: string
}

export const PreGenState = Annotation.Root({
  lore: Annotation<LoreEntry[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  nodes: Annotation<StoryNode[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  edges: Annotation<StoryEdge[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  validationErrors: Annotation<string[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  retryCount: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),
})

export type PreGenStateType = typeof PreGenState.State
