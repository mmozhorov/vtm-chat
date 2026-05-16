import type { BaseRetriever } from '@langchain/core/retrievers'
import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { LoreEntry, PreGenStateType } from '../types.js'

const RAG_QUERIES = [
  'главные NPC персонажи вампиры Чикаго',
  'ключевые локации места Чикаго',
  'фракции кланы конфликты вампиры',
]

function buildLorePrompt(text: string): string {
  return `Extract named entities (characters, locations, factions) from this Vampire: The Masquerade text.
Return ONLY a JSON array (no explanation, no markdown):
[{"type": "character"|"location"|"faction", "name": "...", "summary": "1-2 sentences"}]
Only include entities clearly named in the text.

Text:
${text.slice(0, 3000)}

JSON:`
}

export async function extractLoreNode(
  _state: PreGenStateType,
  retriever: BaseRetriever,
  llm: BaseLLM,
): Promise<Partial<PreGenStateType>> {
  const docArrays = await Promise.all(RAG_QUERIES.map(q => retriever.invoke(q as never)))

  const seen = new Set<string>()
  const uniqueDocs = docArrays.flat().filter(doc => {
    if (seen.has(doc.pageContent)) return false
    seen.add(doc.pageContent)
    return true
  })

  const combinedText = uniqueDocs.map(d => d.pageContent).join('\n\n')

  try {
    const response = String(await llm.invoke(buildLorePrompt(combinedText) as never))
    const match = response.match(/\[[\s\S]*\]/)
    if (!match) return { lore: [] }

    const raw: Array<{ type: string; name: string; summary: string }> = JSON.parse(match[0])
    const VALID_TYPES = ['character', 'location', 'faction']
    const lore: LoreEntry[] = raw
      .filter(e => VALID_TYPES.includes(e.type))
      .map((e, i) => ({
        id: `lore_${i}`,
        type: e.type as LoreEntry['type'],
        name: String(e.name),
        summary: String(e.summary),
      }))

    console.log(`  Extracted ${lore.length} lore entries`)
    return { lore }
  } catch {
    return { lore: [] }
  }
}
