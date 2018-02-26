const path = require('path')

const uploadsDir = path.join(__dirname, '..', 'public', 'images')

const sharp = require('sharp')
const thumbnailsDir = path.join(uploadsDir, 'thumbnails')
const thumbnailWidth = 315

const fs = require('fs')

fs.readdirSync(uploadsDir).forEach(file => {
    var fileExtension = path.extname(file)
    // .png:large, .jpg:large are for images added from twitter scraping
    // in windows, they are stored as .png_large & .jpg_large
    if(fileExtension === '.jpg' || fileExtension === '.png' || fileExtension === '.png:large' || fileExtension === '.jpg:large'|| fileExtension === '.png_large' || fileExtension === '.jpg_large') {
        let imagePath = path.join(uploadsDir, file)
        let thumbnailSavePath = path.join(thumbnailsDir, file)
        sharp(fs.readFileSync(imagePath)).resize(thumbnailWidth).jpeg({ quality: 95 }).toFile(thumbnailSavePath).then(data => {
            console.log(thumbnailSavePath)
        }).catch(e => console.log(file, e))
    }
})
