import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { Document } from '@langchain/core/documents'

export async function chunkDocuments(docs: Document[]): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  })

  const chunks = await splitter.splitDocuments(docs)

  return chunks.map((chunk, i) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      chunk_id: `chunk_${i}`,
      source_page: chunk.metadata.loc?.pageNumber ?? 0,
      chunk_type: 'lore' as const,
      entity_name: '',
    },
  }))
}
