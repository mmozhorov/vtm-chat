import { Annotation } from '@langchain/langgraph'
import type { StoryNode, StoryEdge, LoreEntry } from '../story/types.js'

export interface Session {
  id: string
  player_name: string
  current_node_id: string
  visited_nodes: string[]
  history: { role: 'user' | 'assistant'; content: string }[]
}

export type Intent = 'lore_question' | 'make_choice' | 'explore_scene'

export const ChatState = Annotation.Root({
  message: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  intent: Annotation<Intent | null>({ reducer: (_, b) => b, default: () => null }),
  session: Annotation<Session>({
    reducer: (_, b) => b,
    default: () => ({ id: '', player_name: '', current_node_id: '', visited_nodes: [], history: [] }),
  }),
  nodes: Annotation<StoryNode[]>({ reducer: (_, b) => b, default: () => [] }),
  edges: Annotation<StoryEdge[]>({ reducer: (_, b) => b, default: () => [] }),
  lore: Annotation<LoreEntry[]>({ reducer: (_, b) => b, default: () => [] }),
  ragContext: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  response: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
})

export type ChatStateType = typeof ChatState.State
