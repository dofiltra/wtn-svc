/* tslint:disable:no-console */

import { WtnSvc } from '.'
import fetch from 'node-fetch'

const debug = async () => {
  const text = `The Eagles were focused primarily on moving players with expiring contracts, sources said, but Cox was brought up in some conversations, with the Steelers showing interest.`

  const proxies = [
    { url: 'http://FSOfa5:EZaEVDGtbm@45.89.19.21:16738' },
    // { url: 'socks5://FSOfa5:EZaEVDGtbm@45.89.19.21:16739' },
    // { url: 'socks5://45.89.19.117:17807@FSOfa5:EZaEVDGtbm' },
    // { url: 'socks5://45.89.19.50:7167@FSOfa5:EZaEVDGtbm' },
    // { url: 'socks5://45.89.18.237:8135@FSOfa5:EZaEVDGtbm' },
    // { url: 'socks5://45.89.19.46:4919@FSOfa5:EZaEVDGtbm' },
    // { url: 'socks5://45.89.19.51:11939@FSOfa5:EZaEVDGtbm' },
    // { url: 'socks5://45.89.19.63:16725@FSOfa5:EZaEVDGtbm' },
    // { url: 'socks5://45.89.19.12:18473@FSOfa5:EZaEVDGtbm' },
    // { url: 'socks5://45.89.19.115:12069@FSOfa5:EZaEVDGtbm' },
    // { url: 'socks5://45.89.19.118:4099@FSOfa5:EZaEVDGtbm' }
  ]

  const wtn = new WtnSvc({
    dbCacheName: 'test',
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
