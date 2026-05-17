import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { ChatStateType } from '../types.js'

const SYSTEM_PROMPT = 'Ты — рассказчик в мире Vampire: the Masquerade. Стиль: мрачный готический нуар, атмосфера опасности и интриг. Язык: русский. Не выходи за рамки лора книги. В конце сцены с выборами — предложи варианты нумерованным списком.'

export async function generateResponseNode(
  state: ChatStateType,
  llm: BaseLLM,
): Promise<Partial<ChatStateType>> {
  const currentNode = state.nodes.find(n => n.id === state.session.current_node_id)
  const currentEdges = state.edges.filter(e => e.from_node_id === state.session.current_node_id)

  let content: string
  if (state.intent === 'lore_question') {
    content = `${SYSTEM_PROMPT}\n\nВопрос игрока: ${state.message}\n\nИнформация из лора:\n${state.ragContext}\n\nОтветь кратко, в стиле рассказчика.`
  } else {
    const sceneDesc = currentNode?.description_template ?? 'Вы в незнакомом месте.'
    const choicesText =
      currentEdges.length > 0
        ? '\n\nДоступные варианты:\n' + currentEdges.map((e, i) => `${i + 1}. ${e.choice_text}`).join('\n')
        : ''
    content = `${SYSTEM_PROMPT}\n\nТекущая сцена: ${sceneDesc}\n\nИгрок: ${state.message}${choicesText}`
  }

  const response = String(await llm.invoke(content as never))
  return { response }
}
