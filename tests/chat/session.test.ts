import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'

vi.mock('fs')

describe('session', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('readSession returns null when file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { readSession } = await import('../../src/chat/session.js')
    expect(readSession()).toBeNull()
  })

  it('readSession returns parsed session when file exists', async () => {
    const session = { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] }
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(session) as never)
    const { readSession } = await import('../../src/chat/session.js')
    expect(readSession()).toEqual(session)
  })

  it('writeSession serializes session to file', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as never)
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined)
    const { writeSession } = await import('../../src/chat/session.js')
    const session = { id: 's1', player_name: 'Игрок', current_node_id: 'n1', visited_nodes: ['n1'], history: [] }
    writeSession(session)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('session.json'),
      expect.stringContaining('"id": "s1"'),
    )
  })

  it('createSession initializes session with player and intro node', async () => {
    const { createSession } = await import('../../src/chat/session.js')
    const session = createSession('Луций', 'n_intro')
    expect(session.player_name).toBe('Луций')
    expect(session.current_node_id).toBe('n_intro')
    expect(session.visited_nodes).toEqual(['n_intro'])
    expect(session.history).toEqual([])
    expect(session.id).toBeTruthy()
  })
})
