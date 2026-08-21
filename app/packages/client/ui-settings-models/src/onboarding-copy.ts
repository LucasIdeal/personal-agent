/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-08-19.qq-1'

/** The complete editable internal-testing notice in both supported GUI locales. */
export const WELCOME_NOTICE_COPY = {
  zh: {
    title: '欢迎使用智能助理',
    body: '这是面向部门答辩的个人 AI 助理。你可以直接对话：记笔记、跟进待办、查询资料；需要读写文件或运行命令时，再绑定一个项目目录即可。\n\n界面用企鹅标识方便现场演示。开始前请先配置可用的模型，随后即可进入对话。',
    continueLabel: '开始使用',
  },
  en: {
    title: 'Welcome to Assistant',
    body: 'This is a personal AI assistant for the department review. Chat to take notes, follow up on tasks, and look things up — or bind a project folder when you need to edit files and run commands.\n\nThe UI uses the penguin mark for the live demo. Configure a model first, then start chatting.',
    continueLabel: 'Get started',
  },
} as const
