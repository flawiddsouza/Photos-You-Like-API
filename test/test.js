const expect = require('chai').expect
const scrapers = require('./../scrapers')

describe('scrapers.instagram()', () => {
    it('should fetch instagram data as a photo object', async() => {
        var photo1 = {
            title: 'Possibly the most photogenic dog of all time 🐶Shot on Pixel 2',
            photographerName: 'Marques Brownlee',
            photographerLink: 'https://www.instagram.com/mkbhd/',
            source: 'https://www.instagram.com/p/BfOwUc4lhhZ/?taken-by=mkbhd',
            images: [
                'https://instagram.fblr5-1.fna.fbcdn.net/vp/128397e0d054c6165e79fc180ba6ebb6/5B1CB8FB/t51.2885-15/e35/27581141_877700285746264_8199487447357194240_n.jpg'
            ]
        }

        var photo2 = await scrapers.instagram('https://www.instagram.com/p/BfOwUc4lhhZ/?taken-by=mkbhd')

        expect(photo2).to.be.deep.equal(photo1)
    })
})

describe('scrapers.tumblr()', () => {
    it('should fetch tumblr data as a photo object', async() => {
        var photo1 = {
            title: 'Exploring Planet Earth : Photo',
            photographerName: 'Exploring Planet Earth',
            photographerLink: 'https://exploringplanetearth.tumblr.com',
            source: 'https://exploringplanetearth.tumblr.com/image/171158802586',
            images: [
                'https://68.media.tumblr.com/0ba9812a3c207264f0c2ec98fd02ed36/tumblr_p4ixrcJujK1vike5ho1_1280.jpg'
            ]
        }

        var photo2 = await scrapers.tumblr('https://exploringplanetearth.tumblr.com/image/171158802586')

        expect(photo2).to.be.deep.equal(photo1)
    })
})

describe('scrapers.flickr()', () => {
    it('should fetch flickr data as a photo object', async() => {
        var photo1 = {
            title: 'Siskin',
            photographerName: 'Ian Redman',
            photographerLink: 'https://www.flickr.com/photos/redmani49/',
            source: 'https://www.flickr.com/photos/redmani49/40397401792/in/explore-2018-02-23/',
            images: [
                'https://farm5.staticflickr.com/4613/40397401792_66d357434a_o.jpg'
            ]
        }

        var photo2 = await scrapers.flickr('https://www.flickr.com/photos/redmani49/40397401792/in/explore-2018-02-23/')

        expect(photo2).to.be.deep.equal(photo1)
    })
})

describe('scrapers.twitter()', () => {
    it('should fetch twitter data as a photo object', async() => {
        var photo1 = {
            title: '#wf2018w #FGO',
            photographerName: '🌸尊みを感じて桜井 🌸',
            photographerLink: 'https://twitter.com/lapinAngelia',
            source: 'https://twitter.com/lapinAngelia/status/965424949476278273',
            images: [
                'https://pbs.twimg.com/media/DWXg3RoU8AA1Uxd.jpg:large',
                'https://pbs.twimg.com/media/DWXg3RpUQAAvMG_.jpg:large',
                'https://pbs.twimg.com/media/DWXg3RpVAAAEBDR.jpg:large',
                'https://pbs.twimg.com/media/DWXg3RsVoAAF4Lw.jpg:large'
            ]
        }

        var photo2 = await scrapers.twitter('https://twitter.com/lapinAngelia/status/965424949476278273')

        expect(photo2).to.be.deep.equal(photo1)
    })
})