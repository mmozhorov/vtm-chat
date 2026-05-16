import type { BaseLLM } from '@langchain/core/language_models/llms'
import type { Document } from '@langchain/core/documents'

export type ChunkType = 'lore' | 'character' | 'location' | 'faction'

export interface ChunkMeta {
  chunk_type: ChunkType
  entity_name: string
}

const VALID_TYPES: ChunkType[] = ['lore', 'character', 'location', 'faction']

function buildPrompt(text: string): string {
  return `Classify this text from a Vampire: The Masquerade sourcebook.
Respond ONLY with a single line of JSON. No explanation.
{"chunk_type": "lore"|"character"|"location"|"faction", "entity_name": "name or empty string"}

Text:
${text.slice(0, 400)}

JSON:`
}

export async function classifyChunk(
  llm: BaseLLM,
  content: string
): Promise<ChunkMeta> {
  try {
    const response = String(await llm.invoke(buildPrompt(content)))
    const match = response.match(/\{[^}]+\}/)
    if (!match) return { chunk_type: 'lore', entity_name: '' }
    const parsed = JSON.parse(match[0])
    return {
      chunk_type: VALID_TYPES.includes(parsed.chunk_type)
        ? (parsed.chunk_type as ChunkType)
        : 'lore',
      entity_name: String(parsed.entity_name ?? ''),
    }
  } catch {
    return { chunk_type: 'lore', entity_name: '' }
  }
}

export async function classifyBatch(
  llm: BaseLLM,
  chunks: Document[],
  batchSize = 10
): Promise<Document[]> {
  const results: Document[] = []
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const classified = await Promise.all(
      batch.map(async chunk => {
        const meta = await classifyChunk(llm, chunk.pageContent)
        return { ...chunk, metadata: { ...chunk.metadata, ...meta } }
      })
    )
    results.push(...classified)
    process.stdout.write(
      `  Classified ${Math.min(i + batchSize, chunks.length)}/${chunks.length} chunks\r`
    )
  }
  process.stdout.write('\n')
  return results
}
