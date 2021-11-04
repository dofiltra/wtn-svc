/* tslint:disable:no-console */

import { WtnSvc } from '.'

const debug = async () => {
  const wtn = new WtnSvc({
    dbCacheName: 'test',
    proxies: [{ url: 'https://test.ru@asd.ru:123:123' }]
  })

  const proxy = await wtn.getProxy()
  // console.log(proxy);

  // console.log(await wtn.getSuggestions(`hello guys and girls`))
}

debug()
