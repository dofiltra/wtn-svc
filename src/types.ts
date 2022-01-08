import { BrowserManager, Page } from 'browser-manager'
import { ProxyItem, RewriteMode } from 'dprx-types'

export type TBrowserInstance = {
  id: string
  type: 'WTN'
  browser: BrowserManager
  page: Page
  idle: boolean
  usedCount: number
  maxPerUse: number
  proxyItem?: ProxyItem
}

export type TInstanceOpts = {
  type: 'WTN'
  maxInstance: number
  maxPerUse: number
  liveMinutes?: number
  headless?: boolean
}

export type TWtnSettings = {
  token?: string
  instanceOpts?: TInstanceOpts[]
}

export type TRewriteResult = {
  suggestions?: any[]
}

export type TProxyOpts = {
  prior?: 'dynamic'
}

export type TSuggestionsOpts = {
  text: string
  mode?: RewriteMode
  tryLimit?: number
  tryIndex?: number
}
