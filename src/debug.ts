/* tslint:disable:no-console */

import { WtnSvc } from '.'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { Proxifible, ProxyItem, RewriteMode } from 'dprx-types'

const debug = async () => {
  const rootPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  dotenv.config({ path: path.join(rootPath, `.env`) })

  const text =
    `The Eagles were focused primarily on moving players with expiring contracts, sources said, but Cox was brought up in some conversations, with the Steelers showing interest. ` +
    Math.random()

  // const proxies = [
  //   new ProxyItem({
  //     type: process.env.PROXY_TYPE,
  //     ip: process.env.PROXY_IP!,
  //     port: process.env.PROXY_PORT,
  //     changeUrl: process.env.PROXY_CHANGE_URL!,
  //     user: process.env.PROXY_USER,
  //     pass: process.env.PROXY_PASS,
  //     version: 4
  //   } as ProxyItem)
  // ]
  // Proxifible.proxies = proxies

  const wtn = await WtnSvc.build({
    token: process.env.WTNTOKEN,
    browserOpts: {
      launchOpts: {
        headless: false
      }
    }
  })

  // const changeUrlResult = await wtn.changeProxyIp(proxies[0].changeUrl!)
  // const proxy = await Proxifible.getProxy({
  //   sortBy: ['changeUrl']
  // })
  // console.log(proxy)

  console.log(await wtn.getSuggestions(text, RewriteMode.Rewrite))
}

debug()
