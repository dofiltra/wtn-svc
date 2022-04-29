/* tslint:disable:no-console */
/* tslint:disable:no-debugger */

import { Dorewrita } from '.'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { RewriteMode } from 'dprx-types'
import { sleep } from 'time-helpers'
import { Proxifible } from 'dofiltra_api'
import { RewriterInstanceType } from './types'

const debug = async () => {
  const rootPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  dotenv.config({ path: path.join(rootPath, `.env`) })

  await Proxifible.loadProxies()

  const wtn = await Dorewrita.build({
    // token: process.env.WTNTOKEN,
    instanceOpts: [
      {
        maxInstance: 1,
        maxPerUse: 100,
        type: RewriterInstanceType.Quill,
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

  const r1 = await wtn.getSuggestions({ text: texts[0], mode: RewriteMode.Longer })
  // await sleep(5e3)
  const r2 = await wtn.getSuggestions({ text: texts[1], mode: RewriteMode.Longer })
  // await sleep(1e3)
  const r3 = await wtn.getSuggestions({ text: texts[2], mode: RewriteMode.Longer })

  const res = await Promise.all(
    texts.map(async (text, i) => {
      const r = await wtn.getSuggestions({ text, mode: RewriteMode.Longer })
      // console.log(i, r)

      return r
    })
  )

  debugger
}

debug()
