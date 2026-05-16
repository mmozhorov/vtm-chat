import { google } from 'googleapis'
import fs from 'fs'
import { createInterface } from 'readline/promises'

const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH ?? './data/google-credentials.json'
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH ?? './data/google-token.json'
const SCOPES = ['https://www.googleapis.com/auth/drive.file']

async function main() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'))
  const { client_id, client_secret } = credentials.installed

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'urn:ietf:wg:oauth:2.0:oob',
  )

  const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES })

  console.log('=== Google Drive OAuth2 Setup ===\n')
  console.log('1. Open this URL in your browser:\n')
  console.log(authUrl + '\n')
  console.log('2. Sign in with your Google account and grant Drive access.')
  console.log('3. Copy the authorization code shown on screen.\n')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const code = await rl.question('Enter the authorization code: ')
  rl.close()

  const { tokens } = await oauth2Client.getToken(code.trim())
  fs.mkdirSync('./data', { recursive: true })
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
  console.log('\n✓ Token saved to', TOKEN_PATH)
  console.log('You can now run `npm run pregen`.')
}

main().catch(err => {
  console.error('✗ Auth failed:', err.message)
  process.exit(1)
})
