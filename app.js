const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '.env') })

const express = require('express')
const app = express()

const router = express.Router()

router.use(express.static(path.join(__dirname, 'public')))

const bodyParser = require('body-parser')
app.use(bodyParser.json())

const unirest = require('unirest')

const Knex = require('knex')
const knexConfig = require('./knexfile')
var knex
if(process.env.NODE_ENV === 'production') {
    knex = Knex(knexConfig.production)
} else {
    knex = Knex(knexConfig.development)
}

const cors = require('cors')
app.use(cors())

const jwt = require('jsonwebtoken')

router.post('/auth/google', (req, res) => {
    var data = {}
    data.code = req.body.code
    if(req.body.redirectUri) {
        data.client_id = process.env.GOOGLE_CLIENT_ID,
        data.client_secret = process.env.GOOGLE_CLIENT_SECRET,
        data.redirect_uri = req.body.redirectUri
    } else {
        data.client_id = process.env.GOOGLE_CLIENT_ID_OTHER
        data.client_secret = process.env.GOOGLE_CLIENT_SECRET_OTHER
        data.redirect_uri = 'urn:ietf:wg:oauth:2.0:oob'
    }
    data.grant_type = 'authorization_code'
    unirest.post('https://accounts.google.com/o/oauth2/token').form(data).end(response => {
        var idToken = response.body.id_token
        var accessToken = response.body.access_token
        unirest.post('https://www.googleapis.com/oauth2/v3/tokeninfo').form({ id_token: idToken }).end(response2 => {
            var googleUserId = response2.body.sub
            knex('users').where('googleUserId', googleUserId).select().limit(1)
            .then(rows => {
                if(rows.length > 0) { // user found
                    var token = jwt.sign({ id: rows[0].id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY })
                    res.json({
                        success: true,
                        token: token,
                        user: { id: rows[0].id, name: rows[0].name }
                    })
                } else { // user not found, create user
                    unirest.get('https://www.googleapis.com/plus/v1/people/me')
                    .header({ Authorization: `Bearer ${accessToken}` })
                    .end(response3 => {
                        var displayName = response3.body.displayName
                        knex('users').insert({ googleUserId: googleUserId, name: displayName }, 'id').then(insertedIds => {
                            var token = jwt.sign({ id: insertedIds[0] }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY })
                            res.json({
                                success: true,
                                token: token,
                                user: { id: insertedIds[0], name: displayName }
                            })
                        })
                    })
                }
            })
            .catch(error => {
                console.log(error)
                res.json({
                    success: false,
                    error: error
                })
            })
        })
    })
})

const bearerToken = require('express-bearer-token')
app.use(bearerToken())

function authCheck(req, res, next) {
    if(req.token) {
        try {
            var decoded = jwt.verify(req.token, process.env.JWT_SECRET)
            req.authUserId = decoded.id // decoded has the object structure { id: id }
        } catch(err) {
            if(err.name == 'JsonWebTokenError') {
                return res.json({
                    success: false,
                    error: 'Authentication failed. Invalid token provided.'
                })
            } else if(err.name == 'TokenExpiredError') {
                return res.json({
                    success: false,
                    error: 'Authentication failed. Token provided has expired.'
                })
            } else {
                console.log(err)
            }
        }
    } else {
        return res.json({
            success: false,
            error: 'Authentication failed. No token provided.'
        })
    }
    next()
}

const moment = require('moment')

function prependDateTimeToString(string) {
    return moment().format('Y-MM-D_HH-mm-ss.SSS_') + string
}

const url = require('url')

function getFileNameFromURL(theURL) {
    var parsed = url.parse(theURL)
    return decodeURIComponent(path.basename(parsed.pathname))
}

const fs = require('fs')
const request = require('request')
const awaitWriteStream = require('await-stream-ready').write

async function downloadImage(imageURL, path) {
    const stream = request(imageURL).pipe(fs.createWriteStream(path))
    await awaitWriteStream(stream)
}

const multer  = require('multer')
const uploadsDir = path.join(__dirname, 'public', 'images')
const uploadDirTemp = path.join(uploadsDir, 'temp')
const upload = multer({ dest: uploadDirTemp })

const sharp = require('sharp')
const thumbnailsDir = path.join(uploadsDir, 'thumbnails')
const thumbnailWidth = 315
const thumbnailJPGQuality = 95 // perfect balance between size and quality

