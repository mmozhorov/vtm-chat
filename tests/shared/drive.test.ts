import { describe, it, expect, vi } from 'vitest'
import { readJSONFromDrive, writeJSONToDrive } from '../../src/shared/drive.js'
import type { drive_v3 } from 'googleapis'

function makeMockDrive(overrides: Partial<drive_v3.Resource$Files> = {}): { files: drive_v3.Resource$Files } {
  return {
    files: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      ...overrides,
    } as unknown as drive_v3.Resource$Files,
  }
}

describe('readJSONFromDrive', () => {
  it('returns null when file does not exist in folder', async () => {
    const drive = makeMockDrive({
      list: vi.fn().mockResolvedValue({ data: { files: [] } }),
    })
    const result = await readJSONFromDrive(drive as never, 'folder123', 'nodes.json')
    expect(result).toBeNull()
  })

  it('returns parsed JSON when file exists', async () => {
    const content = JSON.stringify({ hello: 'world' })
    const drive = makeMockDrive({
      list: vi.fn().mockResolvedValue({ data: { files: [{ id: 'file123' }] } }),
      get: vi.fn().mockResolvedValue({ data: Buffer.from(content) }),
    })
    const result = await readJSONFromDrive(drive as never, 'folder123', 'nodes.json')
    expect(result).toEqual({ hello: 'world' })
  })
})

describe('writeJSONToDrive', () => {
  it('creates a new file when it does not exist', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ data: {} })
    const drive = makeMockDrive({
      list: vi.fn().mockResolvedValue({ data: { files: [] } }),
      create: mockCreate,
    })
    await writeJSONToDrive(drive as never, 'folder123', 'nodes.json', { test: true })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ name: 'nodes.json', parents: ['folder123'] }),
      })
    )
  })

  it('updates an existing file instead of creating', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ data: {} })
    const drive = makeMockDrive({
      list: vi.fn().mockResolvedValue({ data: { files: [{ id: 'file123' }] } }),
      update: mockUpdate,
    })
    await writeJSONToDrive(drive as never, 'folder123', 'nodes.json', { test: true })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'file123' })
    )
  })
})
