import { StateGraph, START, END } from '@langchain/langgraph'
import type { BaseRetriever } from '@langchain/core/retrievers'
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { DriveClient } from '../shared/drive.js'
import { ChatState } from './types.js'
import type { ChatStateType } from './types.js'
import { parseIntentNode } from './nodes/parse_intent.js'
import { ragLookupNode } from './nodes/rag_lookup.js'
import { navigateGraphNode } from './nodes/navigate_graph.js'
import { expandSceneNode } from './nodes/expand_scene.js'
import { generateResponseNode } from './nodes/generate_response.js'
import { saveSessionNode } from './nodes/save_session.js'

export function routeByIntent(state: ChatStateType): 'rag_lookup' | 'navigate_graph' {
  return state.intent === 'lore_question' ? 'rag_lookup' : 'navigate_graph'
}

export function buildChatGraph(
  retriever: BaseRetriever,
  llm: BaseLLM,
  drive: DriveClient,
  folderId: string,
) {
  return new StateGraph(ChatState)
    .addNode('parse_intent', (state) => parseIntentNode(state, llm))
    .addNode('rag_lookup', (state) => ragLookupNode(state, retriever))
    .addNode('navigate_graph', (state) => navigateGraphNode(state))
    .addNode('expand_scene', (state) => expandSceneNode(state, retriever, llm, drive, folderId))
    .addNode('generate_response', (state) => generateResponseNode(state, llm))
    .addNode('save_session', (state) => saveSessionNode(state))
    .addEdge(START, 'parse_intent')
    .addConditionalEdges('parse_intent', routeByIntent, {
      rag_lookup: 'rag_lookup',
      navigate_graph: 'navigate_graph',
    })
    .addEdge('rag_lookup', 'generate_response')
    .addEdge('navigate_graph', 'expand_scene')
    .addEdge('expand_scene', 'generate_response')
    .addEdge('generate_response', 'save_session')
    .addEdge('save_session', END)
    .compile()
}