function generateThumbnail(imagePath, thumbnailSavePath) {
    fs.readFile(imagePath, (err, image) => {
        if (err) console.log(err)
        sharp(image).resize(thumbnailWidth).jpeg({ quality: thumbnailJPGQuality }).toFile(thumbnailSavePath)
    })
}

router.post('/photo/add', authCheck, upload.array('localImage'), async(req, res) => {
    try {

        var files = req.files
        var title = req.body.title

        var existingPhotographer = JSON.parse(req.body.existingPhotographer)
        if(existingPhotographer) {
            var photographerId = req.body.photographerId    
        } else {
            var photographerName = req.body.photographerName
            var photographerLinks = req.body.photographerLinks
            var insertedIds = await knex('photographers').insert({
                name: photographerName,
                links: photographerLinks,
                addedByUserId: req.authUserId
            }, 'id')
            var photographerId = insertedIds[0]
        }

        var images = JSON.parse(req.body.images)
        var imagesNew = []
        for(let image of images) {
            if(image.local) {
                if(files.length > 0) {
                    let file = files.pop()
                    let filename = prependDateTimeToString(file.originalname)
                    let imageSavePath = path.join(uploadsDir, filename)
                    fs.renameSync(file.path, imageSavePath)
                    let thumbnailSavePath = path.join(thumbnailsDir, filename)
                    generateThumbnail(imageSavePath, thumbnailSavePath)
                    imagesNew.push(filename)
                }
            } else {
                if(image.image) {
                    let filename = getFileNameFromURL(image.image)
                    filename = prependDateTimeToString(filename)
                    let imageSavePath = path.join(uploadsDir, filename)
                    await downloadImage(image.image,imageSavePath)
                    let thumbnailSavePath = path.join(thumbnailsDir, filename)
                    generateThumbnail(imageSavePath, thumbnailSavePath)
                    imagesNew.push(filename)
                }
            }
        }
        imagesNew = JSON.stringify(imagesNew)

        var source = req.body.source
        var tags = req.body.tags
        var note = req.body.note

        knex('photos').insert({
            title: title,
            photographerId: photographerId,
            images: imagesNew,
            source: source,
            tags: tags,
            note: note,
            addedByUserId: req.authUserId
        }, 'id').then(insertedIds => {
            res.json({ success: true, id: insertedIds[0] })
        })

    } catch(error) {
        console.log(error)
        res.json({
            success: false,
            error: error.message
        })
    }
})

router.get('/photo/all', (req, res) => {
    getAllPhotographers().then(photographers => {
        knex('photos').select().orderBy('updated_at', 'desc').then(photos => {
            photos.forEach(photo => {
                photo.images = JSON.parse(photo.images)
                photo.tags = JSON.parse(photo.tags)
                photo.metadata = JSON.parse(photo.metadata)
                photo.photographer = photographers.find(photographer => photographer.id == photo.photographerId)
                delete photo.photographerId
            })
            res.json(photos)
        })
    })
})

async function getPhotoForId(id) {
    var photos = await knex('photos').where('id', id).select()
    var photo = photos[0]
    if(photo) {
        photo.images = JSON.parse(photo.images)
        photo.tags = JSON.parse(photo.tags)
        photo.metadata = JSON.parse(photo.metadata)
        var photographers = await knex('photographers').where('id', photo.photographerId).select()
        photo.photographer = photographers[0]
        photo.photographer.links = JSON.parse(photo.photographer.links)
        delete photo.photographerId
        return Promise.resolve(photo)
    } else {
        return Promise.resolve(null)
    }
}

router.get('/photo/:id', (req, res) => {
    getPhotoForId(req.params.id).then(async(photo) => {
        if(photo) {
            res.json({ success: true, photo: photo })
        } else {
            res.json({ success: false })
        }
    })
})

