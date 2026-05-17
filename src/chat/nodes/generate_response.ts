import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { ChatStateType } from '../types.js'

const SYSTEM_PROMPT = `Ты — рассказчик в мире Vampire: the Masquerade.
Сеттинг: Чикаго, 1990-е. Ночной город, политика кланов, Маскарад.
Стиль: мрачный готический нуар, атмосфера опасности и интриг.
ЯЗЫК ОТВЕТА: ТОЛЬКО РУССКИЙ. Никогда не используй другие языки, даже если получаешь цифры или короткие сообщения.
Строго придерживайся лора и сеттинга. Не выдумывай локации — используй только те, что описаны в сцене.
ВАЖНО: никогда не придумывай варианты выбора сам — они будут указаны явно.`

const MAX_HISTORY = 6

function formatHistory(history: { role: 'user' | 'assistant'; content: string }[]): string {
  const recent = history.slice(-MAX_HISTORY)
  if (recent.length === 0) return ''
  return (
    '\n\nИстория диалога:\n' +
    recent.map(h => `${h.role === 'user' ? 'Игрок' : 'Рассказчик'}: ${h.content}`).join('\n')
  )
}

export async function generateResponseNode(
  state: ChatStateType,
  llm: BaseLLM,
): Promise<Partial<ChatStateType>> {
  const currentNode = state.nodes.find(n => n.id === state.session.current_node_id)
  const currentEdges = state.edges.filter(e => e.from_node_id === state.session.current_node_id)
  const history = formatHistory(state.session.history)

  const choicesText =
    currentEdges.length > 0
      ? '\n\nВарианты (выведи дословно нумерованным списком в конце):\n' +
        currentEdges.map((e, i) => `${i + 1}. ${e.choice_text}`).join('\n')
      : '\n\n(Вариантов выбора нет — сцена развивается свободно.)'

  let content: string

  if (state.intent === 'lore_question') {
    content = `${SYSTEM_PROMPT}${history}\n\nВопрос игрока: ${state.message}\n\nИнформация из лора:\n${state.ragContext}\n\nОтветь кратко, в стиле рассказчика.`
  } else if (state.intent === 'make_choice') {
    const visited = state.session.visited_nodes
    const prevNodeId = visited.length >= 2 ? visited[visited.length - 2] : null
    const prevNode = prevNodeId ? state.nodes.find(n => n.id === prevNodeId) : null
    const chosenEdge = prevNodeId
      ? state.edges.find(e => e.from_node_id === prevNodeId && e.to_node_id === state.session.current_node_id)
      : null

    if (chosenEdge && prevNode) {
      const prevDesc = prevNode.description_template ?? ''
      const newDesc = currentNode?.description_template ?? 'Незнакомое место.'
      content = `${SYSTEM_PROMPT}${history}

Игрок выбрал: "${chosenEdge.choice_text}"

Предыдущая сцена: ${prevDesc}

Новая сцена: ${newDesc}

Опиши путь от предыдущей сцены к новой — что происходит по дороге, детали, ощущения. Не пропускай переход. Затем опиши новую сцену.${choicesText}`
    } else {
      const sceneDesc = currentNode?.description_template ?? 'Вы в незнакомом месте.'
      content = `${SYSTEM_PROMPT}${history}\n\nТекущая сцена: ${sceneDesc}\n\nИгрок: ${state.message}${choicesText}`
    }
  } else {
    const sceneDesc = currentNode?.description_template ?? 'Вы в незнакомом месте.'
    content = `${SYSTEM_PROMPT}${history}\n\nТекущая сцена: ${sceneDesc}\n\nИгрок: ${state.message}${choicesText}`
  }

  const response = String(await llm.invoke(content as never))
  return { response }
}
