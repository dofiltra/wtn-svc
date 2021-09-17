import { BrowserManager } from 'browser-manager'
import { LowDbKv } from 'dbtempo'
import _ from 'lodash'
import { chromium, devices } from 'playwright'

type TWordTuneSettings = {
  dbCacheName?: string
  appPath?: string
}

export const WORDTUNE_MAX_LENGTH = 280

class WordtuneSvc {
  protected _settings: TWordTuneSettings
  private _svcUrl = 'https://www.wordtune.com/'

  constructor(s?: TWordTuneSettings) {
    this._settings = { ...s }
  }

  async getSuggestions(text: string) {
    const { appPath, dbCacheName = `suggestions-{YYYY}-{MM}-{DD}.json` } = this._settings

    if (!text?.length || text.length > WORDTUNE_MAX_LENGTH) {
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

    try {
      const pwrt: BrowserManager = await BrowserManager.build({
        browserType: chromium,
        idleCloseSeconds: 60,
        launchOpts: {
          headless: true
        },
        device: devices['Pixel 5'],
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
      Math.random() > 0.5 && pwrt.checkIp().then((x) => console.log(x))

      await page.type('#widget-textarea', text)
      await page.click('#widget-rewrite-button')
      const respResult: any = await pwrt.getRespResult(page, 'rewrite-limited', text)
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

export { WordtuneSvc }
