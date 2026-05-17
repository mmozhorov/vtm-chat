import fs from 'fs'
import { randomUUID } from 'crypto'
import type { Session } from './types.js'

const SESSION_PATH = process.env.SESSION_PATH ?? './data/session.json'

export function readSession(): Session | null {
  if (!fs.existsSync(SESSION_PATH)) return null
  return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf-8')) as Session
}

export function writeSession(session: Session): void {
  fs.mkdirSync('./data', { recursive: true })
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2))
}

export function createSession(playerName: string, introNodeId: string): Session {
  return {
    id: randomUUID(),
    player_name: playerName,
    current_node_id: introNodeId,
    visited_nodes: [introNodeId],
    history: [],
  }
}
