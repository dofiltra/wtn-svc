import _ from 'lodash'
import { BrowserManager } from 'browser-manager'
import { LowDbKv } from 'dbtempo'
// import { extractProxy } from 'proxy-extract'

type TWordTuneSettings = {
  dbCacheName?: string
  appPath?: string
}

export const WTN_MAX_LENGTH = 280

export class WordtuneSvc {
  protected _settings: TWordTuneSettings
  private _svcUrl = 'https://www.wordtune.com/'

  constructor(s?: TWordTuneSettings) {
    this._settings = { ...s }
  }

  async getSuggestions(text: string, proxies: { url: string }[] = []) {
    const { appPath, dbCacheName = `suggestions-{YYYY}-{MM}-{DD}.json` } = this._settings

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

    // TODO: if errors > 10 permanent, then return [text]

    const proxy = proxies[0]
    // await extractProxy({
    //   tryLimit: 5,
    //   count: 1
    // })

    try {
      const pwrt = await BrowserManager.build<BrowserManager>({
        // browserType: chromium,
        idleCloseSeconds: 60,
        launchOpts: {
          headless: false,
          // proxy: {
          //   server: proxy?.url
          // }
        },
        // device: devices['Pixel 5'],
        maxOpenedBrowsers: 10,
        lockCloseFirst: 60,
        appPath
      })
      const page = await pwrt?.newPage({
        url: this._svcUrl,
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
}
