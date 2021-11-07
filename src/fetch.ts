import fetchHap from 'make-fetch-happen'
import { FetchOptions } from 'make-fetch-happen'

export const getFetchHap = async (opts?: FetchOptions) => {
  const {
    headers = {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 5_0 like Mac OS X) AppleWebKit/534.46 (KHTML, like Gecko) Version/5.1 Mobile/9A334 Safari/7534.48.3'
    },
    compress = true
  } = { ...opts }

  return fetchHap.defaults({
    // cachePath: './node_modules/.fetch-cache',
    timeout: 30e3,
    ...opts,
    compress,
    headers,
  })
}
