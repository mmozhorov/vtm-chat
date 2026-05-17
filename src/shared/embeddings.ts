import { OllamaEmbeddings } from '@langchain/ollama'

export function createEmbeddings() {
  return new OllamaEmbeddings({
    model: 'bge-m3',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  })
}
