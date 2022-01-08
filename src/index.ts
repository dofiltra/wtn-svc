import _ from 'lodash'
import PQueue from 'p-queue'
import crypto from 'crypto'
import { BrowserManager, devices, Page } from 'browser-manager'
import { Proxifible, ProxyItem, RewriteMode } from 'dprx-types'
import { TBrowserInstance, TInstanceOpts, TSuggestionsOpts, TRewriteResult, TWtnSettings } from './types'
import { sleep } from 'time-helpers'

export const WTN_MAX_LENGTH = 280

export class WtnSvc {
  protected static creatingInstances = false
  protected static pauseTokens: { [token: string]: string } = {}
  protected static instances: TBrowserInstance[] = []
  protected static instanceOpts: TInstanceOpts[] = [
    {
      type: 'WTN',
      liveMinutes: 10,
      maxPerUse: 100,
      maxInstance: 1,
      headless: true
    }
  ]
  protected static queue = new PQueue({ concurrency: 1 })
  protected static queueResults: { [id: string]: TRewriteResult } = {}
  protected static token: string | undefined = ''

  protected static svcUrl = 'https://www.wordtune.com'
  protected static apiUrl = 'https://api.wordtune.com'

  static async build(s: TWtnSettings) {
    this.token = s.token
    if (s.instanceOpts?.length) {
      this.instanceOpts = s.instanceOpts
    }
    await this.createInstances()

    const queue = this.queue
    queue.concurrency = s.instanceOpts?.reduce((sum, instOpts) => sum + instOpts.maxInstance, 0) || 1
    queue.on('active', () => {
      // console.log(
      //   `QStarted! S/P: ${queue.size}/ ${queue.pending} | Date: ${new Date().toJSON()}`
      // )
    })
    queue.on('completed', (result) => {
      //   console.log(`QCompleted | Date: ${new Date().toJSON()}`)
    })
    queue.on('error', (error) => console.log('\n---\nQRewriter error', error))
    queue.on('idle', async () => {
      // console.log(`QIdle.  Size: ${queue.size}  Pending: ${queue.pending}`)
    })

    return new this(true)
  }

  constructor(isBuild: boolean) {
    if (!isBuild) {
      throw new Error('use static WtnSvc.build(settings)')
    }
  }

  protected static async createInstances() {
    if (this.creatingInstances) {
      while (this.creatingInstances) {
        await sleep(_.random(10e3, 15e3))
      }

      if (this.instances.length) {
        return
      }
    }

    this.creatingInstances = true
    for (const opts of this.instanceOpts) {
      const { type, maxInstance } = opts
      const newInstanceCount = maxInstance - this.instances.filter((inst) => inst?.type === type).length

      if (newInstanceCount < 1) {
        continue
      }

      switch (type) {
        case 'WTN':
          await this.createWtnBro(opts, newInstanceCount)
          break
      }
    }
    this.creatingInstances = false
  }

  protected static async closeDeadInstances() {
    this.instances = (
      await Promise.all(
        this.instances.map(async (inst) => {
          try {
            const isLive = !!(await inst.browser.isLive())
            if (isLive && inst.usedCount < inst.maxPerUse) {
              return inst
            }
            await inst.browser.close()
          } catch {
            //
          }
          return null
        })
      )
    ).filter((inst) => inst) as TBrowserInstance[]
  }

  protected static async getInstance(type: 'WTN'): Promise<TBrowserInstance> {
    const inst = this.instances
      .filter((ins) => ins?.type === type)
      .sort((a, b) => a.usedCount - b.usedCount)
      .find((i) => i.idle)

    if (inst) {
      this.updateInstance(inst.id, {
        idle: false,
        usedCount: inst.usedCount + 1
      })
      return inst
    }

    await sleep(_.random(5e3, 10e3))
    await this.closeDeadInstances()
    await this.createInstances()
    return await this.getInstance(type)
  }

  protected static updateInstance(id: string, upd: any) {
    const index = this.instances.findIndex((i) => i?.id === id)
    this.instances[index] = { ...this.instances[index], ...upd }
  }

  protected static async closeInstance(id: string) {
    const index = this.instances.findIndex((i) => i?.id === id)
    await this.instances[index]?.browser?.close()
    delete this.instances[index]
  }

  protected static async createWtnBro(opts: TInstanceOpts, newInstancesCount: number): Promise<void> {
    const { headless, maxInstance = 1, maxPerUse = 100, liveMinutes = 10 } = opts
    const instanceLiveSec = liveMinutes * 60

    for (let i = 0; i < newInstancesCount; i++) {
      const id = crypto.randomBytes(16).toString('hex')
      const sortBy: ('changeUrl' | 'useCount')[] = ['changeUrl', 'useCount']
      const proxyItem = await Proxifible.getProxy({
        filterTypes: ['http', 'https'],
        filterVersions: [4],
        sortBy: Math.random() > 0.3 ? sortBy : sortBy.reverse()
      })
      const browser = await BrowserManager.build<BrowserManager>({
        maxOpenedBrowsers: maxInstance,
        launchOpts: {
          headless: headless !== false,
          proxy: proxyItem?.toPwrt()
        },
        device: devices['Pixel 5'],
        lockCloseFirst: instanceLiveSec,
        idleCloseSeconds: instanceLiveSec
      })
      const page = (await browser!.newPage({
        url: this.svcUrl,
        waitUntil: 'networkidle',
        blackList: {
          resourceTypes: ['stylesheet', 'image']
        }
      })) as Page

      if (!browser || !page) {
        continue
      }

      page.on('response', async (response) => {
        if (response.status() !== 429) {
          return
        }
        // debugger
        await Proxifible.changeUseCountProxy(proxyItem?.url(), Proxifible.limitPerProxy)
        await this.closeInstance(id)
      })

      this.instances.push({
        id,
        type: 'WTN',
        idle: true,
        usedCount: 0,
        maxPerUse,
        browser,
        page,
        proxyItem
      } as TBrowserInstance)
    }
  }

