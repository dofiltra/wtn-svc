import _ from 'lodash'
import { BrowserManager, LaunchOptions } from 'browser-manager'
import { LowDbKv } from 'dbtempo'
import { TBrowserOpts } from 'browser-manager/lib/types'
// import { extractProxy } from 'proxy-extract'

export type TWtnSettings = {
  dbCacheName?: string
  proxies?: { url: string }[]
  browserOpts?: TBrowserOpts
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
    const { dbCacheName = `suggestions-{YYYY}-{MM}-{DD}.json`, browserOpts } = this.settings

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

    try {
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
        return { result: [text] }
      }

      await page.type('#widget-textarea', text)
      await page.click('#widget-rewrite-button')
      const respResult: any = await pwrt?.getRespResult(page, 'rewrite-limited', text)
      await pwrt?.close('from getSuggestions 2')

      if (respResult?.suggestions?.length) {
        db.add({
          [`${Date.now()}_${_.random(1e5, 1e6)}`]: {
            text,
            suggestions: respResult.suggestions
          }
        })
        return { result: respResult.suggestions }
      }
    } catch (error: any) {
      return { result: [text], error }
    }

    return { result: [text] }
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
}
