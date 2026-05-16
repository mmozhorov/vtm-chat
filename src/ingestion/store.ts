import { LanceDB } from '@langchain/community/vectorstores/lancedb'
import * as lancedb from '@lancedb/lancedb'
import type { Embeddings } from '@langchain/core/embeddings'
import type { Document } from '@langchain/core/documents'

const TABLE_NAME = 'chunks'

export async function storeChunks(
  chunks: Document[],
  embeddings: Embeddings,
  dbPath: string
): Promise<void> {
  const db = await lancedb.connect(dbPath)
  const tableNames = await db.tableNames()

  if (tableNames.includes(TABLE_NAME)) {
    console.log(`Table '${TABLE_NAME}' already exists — skipping ingestion.`)
    console.log('To re-ingest, delete ./data/lancedb and run again.')
    return
  }

  console.log(`Storing ${chunks.length} chunks into LanceDB...`)
  await LanceDB.fromDocuments(chunks, embeddings, {
    uri: dbPath,
    tableName: TABLE_NAME,
  })
  console.log('Stored successfully.')
}
