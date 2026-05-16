import { describe, it, expect } from 'vitest'
import { loadPDF } from '../../src/ingestion/loader.js'
import path from 'path'

const PDF_PATH = path.resolve('./Chicago_by_Night_(2nd_Edition)_ru.pdf')

describe('loadPDF', () => {
  it('returns at least one page', async () => {
    const docs = await loadPDF(PDF_PATH)
    expect(docs.length).toBeGreaterThan(0)
  })

  it('each page has non-empty pageContent', async () => {
    const docs = await loadPDF(PDF_PATH)
    const nonEmpty = docs.filter(d => d.pageContent.trim().length > 0)
    expect(nonEmpty.length).toBeGreaterThan(0)
  })

  it('metadata includes source path', async () => {
    const docs = await loadPDF(PDF_PATH)
    expect(docs[0].metadata.source).toBe(PDF_PATH)
  })
})
