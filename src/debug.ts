/* tslint:disable:no-console */

import { WtnSvc } from '.'
import fetch from 'node-fetch'

const debug = async () => {
  const text = `The Eagles were focused primarily on moving players with expiring contracts, sources said, but Cox was brought up in some conversations, with the Steelers showing interest.`
  const x = await fetch('https://api.wordtune.com/rewrite-limited', {
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'application/json'
      //"userid": "deviceId-mQEG34Al9yPCMsSUnVK9s3",
      //"x-wordtune-origin": "https://www.wordtune.com"
    },
    body: `{"action":"REWRITE","text":"${text}","start":0,"end":290,"selection":{"wholeText":"${text}","start":0,"end":290}}`,
    method: 'POST'
  })
  const data = (await x.json()) as any
  console.log(data.suggestions)

  const proxies = [
    { url: 'socks5://45.89.19.21:16739@FSOfa5:EZaEVDGtbm' },
    { url: 'socks5://45.89.19.117:17807@FSOfa5:EZaEVDGtbm' },
    { url: 'socks5://45.89.19.50:7167@FSOfa5:EZaEVDGtbm' },
    { url: 'socks5://45.89.18.237:8135@FSOfa5:EZaEVDGtbm' },
    { url: 'socks5://45.89.19.46:4919@FSOfa5:EZaEVDGtbm' },
    { url: 'socks5://45.89.19.51:11939@FSOfa5:EZaEVDGtbm' },
    { url: 'socks5://45.89.19.63:16725@FSOfa5:EZaEVDGtbm' },
    { url: 'socks5://45.89.19.12:18473@FSOfa5:EZaEVDGtbm' },
    { url: 'socks5://45.89.19.115:12069@FSOfa5:EZaEVDGtbm' },
    { url: 'socks5://45.89.19.118:4099@FSOfa5:EZaEVDGtbm' }
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

  console.log(await wtn.getSuggestions(`hello guys and girls`))
}

debug()
