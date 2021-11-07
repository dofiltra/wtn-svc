import _ from 'lodash'
import { BrowserManager, LaunchOptions } from 'browser-manager'
import { LowDbKv } from 'dbtempo'
import { TBrowserOpts } from 'browser-manager/lib/types'
import { getFetchHap } from './fetch'
// import { extractProxy } from 'proxy-extract'

export type TWtnSettings = {
  dbCacheName?: string
  proxies?: { url: string }[]
  browserOpts?: TBrowserOpts
  allowUseBrowser?: boolean
}

export const WTN_MAX_LENGTH = 280

export class WtnSvc {
  protected settings: TWtnSettings
  private svcUrl = 'https://www.wordtune.com/'
  private limitProxyCount = 100

  constructor(s?: TWtnSettings) {
    this.settings = { ...s }
  }

  async getSuggestions(text: string) {
    const { dbCacheName = `suggestions-{YYYY}-{MM}-{DD}.json`, allowUseBrowser = false } = this.settings

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

    const proxy = await this.getProxy()

    // TODO: if errors > 10 permanent, then return [text]
    // TODO: if (!proxy?.url) { return }

    try {
      const { result: data } = await this.getFetchSuggestions(text, proxy)
      let suggestions = data?.suggestions

      if (!suggestions?.length && allowUseBrowser) {
        const { result } = await this.getBrowserSuggestions(text, proxy)
        suggestions = result.suggestions
      }

      if (!suggestions?.length) {
        return { result: [text] }
      }

      if (suggestions?.length) {
        db.add({
          [`${Date.now()}_${_.random(1e5, 1e6)}`]: {
            text,
            suggestions
          }
        })
        return { result: suggestions }
      }
    } catch (error: any) {
      return { result: [text], error }
    }
  }

  async getProxy() {
    const { proxies = [] } = this.settings
    const db = new LowDbKv({
      dbName: `proxy-{YYYY}-{MM}-{DD}.json`
    })

    for (const proxy of _.shuffle(proxies)) {
      let { result = 0 } = await db.get(proxy.url)
      if (result >= this.limitProxyCount) {
        continue
      }
      db.add({ [proxy.url]: ++result })
      return proxy
    }

    return null
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
          //"userid": "deviceId-mQEG34Al9yPCMsSUnVK9s3",
          //"x-wordtune-origin": "https://www.wordtune.com"
        },
        body: `{"action":"REWRITE","text":"${text}","start":0,"end":290,"selection":{"wholeText":"${text}","start":0,"end":290}}`,
        method: 'POST',
        timeout: 60e3,
        proxy: proxy?.url
      })
      const data = (await resp.json()) as any

      return { result: data }
    } catch (error: any) {
      return { error }
    }
  }
}