router.patch('/photo/:id', authCheck, upload.array('localImage'), async(req, res) => {
    try {

        var files = req.files

        var insertObj = {}

        if(req.body.title) {
            insertObj.title = req.body.title
        }

        if(req.body.photographerId) {
            insertObj.photographerId = req.body.photographerId
        }

        if(req.body.images) {
            var images = JSON.parse(req.body.images)
            insertObj.images = []
            for(let image of images) {
                if(image.image) { // only image value isn't blank
                    if(image.type == 'file') {
                        if(files.length > 0) {
                            let file = files.pop()
                            let filename = prependDateTimeToString(file.originalname)
                            let imageSavePath = path.join(uploadsDir, filename)
                            fs.renameSync(file.path, imageSavePath)
                            let thumbnailSavePath = path.join(thumbnailsDir, filename)
                            generateThumbnail(imageSavePath, thumbnailSavePath)
                            insertObj.images.push(filename)
                        }
                    } else if(image.type == 'url') {
                        let filename = getFileNameFromURL(image.image)
                        filename = prependDateTimeToString(filename)
                        let imageSavePath = path.join(uploadsDir, filename)
                        await downloadImage(image.image, imageSavePath)
                        let thumbnailSavePath = path.join(thumbnailsDir, filename)
                        generateThumbnail(imageSavePath, thumbnailSavePath)
                        insertObj.images.push(filename)
                    } else if(image.type == 'existing') {
                        insertObj.images.push(image.image)
                    }
                }
            }

            var photos = await knex('photos').where('id', req.params.id).select()
            var imagesOriginal = JSON.parse(photos[0].images)
            var existingImagesThatAreNoLongerUsed = imagesOriginal.filter(n => insertObj.images.indexOf(n) == -1)
            existingImagesThatAreNoLongerUsed.forEach(image => {
                try {
                    fs.unlinkSync(path.join(uploadsDir, image))
                } catch(err) {} // swallow errors since we don't care
            })

            insertObj.images = JSON.stringify(insertObj.images)
        }

        if(req.body.source) {
            insertObj.source = req.body.source
        }

        if(req.body.tags) {
            insertObj.tags = req.body.tags
        }

        if(req.body.note) {
            insertObj.note = req.body.note
        }

        if(Object.keys(insertObj).length > 0) {
            knex('photos').where('id', req.params.id).update(insertObj).update('updated_at', knex.fn.now()).then(updatedRowsCount => {
                if(insertObj.images) {
                    knex('photos').where('id', req.params.id).select('updated_at', 'images').then(photos => {
                        res.json({ success: true, updatedAt: photos[0].updated_at, images: JSON.parse(photos[0].images) })
                    })
                } else {
                    knex('photos').where('id', req.params.id).select('updated_at').then(photos => {
                        res.json({ success: true, updatedAt: photos[0].updated_at })
                    })
                }
            })
        } else { // no changes
            res.json({ success: true })
        }

    } catch(error) {
        res.json({
            success: false,
            error: error.message
        })
    }
})

router.patch('/photo/:id/image/delete', authCheck, (req, res) => {
    knex('photos').where('id', req.params.id).select().then(photos => {
        var images = JSON.parse(photos[0].images)
        if(images.find(image => image == req.body.image)) {
            try {
                fs.unlinkSync(path.join(uploadsDir, req.body.image))
                fs.unlinkSync(path.join(thumbnailsDir, req.body.image))
            } catch(err) {} // swallow errors since we don't care
            var imagesNew = JSON.stringify(images.filter(image => image !== req.body.image))
            knex('photos').where('id', req.params.id).update('images', imagesNew).update('updated_at', knex.fn.now()).then(updatedRowsCount => {
                res.json({ success: true })
            })
        } else {
            res.json({ success: false, error: 'Given image is not attached to the photo' })
        }
    })
})

router.delete('/photo/:id', authCheck, (req, res) => {
    getPhotoForId(req.params.id).then(photo => {
        if(photo) {
            photo.images.forEach(image => { // delete all attached images from storage
                try {
                    fs.unlinkSync(path.join(uploadsDir, image))
                    fs.unlinkSync(path.join(thumbnailsDir, image))
                } catch(err) {} // swallow errors since we don't care
            })
            knex('photos').where('id', req.params.id).delete().then(deleteCount => {
                res.json({ success: true })
            })
        } else {
            res.json({ success: false })
        }
    })
})

router.post('/photographer/add', authCheck, (req, res) => {
    try {
        knex('photographers').insert({ name: req.body.name, links: req.body.links }, 'id').then(insertedIds => {
            knex('photographers').where('id', insertedIds[0]).select('created_at').then(photographers => {
                var photographer = photographers[0]
                res.json({
                    success: true, 
                    photographer: {
                        id: insertedIds[0],
                        name: req.body.name,
                        links: JSON.parse(req.body.links),
                        created_at: photographer.created_at,
                        updated_at: photographer.created_at // it's the same when an entry is created
                    }
                })
            })
        })
    } catch(error) {
        res.json({
            success: false,
            error: error.message
        })
    }
})

