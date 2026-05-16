import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import type { Document } from '@langchain/core/documents'

export async function loadPDF(pdfPath: string): Promise<Document[]> {
  const loader = new PDFLoader(pdfPath, { splitPages: true })
  return loader.load()
}
