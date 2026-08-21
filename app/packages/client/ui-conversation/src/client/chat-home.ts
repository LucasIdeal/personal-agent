/** Path suffix of the built-in chat-home directory under `$DSH_HOME`. */
const CHAT_HOME_SUFFIX = '/.dsh/chat'

/**
 * Whether a workspace (or session cwd) is the built-in chat home rather than
 * a user-picked project directory. Host still requires a cwd; chat-home
 * registers `$DSH_HOME/chat` so pure-chat sessions have somewhere to live.
 * @param path - workspace path or session cwd.
 */
export function isChatHomePath(path: string): boolean {
  return path.replace(/\\/g, '/').endsWith(CHAT_HOME_SUFFIX)
}
