import type { DriveClient } from '../shared/drive.js'
import type { StoryNode, StoryEdge, LoreEntry } from '../story/types.js'

export interface GraphCache {
  nodes: StoryNode[]
  edges: StoryEdge[]
  lore: LoreEntry[]
}

export async function loadGraphCache(
  drive: DriveClient,
  folderId: string,
): Promise<GraphCache> {
  const [nodes, edges, lore] = await Promise.all([
    drive.readJSON<StoryNode[]>(folderId, 'nodes.json'),
    drive.readJSON<StoryEdge[]>(folderId, 'edges.json'),
    drive.readJSON<LoreEntry[]>(folderId, 'lore.json'),
  ])
  return {
    nodes: nodes ?? [],
    edges: edges ?? [],
    lore: lore ?? [],
  }
}
