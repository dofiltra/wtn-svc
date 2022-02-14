/* tslint:disable:no-console */
/* tslint:disable:no-unused-expression */

import _ from 'lodash'
import PQueue from 'p-queue'
import crypto from 'crypto'
import { BrowserManager, devices, Page } from 'browser-manager'
import { Proxifible } from 'dofiltra_api'
import { TRewriterInstance, TRewriterInstanceOpts, TSuggestionsOpts, TRewriteResult, TRewriterSettings } from './types'
import { sleep } from 'time-helpers'
import { AppState, ProxyItem } from 'dprx-types'

export * from './types'
export const WTN_MAX_LENGTH = 280

export class WtnSvc {
  static instances: TRewriterInstance[] = []

  protected static creatingInstances = false
  protected static pauseTokens: { [token: string]: string } = {}
  protected static instanceOpts: TRewriterInstanceOpts[] = [
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
  protected static proxies: ProxyItem[] = []

  protected static svcUrl = 'https://www.wordtune.com'
  protected static apiUrl = 'https://api.wordtune.com'

  static async build(s: TRewriterSettings) {
    this.token = s.token
    if (s.instanceOpts?.length) {
      this.instanceOpts = s.instanceOpts
    }

    await this.updateProxies({ forceChangeIp: true })

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

  protected static async updateProxies({ forceChangeIp = true }: { forceChangeIp: boolean }) {
    const isDynamicMode = this.instances.length === 0 || _.random(true) > 0.5 // true
    const sortBy: ('changeUrl' | 'useCount')[] = ['changeUrl', 'useCount']
    const sortOrder: ('asc' | 'desc')[] = [isDynamicMode ? 'asc' : 'desc', 'asc']

    this.proxies = await Proxifible.getProxies(
      {
        filterTypes: ['http', 'https'],
        filterVersions: [4],
        sortBy,
        sortOrder,
        forceChangeIp,
        maxUseCount: Number.MAX_SAFE_INTEGER
      },
      Number.MAX_SAFE_INTEGER
    )
  }

  protected static async getAvailableProxy() {
    if (Proxifible.state.toUpperCase() !== AppState.Active.toUpperCase()) {
      console.log('Proxifible.state', Proxifible.state)
      await sleep(_.random(5e3, 10e3))
      return
    }

    const busyProxies = this.instances.filter((inst) => inst.proxyItem).map((inst) => inst.proxyItem?.url())
    await this.updateProxies({ forceChangeIp: false })
    let proxyItem = this.proxies.find((p) => !busyProxies.includes(p.url()))

    if (!proxyItem) {
      await this.updateProxies({ forceChangeIp: true })
      proxyItem = this.proxies.find((p) => !busyProxies.includes(p.url()))
    }

    return proxyItem
  }

  protected static async createInstances() {
    while (this.creatingInstances) {
      await sleep(_.random(5e3, 10e3))
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
          await this.createWtnBro(opts, 1) // 1
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
    ).filter((inst) => inst) as TRewriterInstance[]
  }

  protected static async getInstance(type: 'WTN'): Promise<TRewriterInstance> {
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

  protected static async createWtnBro(opts: TRewriterInstanceOpts, newInstancesCount: number): Promise<void> {
    const { headless, maxPerUse = 100, liveMinutes = 10, maxInstance = 0 } = opts
    const instanceLiveSec = liveMinutes * 60

    await Promise.all(
      new Array(...new Array(newInstancesCount)).map(async (x, i) => {
        if (this.instances.length > maxInstance) {
          return
        }

        await sleep(i * 2000)
        console.log(
          `Dorewrita: Creating #${this.instances.length + 1} of ${maxInstance} | Instances = [${this.instances.length}]`
        )

        const proxyItem = await this.getAvailableProxy()
        if (!proxyItem) {
          return
        }

        const id = crypto.randomBytes(16).toString('hex')
        const browser = await BrowserManager.build<BrowserManager>({
          maxOpenedBrowsers: Number.MAX_SAFE_INTEGER,
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

        if (!browser || !page || page.isClosed()) {
          await Proxifible.changeUseCountProxy(proxyItem?.url(), Proxifible.limitPerProxy)
          return
        }

        // page.on('request', async (req) => {
        //   if (req.method().toUpperCase() === 'POST') {
        //     console.log(req.url())
        //   }
        // })

        page.on('response', async (response) => {
          const statusCode = response.status()
          if (statusCode === 429 || statusCode === 456) {
            WtnSvc.pauseTokens[WtnSvc.token!] = 'Limit 2000 per day'
            await Proxifible.changeUseCountProxy(proxyItem?.url(), Proxifible.limitPerProxy)
            await this.closeInstance(id)
            return
          }
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
        } as TRewriterInstance)

        console.log(`Dorewrita: Success instance #${this.instances.length} of ${maxInstance}`, proxyItem.url())
      })
    )
  }

  async getSuggestions(opts: TSuggestionsOpts): Promise<TRewriteResult> {
    const { text, tryIndex = 0, tryLimit = 1 } = opts

    if (!text?.length || text.length > WTN_MAX_LENGTH || tryIndex >= tryLimit) {
      return { suggestions: [text] }
    }

    const inst = await WtnSvc.getInstance('WTN')
    await Proxifible.changeUseCountProxy(inst.proxyItem?.url())
    // console.log(`\n\nWTN: ${text.slice(0, 50)}...\n`, inst.proxyItem?.url(), inst.proxyItem?.useCount, '\n')

    const result: TRewriteResult | null = await new Promise(async (resolve) => {
      try {
        if (!inst?.page || inst.page.isClosed()) {
          await sleep((tryIndex + 1) * 1000)
          return resolve(null)
        }

        // by token
        if (Math.random() > 0.85 && WtnSvc.token && !WtnSvc.pauseTokens[WtnSvc.token]) {
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
      } catch (e: any) {
        console.log(e)
        return resolve(null)
      }
    })

    if (inst.page?.isClosed()) {
      await Proxifible.changeUseCountProxy(inst.proxyItem?.url(), Proxifible.limitPerProxy)
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
      if (page.isClosed()) {
        return null
      }

      return await page.evaluate(
        async ({ token, apiUrl, text, mode, draftId }) => {
          try {
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
                draftId,
                emailAccount: null,
                emailMetadata: {},
                lookaheadIndex: 0,
                isBatch: false
              }),
              method: 'POST'
            })

            if (resp.ok) {
              return (await resp.json()) as any
            }
          } catch (e: any) {
            console.log(e)
          }
          return null
        },
        {
          token: WtnSvc.token,
          apiUrl: WtnSvc.apiUrl,
          text: opts.text,
          mode: opts.mode,
          draftId: opts.draftId || 'DIV_editorContentEditable_jss32 jss33-1644093842417'
        }
      )
    } catch (error: any) {
      WtnSvc.pauseTokens[WtnSvc.token] = error
      console.log(error)
    }

    WtnSvc.pauseTokens[WtnSvc.token!] = 'Limit 2000 per day'
    return null
  }

  private async getDemoResult(page: Page, opts: TSuggestionsOpts) {
    try {
      if (page.isClosed()) {
        return null
      }

      return await page.evaluate(
        async ({ apiUrl, text, mode, draftId }) => {
          try {
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
                // draftId: 'DIV_editorContentEditable_jss24 jss25-1638001581177',
                emailAccount: null,
                emailMetadata: {},
                lookaheadIndex: 0,
                isBatch: false
              }),
              method: 'POST'
            })

            if (resp.ok) {
              return (await resp.json()) as any
            }
          } catch (e: any) {
            console.log(e)
          }
          return null
        },
        {
          apiUrl: WtnSvc.apiUrl,
          text: opts.text,
          mode: opts.mode,
          draftId: opts.draftId || 'DIV_editorContentEditable_jss32 jss33-1644093842417'
        }
      )
    } catch (error: any) {
      console.log(error)
    }

    return null
  }

  private async getClickResult(inst: TRewriterInstance, opts: TSuggestionsOpts) {
    try {
      const page = inst.page

      if (page.isClosed()) {
        return null
      }

      await page.type('#widget-textarea', opts.text)
      await page.evaluate((e) => {
        window.document.getElementById('widget-rewrite-button')?.click()
      })
      // await page.click('button#widget-rewrite-button' })
      const respResult = await inst.browser?.getRespResult<TRewriteResult>(page, 'rewrite-limited', opts.text)

      return respResult as TRewriteResult
    } catch (error: any) {
      console.log(error)
    }

    return null
  }
}
