const requestPromise = require('request-promise-native')
const jsdom = require('jsdom')
const { JSDOM } = jsdom

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

module.exports = {
    instagram, tumblr, flickr, twitter
}