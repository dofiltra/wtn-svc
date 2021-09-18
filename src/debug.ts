import { WordtuneSvc } from '.'

const debug = async () => {
  const wtn = new WordtuneSvc({
    dbCacheName: 'test'
  })

  console.log(1)
  console.log(await wtn.getSuggestions(`hello guys and girls`))
}

debug()
