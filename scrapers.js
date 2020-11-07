const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

var requestPromise = require('request-promise-native')
requestPromise = requestPromise.defaults({
    jar: true, // this enables cookies
    headers: { // some sites like to block scrapers, ex: deviantart
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.105 Safari/537.36'
    }
})

const jsdom = require('jsdom')
const { JSDOM } = jsdom

const puppeteer = require('puppeteer')

module.exports = {
    instagram, tumblr, flickr, twitter, deviantart, reddit
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

    var jsonData
    Array.from(document.querySelectorAll('script')).forEach(script => {
        if(script.textContent.includes('window._sharedData = ')) {
            jsonData = script.textContent
        }
    })
    jsonData = /{.*}/.exec(jsonData)[0]
    jsonData = JSON.parse(jsonData)

    var uploaderInfo

    if('LoginAndSignupPage' in jsonData.entry_data) {
        const browser = await puppeteer.launch({
            userDataDir: './user_data' // for storing session, so that we don't need to login again and again
        })
        const page = await browser.newPage()

        await page.goto(url, {
            waitUntil: 'networkidle0'
        })

        const pageTitle = await page.title()

        if(pageTitle.includes('Login')) {
            await page.type('[name="username"]', process.env.INSTAGRAM_USERNAME)
            await page.type('[name="password"]', process.env.INSTAGRAM_PASSWORD)
            await Promise.all([
                page.click('button[type=submit]'),
                page.waitForNavigation({ waitUntil: 'networkidle2' })
            ])
        }

        let bodyHTML = await page.evaluate(() => document.body.innerHTML)

        if(bodyHTML.includes('Save Your Login Info?')) {
            const button = await page.$('button:first-child') // Not Now button
            await Promise.all([
                button.click(),
                page.waitForNavigation({ waitUntil: 'networkidle2' })
            ])

            bodyHTML = await page.evaluate(() => document.body.innerHTML)
        }

        jsonData = await page.evaluate(() => {
            let returnValue = ''
            Array.from(document.querySelectorAll('script')).forEach(script => {
                if(script.textContent.includes('window.__additionalDataLoaded')) {
                    returnValue = script.textContent
                }
            })
            return returnValue
        })

        jsonData = /{.*}/.exec(jsonData)[0]
        jsonData = JSON.parse(jsonData)
        uploaderInfo = jsonData['graphql']['shortcode_media']

        browser.close()
    } else {
        uploaderInfo = jsonData['entry_data']['PostPage'][0]['graphql']['shortcode_media']
    }

    photo['title'] = uploaderInfo['edge_media_to_caption']['edges'].length > 0 ? uploaderInfo['edge_media_to_caption']['edges'][0]['node']['text'] : 'Untitled'
    photo['title'] = photo['title'].replace(/(\S*#(?:\[[^\]]+\]|\S+))/g, '').trim() // strip all hash tags
    var uploader = uploaderInfo['owner']
    photo['photographerName'] = uploader['full_name']
    photo['photographerLink'] = 'https://www.instagram.com/' + uploader['username'] + '/'
    photo['source'] = url
    photo['images'] = []
    try {
        var images = uploaderInfo['edge_sidecar_to_children']['edges']
        images.forEach(image => {
            photo['images'].push(image.node.display_url)
        })
    } catch(e) { // when there's only one image in a post
        photo['images'].push(uploaderInfo.display_url)
    }

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

    if(document.querySelector('.photo-title')) {
        photo['title'] = document.querySelector('.photo-title').textContent.trim()
    } else {
        photo['title'] = 'Untitled'
    }
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

        var filterWarning = await page.evaluate(() => document.getElementById('filter-warning'))
        if(!filterWarning) {

            await page.type('#month', '01')
            await page.type('#day', '01')
            await page.type('#year', '1990')
            await page.click('#agree_tos')
            await page.click('.smbutton-green')

            await page.waitForNavigation()

            var downloadButtonMature = await page.evaluate(() => {
                if(document.querySelector('.dev-page-download')) {
                    return document.querySelector('.dev-page-download').href
                }
            })
            var fullImageFromPageMature = await page.evaluate(() => {
                if(document.querySelector('.dev-content-full')) {
                    return document.querySelector('.dev-content-full').src
                }
            })

            if(downloadButtonMature) {
                await page.goto(downloadButtonMature)
                photo['images'].push(page.url())
            } else if(fullImageFromPageMature) {
                photo['images'].push(fullImageFromPageMature)
            } else {
                photo['images'].push('user has limited the viewing of this artwork to members of the DeviantArt community only')
            }

        } else {
            photo['images'].push('user has limited the viewing of this artwork to members of the DeviantArt community only')
        }

        browser.close()
    }

    return Promise.resolve(photo)
}

async function reddit(url) {
    var document = await getDOM(url, true)

    var photo = {}

    var photoTitle = document.querySelector('.title.outbound')
    photo['title'] = photoTitle.textContent
    var photographer = document.querySelector('.tagline').querySelector('a')
    photo['photographerName'] = photographer.textContent
    photo['photographerLink'] = photographer.href
    photo['source'] = url
    photo['images'] = []
    photo['images'].push(photoTitle.href)

    return Promise.resolve(photo)
}
