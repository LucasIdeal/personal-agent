/** Legacy or user-scoped built-in chat-home path under `$DSH_HOME`. */
const CHAT_HOME_PATTERN = /(?:^|\/)\.dsh\/(?:chat|users\/[a-z][a-z0-9._-]{0,63}\/chat)$/

/**
 * Whether a workspace (or session cwd) is the built-in chat home rather than
 * a user-picked project directory.
 * @param path - workspace path or session cwd.
 */
export function isChatHomePath(path: string): boolean {
  return CHAT_HOME_PATTERN.test(path.replace(/\\/g, '/'))
}
