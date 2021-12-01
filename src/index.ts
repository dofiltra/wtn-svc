import _ from 'lodash'
import { BrowserManager, LaunchOptions } from 'browser-manager'
import { LowDbKv } from 'dbtempo'
import { TBrowserOpts } from 'browser-manager/lib/types'
import { getFetchHap } from './fetch'
import { ProxyItem } from 'dprx-types'

export type TWtnSettings = {
  token?: string
  dbCacheName?: string
  proxies?: ProxyItem[]
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
  protected svcUrl = 'https://www.wordtune.com/'
  protected limitProxyCount = 100

  protected proxyDb = new LowDbKv({
    dbName: `proxy-wtn-{YYYY}-{MM}-{DD}.json`
  })

  constructor(s?: TWtnSettings) {
    this.settings = { ...s }
  }

  async getSuggestions(text: string) {
    const { token, dbCacheName = `suggestions-{YYYY}-{MM}-{DD}.json`, allowUseBrowser = false } = this.settings

    if (!text?.length || text.length > WTN_MAX_LENGTH) {
      return { result: [text] }
    }

    const db = new LowDbKv({
      dbName: dbCacheName
    })

    const existItem = await db.find('text', text)
    if (existItem?.result?.suggestions?.length > 1) {
      return { result: existItem.result.suggestions }
    }

    const errors: any = {}

    try {
      let suggestions = []
      let proxy: any = null

      if (token && !WtnSvc.pauseTokens[token]) {
        const { result: apiResult, error: apiError } = await this.getApiSuggestions(text, token)
        suggestions = apiResult?.suggestions
        errors.apiError = apiError

        if (apiResult?.detail && !apiResult?.suggestions?.length) {
          WtnSvc.pauseTokens[token] = apiResult.detail
        }
      }

      if (!suggestions?.length) {
        proxy ||= await this.getProxy({
          prior: 'dynamic'
        })

        const { result: fetchFreeResult, error: fetchError } = await this.getFetchSuggestions(text, proxy)
        if (fetchFreeResult?.detail && !fetchFreeResult?.suggestions?.length) {
          await this.incProxy(proxy?.url, this.limitProxyCount)
        }
        suggestions = fetchFreeResult?.suggestions
        errors.fetchError = fetchError
      }

      if (!suggestions?.length && allowUseBrowser) {
        proxy ||= await this.getProxy()

        // TODO: if errors > 10 permanent, then return [text]
        // TODO: if (!proxy?.url) { return }

        const { result: browserResult, error: browserError } = await this.getBrowserSuggestions(text, proxy)
        suggestions = browserResult.suggestions
        errors.browserError = browserError
      }

      if (!suggestions?.length) {
        return {
          result: [text],
          errors
        }
      }

      db.add({
        [`${Date.now()}_${_.random(1e5, 1e6)}`]: {
          text,
          suggestions
        }
      })
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

  // async getProxy() {
  //   const { proxies = [] } = this.settings
  //   const db = new LowDbKv({
  //     dbName: `proxy-{YYYY}-{MM}-{DD}.json`
  //   })

  //   for (const proxy of _.shuffle(proxies)) {
  //     let { result = 0 } = await db.get(proxy.url)
  //     if (result >= this.limitProxyCount) {
  //       continue
  //     }
  //     db.add({ [proxy.url]: ++result })
  //     return proxy
  //   }

  //   return null
  // }
  async getProxy(opts?: TProxyOpts) {
    const { prior } = { ...opts }
    const { proxies = [] } = this.settings
    const proxiesData = (await this.proxyDb.getData()) || {}

    let sortProxies = proxies
      .filter((p) => p.changeUrl || (proxiesData[p.url] || 0) < this.limitProxyCount)
      .sort((a, b) => {
        const aVal = proxiesData[a.url] || 0
        const bVal = proxiesData[b.url] || 0

        return aVal - bVal
      })

    if (prior) {
      const dynamicProxies = sortProxies.filter((p) => p.changeUrl)
      if (dynamicProxies.length) {
        sortProxies = dynamicProxies
      }
    }

    const selectedProxy = sortProxies[0]
    if (selectedProxy) {
      if (selectedProxy.changeUrl) {
        const usedCount = proxiesData[selectedProxy.url] || 0
        if (usedCount >= this.limitProxyCount) {
          await this.changeProxyIp(selectedProxy.changeUrl)
          await this.proxyDb.add({ [selectedProxy.url]: 0 })
        }
      }

      this.incProxy(selectedProxy.url)
      return selectedProxy
    }

    return
  }
  async incProxy(proxyUrl?: string, inc = 1) {
    if (!proxyUrl) {
      return
    }
    const { result = 0 } = await this.proxyDb.get(proxyUrl)
    await this.proxyDb.add({ [proxyUrl]: result + inc })
  }

  private async getBrowserSuggestions(text: string, proxy?: { url: string } | null) {
    const { browserOpts } = this.settings

    try {
      const launchOpts: LaunchOptions = {
        headless: true,
        ...browserOpts?.launchOpts
      }

      if (proxy?.url) {
        const atSplit = proxy.url.split('@')
        const [username, password] = atSplit[1]?.split(':') || []
        launchOpts.proxy = {
          server: atSplit[0],
          username,
          password
        }
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

  private async getFetchSuggestions(text: string, proxy?: { url: string } | null) {
    try {
      const fh = await getFetchHap()

      const resp = await fh('https://api.wordtune.com/rewrite-limited', {
        headers: {
          'cache-control': 'no-cache',
          'content-type': 'application/json'
          // "userid": "deviceId-mQEG34Al9yPCMsSUnVK9s3",
          // "x-wordtune-origin": "https://www.wordtune.com"
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
        proxy: proxy?.url
      })
      const result = (await resp.json()) as any

      return { result }
    } catch (error: any) {
      return { error }
    }
  }

  private async getApiSuggestions(text: string, token: string, proxy?: { url: string } | null) {
    try {
      const fh = await getFetchHap()
      const resp = await fh('https://api.wordtune.com/rewrite', {
        headers: {
          'cache-control': 'no-cache',
          'content-type': 'application/json',
          token
          // "userid": "deviceId-mQEG34Al9yPCMsSUnVK9s3",
          // "x-wordtune-origin": "https://www.wordtune.com"
        },
        body: JSON.stringify({
          text: `${text}`,
          action: 'REWRITE',
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

  async changeProxyIp(url: string) {
    try {
      if (!url.startsWith('http')) {
        url = `http://${url}`
      }
      const fh = await getFetchHap()
      const resp = await fh(url, {
        headers: {
          'cache-control': 'no-cache',
          'content-type': 'application/json'
        },
        method: 'GET',
        timeout: 60e3
      })

      return { result: await resp.json() }
    } catch (error: any) {
      return { error }
    }
  }
}
