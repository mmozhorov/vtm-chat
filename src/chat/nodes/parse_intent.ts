import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { ChatStateType, Intent } from '../types.js'

function buildIntentPrompt(message: string): string {
  return `Classify this player input in a Vampire: The Masquerade game.
Answer with ONLY one word: "lore_question", "make_choice", or "explore_scene".

- lore_question: player asks about the world, NPCs, factions, or history
- make_choice: player selects a numbered option (e.g. "1", "2", "выбираю 2", "первый")
- explore_scene: player performs a free action or says something in-character

Player input: "${message}"

Classification:`
}

export async function parseIntentNode(
  state: ChatStateType,
  llm: BaseLLM,
): Promise<Partial<ChatStateType>> {
  const response = String(await llm.invoke(buildIntentPrompt(state.message) as never)).toLowerCase().trim()
  let intent: Intent = 'explore_scene'
  if (response.includes('lore_question')) intent = 'lore_question'
  else if (response.includes('make_choice')) intent = 'make_choice'
  return { intent }
}
