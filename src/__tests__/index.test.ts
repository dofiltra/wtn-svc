// import { Greeter } from '../index';

// test('My Greeter', () => {
//   expect(Greeter('Carl')).toBe('Hello Carl');
// });

/*

const a = async () => {
  console.log('a')
  const proxy = (
    await extractProxy({
      tryLimit: 5,
      count: 1
    })
  )[0]

  console.log('proxy', proxy)

  const pwrt: BrowserManager = await BrowserManager.build({
    browserType: chromium,
    idleCloseSeconds: 60,
    launchOpts: {
      headless: false,
      proxy: {
        server: proxy?.url
      }
    },
    device: devices['Pixel 5'],
    maxOpenedBrowsers: 10,
    lockCloseFirst: 60
    // appPath
  })
  const page = await pwrt?.newPage({
    url: 'https://httpbin.org/ip?json',
    waitUntil: 'networkidle'
  })
  console.log(await page?.content())
  pwrt.close()
  await sleep(30e3)
}
a()

*/
