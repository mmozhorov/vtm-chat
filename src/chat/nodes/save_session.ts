import type { ChatStateType, Session } from '../types.js'
import { writeSession } from '../session.js'

export function saveSessionNode(state: ChatStateType): Partial<ChatStateType> {
  const updatedSession: Session = {
    ...state.session,
    history: [
      ...state.session.history,
      { role: 'user', content: state.message },
      { role: 'assistant', content: state.response },
    ],
  }
  writeSession(updatedSession)
  return { session: updatedSession }
}
