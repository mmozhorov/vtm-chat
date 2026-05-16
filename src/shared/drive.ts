import { google } from 'googleapis'
import type { drive_v3 } from 'googleapis'
import fs from 'fs'

export interface DriveClient {
  readJSON: <T>(folderId: string, fileName: string) => Promise<T | null>
  writeJSON: (folderId: string, fileName: string, data: unknown) => Promise<void>
}

export async function readJSONFromDrive<T>(
  drive: { files: drive_v3.Resource$Files },
  folderId: string,
  fileName: string,
): Promise<T | null> {
  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  const file = res.data.files?.[0]
  if (!file?.id) return null

  const content = await drive.files.get(
    { fileId: file.id, alt: 'media' },
    { responseType: 'arraybuffer' },
  )
  const buf = content.data instanceof ArrayBuffer
    ? Buffer.from(content.data)
    : (content.data as Buffer)
  return JSON.parse(buf.toString('utf-8')) as T
}

export async function writeJSONToDrive(
  drive: { files: drive_v3.Resource$Files },
  folderId: string,
  fileName: string,
  data: unknown,
): Promise<void> {
  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  const file = res.data.files?.[0]
  const body = JSON.stringify(data, null, 2)

  if (file?.id) {
    await drive.files.update({
      fileId: file.id,
      media: { mimeType: 'application/json', body },
    })
  } else {
    await drive.files.create({
      requestBody: { name: fileName, parents: [folderId], mimeType: 'application/json' },
      media: { mimeType: 'application/json', body },
    })
  }
}

export async function createDriveClient(): Promise<DriveClient> {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH ?? './data/google-credentials.json'
  const tokenPath = process.env.GOOGLE_TOKEN_PATH ?? './data/google-token.json'

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'))
  const { client_id, client_secret } = credentials.installed
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, 'urn:ietf:wg:oauth:2.0:oob')

  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'))
  oauth2Client.setCredentials(token)

  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  return {
    readJSON: (folderId, fileName) => readJSONFromDrive(drive, folderId, fileName),
    writeJSON: (folderId, fileName, data) => writeJSONToDrive(drive, folderId, fileName, data),
  }
}
