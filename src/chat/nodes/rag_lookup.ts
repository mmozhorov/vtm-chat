import type { BaseRetriever } from '@langchain/core/retrievers'
import type { ChatStateType } from '../types.js'

export async function ragLookupNode(
  state: ChatStateType,
  retriever: BaseRetriever,
): Promise<Partial<ChatStateType>> {
  const docs = await retriever.invoke(state.message as never)
  const ragContext = (docs as Array<{ pageContent: string }>)
    .map(d => d.pageContent)
    .join('\n\n---\n\n')
  return { ragContext }
}