router.patch('/photographer/:id', authCheck, (req, res) => {
    try {
        var insertObj = {}

        if(req.body.name) {
            insertObj.name = req.body.name
        }

        if(req.body.links) {
            insertObj.links = req.body.links
        }

        knex('photographers').where('id', req.params.id).update(insertObj).update('updated_at', knex.fn.now()).then(updatedRowsCount => {
            knex('photographers').where('id', req.params.id).select('updated_at').then(photographers => {
                var photographer = photographers[0]
                res.json({
                    success: true,
                    updatedAt: photographer.updated_at
                })
            })
        })
    } catch(error) {
        res.json({
            success: false,
            error: error.message
        })
    }
})

router.delete('/photographer/:id', authCheck, async(req, res) => {
    try {
        var photosForPhotographer = await knex('photos').where('photographerId', req.params.id).select('id', 'images')
        var photoIdsToBeDeleted = []
        photosForPhotographer.forEach(photo => {
            photoIdsToBeDeleted.push(photo.id)
            var images = JSON.parse(photo.images)
            images.forEach(image => { // delete all attached images from storage
                try {
                    fs.unlinkSync(path.join(uploadsDir, image))
                    fs.unlinkSync(path.join(thumbnailsDir, image))
                } catch(err) {} // swallow errors since we don't care
            })
        })
        await knex('photos').whereIn('id', photoIdsToBeDeleted).delete() // delete all associated photos
        knex('photographers').where('id', req.params.id).delete().then(deleteCount => {
            res.json({ success: true })
        })
    } catch(error) {
        res.json({
            success: false,
            error: error.message
        })
    }
})

async function getAllPhotographers() {
    var photographers = await knex('photographers').select()
    photographers.forEach(photographer => photographer.links = JSON.parse(photographer.links))
    return Promise.resolve(photographers)
}

router.get('/photographer/all', (req, res) => {
    getAllPhotographers().then(photographers => res.json(photographers))
})

router.get('/photographer/all/with/count', async(req, res) => {
    var photos = await knex('photos').select('photographerId')
    knex('photographers').select().then(photographers => {
        photographers.forEach(photographer => {
            photographer.links = JSON.parse(photographer.links)
            photographer.count = photos.filter(photo => photo.photographerId == photographer.id).length
        })
        res.json(photographers)
    })
})

router.get('/photographer/all/with/count/user', authCheck, async(req, res) => {
    var photos = await knex('photos').where('addedByUserId', req.authUserId).select('photographerId')
    knex('photographers').select().then(photographers => {
        photographers.forEach(photographer => {
            photographer.links = JSON.parse(photographer.links)
            photographer.count = photos.filter(photo => photo.photographerId == photographer.id).length
        })
        photographers = photographers.filter(photographer => photographer.count > 0)
        res.json(photographers)
    })
})

router.get('/photographer/:id/all', (req, res) => {
    knex('photographers').where('id', req.params.id).select().then(photographers => {
        var photographer = photographers[0]
        if(photographer) {
            photographer.links = JSON.parse(photographer.links)
            knex('photos').where('photographerId', req.params.id).select().orderBy('updated_at', 'desc').then(photos => {
                photos.forEach(photo => {
                    photo.images = JSON.parse(photo.images)
                    photo.tags = JSON.parse(photo.tags)
                    photo.metadata = JSON.parse(photo.metadata)
                    photo.photographer = photographer
                    delete photo.photographerId
                })
                res.json({ success: true, photos: photos, photographer: photographer })
            })
        } else {
            res.json({ success: false })
        }
    })
})

router.get('/photographer/:id/all/user', authCheck, (req, res) => {
    knex('photographers').where('id', req.params.id).select().then(photographers => {
        var photographer = photographers[0]
        if(photographer) {
            photographer.links = JSON.parse(photographer.links)
            knex('photos').where('photographerId', req.params.id).where('addedByUserId', req.authUserId).select().orderBy('updated_at', 'desc').then(photos => {
                photos.forEach(photo => {
                    photo.images = JSON.parse(photo.images)
                    photo.tags = JSON.parse(photo.tags)
                    photo.metadata = JSON.parse(photo.metadata)
                    photo.photographer = photographer
                    delete photo.photographerId
                })
                res.json({ success: true, photos: photos, photographer: photographer })
            })
        } else {
            res.json({ success: false })
        }
    })
})

