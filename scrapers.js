var requestPromise = require('request-promise-native')
requestPromise = requestPromise.defaults({
    jar: true, // this enables cookies
    headers: { // some sites like to block scrapers, ex: deviantart
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.186 Safari/537.36'
    }
})

const jsdom = require('jsdom')
const { JSDOM } = jsdom

const puppeteer = require('puppeteer')

module.exports = {
    instagram, tumblr, flickr, twitter, deviantart
}

async function getDOM(url, swallowConsoleErrors = false, returnHtmlString = false) {
    try {
        var htmlString = await requestPromise(url)
    } catch(error) {
        return { error: error.message }
    }

    if(swallowConsoleErrors) {
        const virtualConsole = new jsdom.VirtualConsole()
        var { document } = (new JSDOM(htmlString, { url, virtualConsole })).window // url is passed so we can access stuff like document.location.origin
        virtualConsole.on("error", () => {}) // swallow jsdom parsing errors
    } else {
        var { document } = (new JSDOM(htmlString, { url })).window
    }

    if(returnHtmlString) {
        return { document, htmlString }
    } else {
        return document
    }
}

async function instagram(url) {
    var document = await getDOM(url)

    var photo = {}

    var jsonData = document.querySelectorAll('script')[2].textContent
    jsonData = jsonData.replace('window._sharedData = ', '').replace(';', '')
    jsonData = JSON.parse(jsonData)
    var uploaderInfo = jsonData['entry_data']['PostPage'][0]['graphql']['shortcode_media']
    photo['title'] = uploaderInfo['edge_media_to_caption']['edges'][0]['node']['text']
    photo['title'] = photo['title'].replace(/(\S*#(?:\[[^\]]+\]|\S+))/g, '').trim() // strip all hash tags
    var uploader = uploaderInfo['owner']
    photo['photographerName'] = uploader['full_name']
    photo['photographerLink'] = 'https://www.instagram.com/' + uploader['username'] + '/'
    photo['source'] = url
    photo['images'] = []
    photo['images'].push(document.querySelector('meta[property="og:image"]').getAttribute('content'))

    return Promise.resolve(photo)
}

async function tumblr(url) {
    var document = await getDOM(url)

    var photo = {}

    photo['title'] = document.querySelector('meta[property="og:title"]').getAttribute('content')
    photo['photographerName'] = document.querySelector('figcaption').textContent
    photo['photographerLink'] = url.match(/http.*:\/\/.*\.tumblr\.com/)[0]
    photo['source'] = url
    photo['images'] = []
    photo['images'].push(document.querySelector('meta[property="og:image"]').getAttribute('content'))

    return Promise.resolve(photo)
}

async function flickr(url) {
    var { document, htmlString } = await getDOM(url, true, true)

    var photo = {}

    photo['title'] = document.querySelector('.photo-title').textContent.trim()
    var photographer = document.querySelector('.owner-name')
    photo['photographerName'] = photographer.textContent
    photo['photographerLink'] = photographer.href
    photo['source'] = url
    var foundSizes = JSON.parse(htmlString.match(/"sizes":{.+?}}/i)[0].replace('"sizes":', ''))
    var largestSize = foundSizes[Object.keys(foundSizes)[Object.keys(foundSizes).length - 1]]
    photo['images'] = []
    photo['images'].push('https:' + largestSize.displayUrl)

    return Promise.resolve(photo)
}

async function twitter(url) {
    var document = await getDOM(url, true)

    var photo = {}

    photo['title'] = document.querySelector('.js-tweet-text-container').textContent.trim()
    photo['title'] = photo['title'].replace(document.querySelector('.twitter-timeline-link.u-hidden').textContent, '')
    photo['photographerName'] = document.querySelector('.show-popup-with-id').textContent.trim()
    photo['photographerLink'] = document.querySelector('.js-action-profile').href
    photo['source'] = url
    photo['images'] = []
    Array.from(document.querySelectorAll('meta[property="og:image"]')).forEach(image => {
        photo['images'].push(image.getAttribute('content'))
    })

    return Promise.resolve(photo)
}

async function deviantart(url) {
    var document = await getDOM(url, true)

    var photo = {}

    photo['title'] = document.querySelector('.dev-title-container > h1 > a').textContent
    photo['photographerName'] = document.querySelector('.author').querySelector('a').textContent
    photo['photographerLink'] = document.querySelector('.author').querySelector('a').href
    photo['source'] = url
    photo['images'] = []

    var downloadButton = document.querySelector('.dev-page-download')
    var fullImageFromPage = document.querySelector('.dev-content-full')

    if(downloadButton) {
        var response = await requestPromise({ url: downloadButton.href, followRedirect: false, simple: false, resolveWithFullResponse: true })
        photo['images'].push(response.headers.location)
    } else if(fullImageFromPage) {
        photo['images'].push(fullImageFromPage.src)
    } else { // mature content then
        const browser = await puppeteer.launch()
        const page = await browser.newPage()

        await page.goto(url)

        await page.type('#month', '01')
        await page.type('#day', '01')
        await page.type('#year', '1990')
        await page.click('#agree_tos')
        await page.click('.smbutton-green')

        await page.waitForNavigation()

        var downloadButtonMature = await page.evaluate(() => document.querySelector('.dev-page-download').href)
        var fullImageFromPageMature = await page.evaluate(() => document.querySelector('.dev-content-full').src)

        var pageCookies = await page.cookies()

        browser.close()

        if(downloadButtonMature) {
            var response = await requestPromise({
                url: downloadButtonMature,
                followRedirect: false,
                simple: false,
                resolveWithFullResponse: true,
                headers:{
                     Cookie: pageCookies[0].name + '=' + pageCookies[0].value + ';' // pageCookies[0] is userInfo
                }
            })
            photo['images'].push(response.headers.location)
        } else if(fullImageFromPageMature) {
            photo['images'].push(fullImageFromPageMature.src)
        }
    }

    return Promise.resolve(photo)
}