  async getSuggestions(text: string, mode: RewriteMode = RewriteMode.Longer) {
    if (!text?.length || text.length > WTN_MAX_LENGTH) {
      return { result: [text] }
    }

    const errors: any = {}

    try {
      let suggestions = []

      // if (this.token && !WtnSvc.pauseTokens[this.token]) {
      //   const { result: apiResult, error: apiError } = await this.getApiSuggestions(text, token, mode, proxy)
      //   suggestions = apiResult?.suggestions
      //   if (apiError) {
      //     errors.apiError = apiError
      //   }

      //   if (apiResult?.detail && !apiResult?.suggestions?.length) {
      //     WtnSvc.pauseTokens[token] = apiResult.detail
      //   }
      // }

      // if (!suggestions?.length) {
      //   const { result: fetchFreeResult, error: fetchError } = await this.getFetchSuggestions(text, mode, proxy)
      //   if (fetchFreeResult?.detail && !fetchFreeResult?.suggestions?.length) {
      //     await Proxifible.changeUseCountProxy(proxy?.url(), Number.MAX_SAFE_INTEGER)
      //   }
      //   suggestions = fetchFreeResult?.suggestions

      //   if (fetchError) {
      //     errors.fetchError = fetchError
      //   }
      // }

      if (!suggestions?.length) {
        const { suggestions: browserSuggestions = [] } = await this.getBrowserSuggestions({ text, mode })
        if (browserSuggestions.length) {
          suggestions = browserSuggestions
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

  private async getBrowserSuggestions(opts: TSuggestionsOpts): Promise<TRewriteResult> {
    const { text, tryIndex = 0, tryLimit = 5, mode = RewriteMode.Rewrite } = opts

    if (tryIndex >= tryLimit) {
      return { suggestions: [text] }
    }

    const inst = await WtnSvc.getInstance('WTN')
    const page = inst?.page
    Proxifible.changeUseCountProxy(inst.proxyItem?.url())

    const result: TRewriteResult | null = await new Promise(async (resolve) => {
      if (!page) {
        await sleep((tryIndex + 1) * 1000)
        return resolve(null)
      }

      try {
        await page.type('#widget-textarea', text)
        await page.evaluate((e) => {
          window.document.getElementById('widget-rewrite-button')?.click()
        })
        // await page.click('button#widget-rewrite-button' })
        const respResult = await inst.browser?.getRespResult<TRewriteResult>(page, 'rewrite-limited', text)

        return resolve(respResult as TRewriteResult)
      } catch (error: any) {
        // console.log(error)
        return resolve(null)
      }
    })

    WtnSvc.updateInstance(inst.id, {
      idle: true,
      usedCount: inst.usedCount + 1
    })

    if (!result?.suggestions?.length) {
      return await this.getBrowserSuggestions({
        ...opts,
        tryIndex: tryIndex + 1
      })
    }

    return result
  }

  // private async getFetchSuggestions(text: string, mode: RewriteMode, proxy?: ProxyItem) {
  //   try {
  //     const fh = await getFetchHap()
  //     const resp = await fh(`${this.apiUrl}/rewrite-limited`, {
  //       headers: {
  //         'cache-control': 'no-cache',
  //         'content-type': 'application/json',
  //         'x-wordtune-origin': `${this.svcUrl}`
  //         // "userid": "deviceId-mQEG34Al9yPCMsSUnVK9s3",
  //       },
  //       body: JSON.stringify({
  //         action: mode,
  //         text: `${text}`,
  //         start: 0,
  //         end: 290,
  //         selection: { wholeText: `${text}`, start: 0, end: 290 }
  //       }),
  //       method: 'POST',
  //       timeout: 60e3,
  //       proxy: proxy?.url()
  //     })
  //     const result = (await resp.json()) as any

  //     return { result }
  //   } catch (error: any) {
  //     return { error }
  //   }
  // }

  // private async getApiSuggestions(text: string, token: string, mode: RewriteMode, proxy?: ProxyItem) {
  //   try {
  //     const fh = await getFetchHap()

  //     const resp = await fh(`${this.apiUrl}/rewrite`, {
  //       headers: {
  //         'cache-control': 'no-cache',
  //         'content-type': 'application/json',
  //         // 'x-wordtune-origin': `${this.svcUrl}`,
  //         token
  //       },
  //       body: JSON.stringify({
  //         text,
  //         action: mode,
  //         start: 0,
  //         end: text.length,
  //         selection: { wholeText: `${text}`, bulletText: '', start: 0, end: text.length },
  //         draftId: 'DIV_editorContentEditable_jss24 jss25-1638001581177',
  //         emailAccount: null,
  //         emailMetadata: {},
  //         lookaheadIndex: 0,
  //         isBatch: false
  //       }),
  //       method: 'POST',
  //       timeout: 60e3,
  //       proxy: proxy?.url()
  //     })
  //     const result = (await resp.json()) as any

  //     return { result }
  //   } catch (error: any) {
  //     return { error }
  //   }
  // }
}
