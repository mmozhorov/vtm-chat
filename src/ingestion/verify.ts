import { createRetriever } from '../shared/retriever.js'

console.log('=== VtM Chat — Retrieval Verification ===\n')

const queries = [
  'клан Тремер Чикаго',
  'Принц города вампиры',
  'Носферату сборщики информации',
]

const retriever = await createRetriever(3)

for (const query of queries) {
  console.log(`Query: "${query}"`)
  const results = await retriever.invoke(query)
  results.forEach((doc, i) => {
    const type = doc.metadata.chunk_type
    const name = doc.metadata.entity_name || '—'
    const page = doc.metadata.source_page
    console.log(`  [${i + 1}] ${type}:${name} (стр. ${page})`)
    console.log(`       ${doc.pageContent.slice(0, 120).replace(/\n/g, ' ')}...`)
  })
  console.log()
}