// GET all photos for authenticated user
router.get('/photo/all/user', authCheck, (req, res) => {
    var authUserId = req.authUserId // for some reason, if you don't call it outside the .then(() => {}) below, req.authUserId will be null
    getAllPhotographers().then(photographers => {
        knex('photos').where('addedByUserId', authUserId).select().orderBy('updated_at', 'desc').then(photos => {
            photos.forEach(photo => {
                photo.images = JSON.parse(photo.images)
                photo.tags = JSON.parse(photo.tags)
                photo.metadata = JSON.parse(photo.metadata)
                photo.photographer = photographers.find(photographer => photographer.id == photo.photographerId)
                delete photo.photographerId
            })
            res.json({ success: true, photos: photos })
        })
    })
})

router.get('/tag/:tag', (req, res) => {
    getAllPhotographers().then(photographers => {
        knex('photos').where('tags', 'like', `%${req.params.tag}%`).select().orderBy('updated_at', 'desc').then(photos => {
            photos.forEach(photo => {
                photo.images = JSON.parse(photo.images)
                photo.tags = JSON.parse(photo.tags)
                photo.metadata = JSON.parse(photo.metadata)
                photo.photographer = photographers.find(photographer => photographer.id == photo.photographerId)
                delete photo.photographerId
            })
            res.json({ success: true, photos: photos })
        })
    })
})

router.get('/tag/:tag/user', authCheck, (req, res) => {
    var authUserId = req.authUserId
    getAllPhotographers().then(photographers => {
        knex('photos').where('tags', 'like', `%${req.params.tag}%`).where('addedByUserId', authUserId).select().orderBy('updated_at', 'desc').then(photos => {
            photos.forEach(photo => {
                photo.images = JSON.parse(photo.images)
                photo.tags = JSON.parse(photo.tags)
                photo.metadata = JSON.parse(photo.metadata)
                photo.photographer = photographers.find(photographer => photographer.id == photo.photographerId)
                delete photo.photographerId
            })
            res.json({ success: true, photos: photos })
        })
    })
})

const scrapers = require('./scrapers')

router.post('/add-from', authCheck, async(req, res) => {
    var photo = {}

    if(req.body.instagram) {
        photo = await scrapers.instagram(req.body.instagram)
    }

    if(req.body.tumblr) {
        photo = await scrapers.tumblr(req.body.tumblr)
    }

    if(req.body.flickr) {
        photo = await scrapers.flickr(req.body.flickr)
    }

    if(req.body.twitter) {
        photo = await scrapers.twitter(req.body.twitter)
    }

    if(req.body.deviantart) {
        photo = await scrapers.deviantart(req.body.deviantart)
    }

    if(req.body.reddit) {
        photo = await scrapers.reddit(req.body.reddit)
    }

    if(photo.error) {
        res.json({
            success: false,
            error: error.message
        })
    }

    try {
        var existingPhotographer = await knex('photographers').where('links', 'like', `%${photo.photographerLink}%`).select('id')
        var photographerId = null
        if(existingPhotographer[0]) {
            photographerId = existingPhotographer[0].id
        } else {
            var insertedIds = await knex('photographers').insert({
                name: photo.photographerName,
                links: JSON.stringify([ photo.photographerLink ]),
                addedByUserId: req.authUserId
            }, 'id')
            photographerId = insertedIds[0]
        }


        var images = []
        for(let image of photo.images) {
            let filename = getFileNameFromURL(image)
            filename = prependDateTimeToString(filename)
            let imageSavePath = path.join(uploadsDir, filename)
            await downloadImage(image, imageSavePath)
            let thumbnailSavePath = path.join(thumbnailsDir, filename)
            generateThumbnail(imageSavePath, thumbnailSavePath)
            images.push(filename)
        }

        knex('photos').insert({
            title: photo.title,
            photographerId: photographerId,
            images: JSON.stringify(images),
            source: photo.source,
            addedByUserId: req.authUserId
        }, 'id').then(insertedIds => {
            res.json({
                success: true,
                message: 'Photo added',
                id: insertedIds[0]
            })
        })

    } catch(error) {
        res.json({
            success: false,
            error: error.message
        })
    }
})

app.use(process.env.BASE_URL, router)

app.listen(9883)