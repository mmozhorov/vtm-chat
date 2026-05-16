import type { DriveClient } from '../../shared/drive.js'
import type { PreGenStateType } from '../types.js'

export async function saveToDriveNode(
  state: PreGenStateType,
  drive: DriveClient,
  folderId: string,
): Promise<Partial<PreGenStateType>> {
  console.log('  Saving to Google Drive...')

  await Promise.all([
    drive.writeJSON(folderId, 'lore.json', state.lore),
    drive.writeJSON(folderId, 'nodes.json', state.nodes),
    drive.writeJSON(folderId, 'edges.json', state.edges),
  ])

  console.log('  Saved lore.json, nodes.json, edges.json')
  return {}
}
