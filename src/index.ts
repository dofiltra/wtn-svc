/* tslint:disable:no-console */
/* tslint:disable:no-unused-expression */

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
      // console.log(`QStarted! S/P: ${queue.size}/ ${queue.pending} | Date: ${new Date().toJSON()}`)
    })
    queue.on('completed', (result) => {
      // console.log(`QCompleted | Date: ${new Date().toJSON()}`)
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
    await Proxifible.loadProxies()

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
            const isLive = !!(await inst.browser.isLive()) && !inst.page.isClosed()
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

    await sleep(_.random(3e3, 7e3))
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
        // sortBy
        sortBy: Math.random() > 0.3 ? sortBy : sortBy.reverse()
      })

      proxyItem?.changeUrl && (await Proxifible.changeIp(proxyItem.changeUrl, proxyItem.url()))

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
          resourceTypes: ['stylesheet', 'image', 'media']
        }
      })) as Page

      if (!browser || !page) {
        continue
      }

      // page.on('request', async (req) => {
      //   if (req.method().toUpperCase() === 'POST') {
      //     console.log(req.url())
      //   }
      // })

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

  async getSuggestions(opts: TSuggestionsOpts): Promise<TRewriteResult> {
    const { text, tryIndex = 0, tryLimit = 1 } = opts

    if (!text?.length || text.length > WTN_MAX_LENGTH || tryIndex >= tryLimit) {
      return { suggestions: [text] }
    }

    const inst = await WtnSvc.getInstance('WTN')
    Proxifible.changeUseCountProxy(inst.proxyItem?.url())

    const result: TRewriteResult | null = await new Promise(async (resolve) => {
      if (!inst?.page || inst.page.isClosed()) {
        await sleep((tryIndex + 1) * 1000)
        return resolve(null)
      }

      // by token
      if (WtnSvc.token && !WtnSvc.pauseTokens[WtnSvc.token]) {
        const apiResult: TRewriteResult | null = await this.getApiResult(inst?.page, opts)
        if (apiResult?.suggestions?.length) {
          return resolve(apiResult)
        }
      }

      // by demo
      const demoResult: TRewriteResult | null = await this.getDemoResult(inst?.page, opts)
      if (demoResult?.suggestions?.length) {
        return resolve(demoResult)
      }

      // by click
      const clickResult = await this.getClickResult(inst, opts)
      if (clickResult?.suggestions?.length) {
        return resolve(clickResult)
      }

      return resolve(null)
    })

    if (inst.page.isClosed()) {
      await WtnSvc.closeInstance(inst.id)
    } else {
      WtnSvc.updateInstance(inst.id, {
        idle: true,
        usedCount: inst.usedCount + 1
      })
    }

    if (!result?.suggestions?.length) {
      return await this.getSuggestions({
        ...opts,
        tryIndex: tryIndex + 1
      })
    }

    return result
  }

  private async getApiResult(page: Page, opts: TSuggestionsOpts) {
    if (!WtnSvc.token) {
      return null
    }

    try {
      return await page.evaluate(
        async ({ token, apiUrl, text, mode }) => {
          const resp = await fetch(`${apiUrl}/rewrite`, {
            headers: {
              'cache-control': 'no-cache',
              'content-type': 'application/json',
              'x-wordtune-origin': `${apiUrl}`,
              'x-wordtune': '1',
              'x-wordtune-version': '0.0.1',
              token
            } as any,
            body: JSON.stringify({
              text,
              action: mode,
              start: 0,
              end: text.length,
              selection: { wholeText: `${text}`, bulletText: '', start: 0, end: text.length },
              draftId: 'DIV_editorContentEditable_jss24 jss25-1638001581177',
              emailAccount: null,
              emailMetadata: {},
              lookaheadIndex: 0,
              isBatch: false
            }),
            method: 'POST'
          })
          console.log(resp.ok)

          if (resp.ok) {
            return (await resp.json()) as any
          }
          return null
        },
        {
          token: WtnSvc.token,
          apiUrl: WtnSvc.apiUrl,
          text: opts.text,
          mode: opts.mode
        }
      )
    } catch (error: any) {
      WtnSvc.pauseTokens[WtnSvc.token] = error
      console.log(error)
    }

    return null
  }

  private async getDemoResult(page: Page, opts: TSuggestionsOpts) {
    try {
      return await page.evaluate(
        async ({ apiUrl, text, mode }) => {
          const resp = await fetch(`${apiUrl}/rewrite-limited`, {
            headers: {
              'cache-control': 'no-cache',
              'content-type': 'application/json',
              'x-wordtune-origin': `${apiUrl}`,
              'x-wordtune': '1',
              'x-wordtune-version': '0.0.1'
            } as any,
            body: JSON.stringify({
              text,
              action: mode,
              start: 0,
              end: text.length,
              selection: { wholeText: `${text}`, bulletText: '', start: 0, end: text.length },
              draftId: 'DIV_editorContentEditable_jss24 jss25-1638001581177',
              emailAccount: null,
              emailMetadata: {},
              lookaheadIndex: 0,
              isBatch: false
            }),
            method: 'POST'
          })
          console.log(resp.ok)

          if (resp.ok) {
            return (await resp.json()) as any
          }
          return null
        },
        {
          apiUrl: WtnSvc.apiUrl,
          text: opts.text,
          mode: opts.mode
        }
      )
    } catch (error: any) {
      console.log(error)
    }

    return null
  }

  private async getClickResult(inst: TBrowserInstance, opts: TSuggestionsOpts) {
    try {
      const page = inst.page
      await page.type('#widget-textarea', opts.text)
      await page.evaluate((e) => {
        window.document.getElementById('widget-rewrite-button')?.click()
      })
      // await page.click('button#widget-rewrite-button' })
      const respResult = await inst.browser?.getRespResult<TRewriteResult>(page, 'rewrite-limited', opts.text)

      return respResult as TRewriteResult
    } catch (error: any) {
      // console.log(error)
      return null
    }
  }
}
