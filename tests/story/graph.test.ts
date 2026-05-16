import { describe, it, expect } from 'vitest'
import { routeAfterValidation } from '../../src/story/graph.js'
import type { PreGenStateType } from '../../src/story/types.js'

function makeState(validationErrors: string[], retryCount: number): PreGenStateType {
  return { lore: [], nodes: [], edges: [], validationErrors, retryCount }
}

describe('routeAfterValidation', () => {
  it('routes to generate_skeleton when errors exist and retryCount < 3', () => {
    expect(routeAfterValidation(makeState(['error'], 0))).toBe('generate_skeleton')
    expect(routeAfterValidation(makeState(['error'], 1))).toBe('generate_skeleton')
    expect(routeAfterValidation(makeState(['error'], 2))).toBe('generate_skeleton')
  })

  it('routes to save_to_drive when retryCount reaches 3 (exhausted)', () => {
    expect(routeAfterValidation(makeState(['error'], 3))).toBe('save_to_drive')
  })

  it('routes to save_to_drive when graph is valid (no errors)', () => {
    expect(routeAfterValidation(makeState([], 0))).toBe('save_to_drive')
    expect(routeAfterValidation(makeState([], 2))).toBe('save_to_drive')
  })
})
