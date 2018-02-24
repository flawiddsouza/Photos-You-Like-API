const requestPromise = require('request-promise-native')
const jsdom = require('jsdom')
const { JSDOM } = jsdom

async function instagram(url) {
    try {
        var htmlString = await requestPromise(url)
    } catch(error) {
        return { error: error.message }
    }

    const { document } = (new JSDOM(htmlString)).window

    var photo = {}

    var jsonData = document.querySelectorAll('script')[2].textContent
    jsonData = jsonData.replace('window._sharedData = ', '').replace(';', '')
    jsonData = JSON.parse(jsonData)
    var uploaderInfo = jsonData['entry_data']['PostPage'][0]['graphql']['shortcode_media']
    photo['title'] = uploaderInfo['edge_media_to_caption']['edges'][0]['node']['text']
    photo['title'] = photo['title'].replace(/(\S*#(?:\[[^\]]+\]|\S+))/g, '').trim() // strip all hash tags
    var uploader = uploaderInfo['owner']
    photo['photographerName'] = uploader['full_name']
    photo['photographerLink'] = 'http://www.instagram.com/' + uploader['username'] + '/'
    photo['source'] = url
    photo['images'] = []
    photo['images'].push(document.querySelector('meta[property="og:image"]').getAttribute('content'))

    return photo
}

async function tumblr(url) {
    try {
        var htmlString = await requestPromise(url)
    } catch(error) {
        return { error: error.message }
    }

    const { document } = (new JSDOM(htmlString)).window

    var photo = {}

    photo['title'] = document.querySelector('meta[property="og:title"]').getAttribute('content')
    photo['photographerName'] = document.querySelector('figcaption').textContent
    photo['photographerLink'] = url.match(/https:\/\/.*\.tumblr\.com/)[0]
    photo['source'] = url
    photo['images'] = []
    photo['images'].push(document.querySelector('meta[property="og:image"]').getAttribute('content'))

    return photo
}

async function flickr(url) {
    try {
        var htmlString = await requestPromise(url)
    } catch(error) {
        return { error: error.message }
    }

    const virtualConsole = new jsdom.VirtualConsole()
    const { document } = (new JSDOM(htmlString, { virtualConsole })).window
    virtualConsole.on("error", () => {}) // swallow jsdom parsing errors

    var photo = {}

    photo['title'] = document.querySelector('.photo-title').textContent.trim()
    var photographer = document.querySelector('.owner-name')
    photo['photographerName'] = photographer.textContent
    photo['photographerLink'] = 'https://www.flickr.com' + photographer.href
    photo['source'] = url
    var foundSizes = JSON.parse(htmlString.match(/"sizes":{.+?}}/i)[0].replace('"sizes":', ''))
    var largestSize = foundSizes[Object.keys(foundSizes)[Object.keys(foundSizes).length - 1]]
    photo['images'] = []
    photo['images'].push('https:' + largestSize.displayUrl)

    return photo
}

module.exports = {
    instagram: instagram,
    tumblr: tumblr,
    flickr: flickr
}