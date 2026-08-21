import { describe, expect, it } from 'vitest'
import { isChatHomePath } from '../src/client/chat-home.ts'

describe('isChatHomePath', () => {
  it('matches the built-in chat directory on posix and windows paths', () => {
    expect(isChatHomePath('/Users/me/.dsh/chat')).toBe(true)
    expect(isChatHomePath('C:\\Users\\me\\.dsh\\chat')).toBe(true)
    expect(isChatHomePath('/Users/me/project')).toBe(false)
  })
})
