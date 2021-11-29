/* tslint:disable:no-console */

import { WtnSvc } from '.'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const debug = async () => {
  const rootPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  dotenv.config({ path: path.join(rootPath, `.env`) })

  const text =
    `The Eagles were focused primarily on moving players with expiring contracts, sources said, but Cox was brought up in some conversations, with the Steelers showing interest. ` +
    Math.random()

  const proxies = [
    { url: 'http://FSOfa5:EZaEVDGtbm@45.89.19.21:16738' }
    //
  ]

  const wtn = new WtnSvc({
    token: process.env.TOKEN,
    dbCacheName: 'test_' + Math.random(),
    proxies,
    browserOpts: {
      launchOpts: {
        headless: false
      }
    }
  })

  // const proxy = await wtn.getProxy()
  // console.log(proxy);

  console.log(await wtn.getSuggestions(text))
}

debug()
