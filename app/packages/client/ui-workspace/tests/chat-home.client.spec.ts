import { describe, expect, it } from 'vitest'
import { isChatHomePath } from '../src/client/chat-home.ts'

describe('isChatHomePath', () => {
  it('matches legacy and valid user-scoped chat directories', () => {
    expect(isChatHomePath('/home/me/.dsh/chat')).toBe(true)
    expect(isChatHomePath('C:\\Users\\me\\.dsh\\users\\rhyszhao\\chat')).toBe(true)
    expect(isChatHomePath('/home/me/.dsh/users/rhys_zhao-2/chat')).toBe(true)
    expect(isChatHomePath('/home/me/.dsh/users/Rhys/chat')).toBe(false)
    expect(isChatHomePath('/home/me/.dsh/users/rhys!/chat')).toBe(false)
    expect(isChatHomePath('/home/me/.dsh/users/rhys/chat/project')).toBe(false)
    expect(isChatHomePath('/home/me/project')).toBe(false)
  })
})
