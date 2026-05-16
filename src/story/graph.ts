import { StateGraph, START, END } from '@langchain/langgraph'
import type { BaseRetriever } from '@langchain/core/retrievers'
import type { BaseLLM } from '@langchain/core/language_models/llms'
import { PreGenState } from './types.js'
import type { PreGenStateType } from './types.js'
import type { DriveClient } from '../shared/drive.js'
import { extractLoreNode } from './nodes/extract_lore.js'
import { generateSkeletonNode } from './nodes/generate_skeleton.js'
import { validateGraphNode } from './nodes/validate_graph.js'
import { saveToDriveNode } from './nodes/save_to_drive.js'

export function routeAfterValidation(
  state: PreGenStateType,
): 'generate_skeleton' | 'save_to_drive' {
  if (state.validationErrors.length > 0 && state.retryCount < 3) {
    return 'generate_skeleton'
  }
  return 'save_to_drive'
}

export function buildPreGenGraph(
  retriever: BaseRetriever,
  llm: BaseLLM,
  drive: DriveClient,
  folderId: string,
) {
  return new StateGraph(PreGenState)
    .addNode('extract_lore', (state) => extractLoreNode(state, retriever, llm))
    .addNode('generate_skeleton', (state) => generateSkeletonNode(state, llm))
    .addNode('validate_graph', validateGraphNode)
    .addNode('save_to_drive', (state) => saveToDriveNode(state, drive, folderId))
    .addEdge(START, 'extract_lore')
    .addEdge('extract_lore', 'generate_skeleton')
    .addEdge('generate_skeleton', 'validate_graph')
    .addConditionalEdges('validate_graph', routeAfterValidation)
    .addEdge('save_to_drive', END)
    .compile()
}
