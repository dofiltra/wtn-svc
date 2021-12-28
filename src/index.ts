import _ from 'lodash'
import { BrowserManager, LaunchOptions } from 'browser-manager'
import { TBrowserOpts } from 'browser-manager/lib/types'
import { getFetchHap, Proxifible, ProxyItem, RewriteMode } from 'dprx-types'

export type TWtnSettings = {
  token?: string
  browserOpts?: TBrowserOpts
  allowUseBrowser?: boolean
}

export type TProxyOpts = {
  prior?: 'dynamic'
}

export const WTN_MAX_LENGTH = 280

export class WtnSvc {
  private static pauseTokens: { [token: string]: string } = {}

  protected settings: TWtnSettings
  protected svcUrl = 'https://www.wordtune.com'
  protected apiUrl = 'https://api.wordtune.com'
  protected limitProxyCount = 100

  constructor(s?: TWtnSettings) {
    this.settings = { ...s }
  }

  async getSuggestions(text: string, mode: RewriteMode = RewriteMode.Longer) {
    const { token, allowUseBrowser = false } = this.settings

    if (!text?.length || text.length > WTN_MAX_LENGTH) {
      return { result: [text] }
    }

    const errors: any = {}

    try {
      let suggestions = []
      let proxy: ProxyItem | undefined

      if (token && !WtnSvc.pauseTokens[token]) {
        const { result: apiResult, error: apiError } = await this.getApiSuggestions(text, token, mode)
        suggestions = apiResult?.suggestions
        if (apiError) {
          errors.apiError = apiError
        }

        if (apiResult?.detail && !apiResult?.suggestions?.length) {
          WtnSvc.pauseTokens[token] = apiResult.detail
        }
      }

      if (!suggestions?.length) {
        const sortBy: ('changeUrl' | 'useCount')[] = ['changeUrl', 'useCount']
        proxy ||= await Proxifible.getProxy({
          sortBy: Math.random() > 0.3 ? sortBy : sortBy.reverse()
        })

        const { result: fetchFreeResult, error: fetchError } = await this.getFetchSuggestions(text, proxy)
        if (fetchFreeResult?.detail && !fetchFreeResult?.suggestions?.length) {
          await Proxifible.changeUseCountProxy(proxy?.url(), Number.MAX_SAFE_INTEGER)
        }
        suggestions = fetchFreeResult?.suggestions

        if (fetchError) {
          errors.fetchError = fetchError
        }
      }

      if (!suggestions?.length && allowUseBrowser) {
        proxy ||= await Proxifible.getProxy({
          filterTypes: ['http', 'https']
        })

        const { result: browserResult, error: browserError } = await this.getBrowserSuggestions(text, proxy)
        suggestions = browserResult.suggestions
        if (browserError) {
          errors.browserError = browserError
        }
      }

      if (!suggestions?.length) {
        return {
          result: [text],
          errors
        }
      }

      return { result: suggestions, errors }
    } catch (error: any) {
      return {
        result: [text],
        errors: {
          ...errors,
          error
        }
      }
    }
  }

  private async getBrowserSuggestions(text: string, proxy?: ProxyItem) {
    const { browserOpts } = this.settings

    try {
      const launchOpts: LaunchOptions = {
        headless: true,
        ...browserOpts?.launchOpts
      }

      if (proxy?.url()) {
        launchOpts.proxy = proxy.toPwrt()
      }

      const pwrt = await BrowserManager.build<BrowserManager>({
        idleCloseSeconds: 300,
        lockCloseFirst: 300,
        maxOpenedBrowsers: 1,
        ...browserOpts,
        launchOpts
      })

      const page = await pwrt?.newPage({
        url: this.svcUrl,
        waitUntil: 'networkidle'
      })

      if (!page) {
        await pwrt?.close('from getSuggestions 1')
        return { result: null }
      }

      await page.type('#widget-textarea', text)
      await page.click('#widget-rewrite-button')
      const respResult: any = await pwrt?.getRespResult(page, 'rewrite-limited', text)
      await pwrt?.close('from getSuggestions 2')

      return { result: respResult }
    } catch (error: any) {
      return { error }
    }
  }

  private async getFetchSuggestions(text: string, proxy?: ProxyItem) {
    try {
      const fh = await getFetchHap()
      const resp = await fh(`${this.apiUrl}/rewrite-limited`, {
        headers: {
          'cache-control': 'no-cache',
          'content-type': 'application/json',
          'x-wordtune-origin': `${this.svcUrl}`
          // "userid": "deviceId-mQEG34Al9yPCMsSUnVK9s3",
        },
        body: JSON.stringify({
          action: 'REWRITE',
          text: `${text}`,
          start: 0,
          end: 290,
          selection: { wholeText: `${text}`, start: 0, end: 290 }
        }),
        method: 'POST',
        timeout: 60e3,
        proxy: proxy?.url()
      })
      const result = (await resp.json()) as any

      return { result }
    } catch (error: any) {
      return { error }
    }
  }

  private async getApiSuggestions(text: string, token: string, mode: RewriteMode, proxy?: { url: string } | null) {
    try {
      const fh = await getFetchHap()
      const resp = await fh(`${this.apiUrl}/rewrite`, {
        headers: {
          'cache-control': 'no-cache',
          'content-type': 'application/json',
          token
          // "userid": "deviceId-mQEG34Al9yPCMsSUnVK9s3",
          // "x-wordtune-origin": "https://www.wordtune.com"
        },
        body: JSON.stringify({
          text: `${text}`,
          action: mode,
          start: 0,
          end: 290,
          selection: { wholeText: `${text}`, bulletText: '', start: 0, end: 290 },
          draftId: 'DIV_editorContentEditable_jss24 jss25-1638001581177',
          emailAccount: null,
          emailMetadata: {},
          lookaheadIndex: 0,
          isBatch: true
        }),
        method: 'POST',
        timeout: 60e3,
        proxy: proxy?.url
      })
      const result = (await resp.json()) as any

      return { result }
    } catch (error: any) {
      return { error }
    }
  }
}
