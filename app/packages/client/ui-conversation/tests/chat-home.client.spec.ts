import { describe, expect, it } from 'vitest'
import { isChatHomePath } from '../src/client/chat-home.ts'

describe('isChatHomePath', () => {
  it('matches legacy and user-scoped chat directories on posix and windows paths', () => {
    expect(isChatHomePath('/Users/me/.dsh/chat')).toBe(true)
    expect(isChatHomePath('C:\\Users\\me\\.dsh\\chat')).toBe(true)
    expect(isChatHomePath('/Users/me/.dsh/users/rhyszhao/chat')).toBe(true)
    expect(isChatHomePath('C:\\Users\\me\\.dsh\\users\\rhys_zhao-2\\chat')).toBe(true)
    expect(isChatHomePath('/Users/me/.dsh/users/Rhys/chat')).toBe(false)
    expect(isChatHomePath('/Users/me/.dsh/users/2rhys/chat')).toBe(false)
    expect(isChatHomePath('/Users/me/.dsh/users/rhys/chat/project')).toBe(false)
    expect(isChatHomePath('/Users/me/project')).toBe(false)
  })
})
