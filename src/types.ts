import { BrowserManager, Page } from 'browser-manager'
import { ProxyItem, RewriteMode } from 'dprx-types'

export type TRewriterInstance = {
  id: string
  type: 'WTN'
  browser: BrowserManager
  page: Page
  idle: boolean
  usedCount: number
  maxPerUse: number
  proxyItem?: ProxyItem
}

export enum RewriterInstanceType {
  Wtn = 'WTN',
  Quill = 'QUILLBOT'
}

export type TRewriterInstanceOpts = {
  type: RewriterInstanceType
  maxInstance: number
  maxPerUse: number
  liveMinutes?: number
  headless?: boolean
}

export type TRewriterSettings = {
  token?: string
  instanceOpts?: TRewriterInstanceOpts[]
}

export type TRewriteResult = {
  text: string
  suggestions?: any[]
}

export type TProxyOpts = {
  prior?: 'dynamic'
}

export type TSuggestionsOpts = {
  text: string
  mode?: RewriteMode
  draftId?: string
  tryLimit?: number
  tryIndex?: number
}
