import type { BaseRetriever } from '@langchain/core/retrievers'
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { DriveClient } from '../../shared/drive.js'
import type { ChatStateType } from '../types.js'
import type { StoryNode } from '../../story/types.js'

function buildExpandPrompt(node: StoryNode, context: string): string {
  return `Ты заполняешь шаблон сцены для игры Vampire: The Masquerade.

Контекст из книги:
${context}

Шаблон сцены: ${node.description_template}

Заполни шаблон: замени {{details}} конкретными деталями (3-5 предложений). Стиль: мрачный готический нуар. Язык: русский.
Верни ТОЛЬКО заполненный текст без объяснений.`
}

export async function expandSceneNode(
  state: ChatStateType,
  retriever: BaseRetriever,
  llm: BaseLLM,
  drive: DriveClient,
  folderId: string,
): Promise<Partial<ChatStateType>> {
  const currentNode = state.nodes.find(n => n.id === state.session.current_node_id)
  if (!currentNode || currentNode.is_expanded) return {}

  const docs = await retriever.invoke((currentNode.title + ' ' + currentNode.location) as never)
  const context = (docs as Array<{ pageContent: string }>).map(d => d.pageContent).join('\n\n')

  const expanded = String(await llm.invoke(buildExpandPrompt(currentNode, context) as never))
  const updatedNode: StoryNode = { ...currentNode, description_template: expanded, is_expanded: true }
  const updatedNodes = state.nodes.map(n => n.id === currentNode.id ? updatedNode : n)

  await drive.writeJSON(folderId, 'nodes.json', updatedNodes)
  return { nodes: updatedNodes }
}
