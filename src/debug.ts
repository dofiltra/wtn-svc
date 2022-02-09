/* tslint:disable:no-console */
/* tslint:disable:no-debugger */

import { WtnSvc } from '.'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { RewriteMode } from 'dprx-types'

const debug = async () => {
  const rootPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  dotenv.config({ path: path.join(rootPath, `.env`) })

  const wtn = await WtnSvc.build({
    // token: process.env.WTNTOKEN,
    instanceOpts: [
      {
        maxInstance: 2,
        maxPerUse: 100,
        type: 'WTN',
        headless: false,
        liveMinutes: 100
      }
    ]
  })

  const texts: string[] = []
  for (let i = 0; i < 110; i++) {
    const text =
      `${Math.random()} The Eagles were focused primarily on moving players with expiring contracts, sources said, but Cox was brought up in some conversations, with the Steelers showing interest. ` +
      Math.random()

    texts.push(text)
  }

  const res = await Promise.all(
    texts.map(async (text, i) => {
      const r = await wtn.getSuggestions({ text, mode: RewriteMode.Longer })
      console.log(i, r)

      return r
    })
  )

  debugger
}

debug()
