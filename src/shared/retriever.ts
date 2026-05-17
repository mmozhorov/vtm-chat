import { LanceDB } from '@langchain/community/vectorstores/lancedb'
import * as lancedb from '@lancedb/lancedb'
import { createEmbeddings } from './embeddings.js'

const TABLE_NAME = 'chunks'

export async function createRetriever(k = 3, dbPath?: string) {
  const resolvedPath = dbPath ?? process.env.LANCEDB_PATH ?? './data/lancedb'
  const db = await lancedb.connect(resolvedPath)
  const table = await db.openTable(TABLE_NAME)
  const embeddings = createEmbeddings()
  const vectorStore = new LanceDB(embeddings, { table })
  return vectorStore.asRetriever({ k })
}
