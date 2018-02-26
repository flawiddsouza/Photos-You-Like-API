const path = require('path')

const uploadsDir = path.join(__dirname, '..', 'public', 'images')

const sharp = require('sharp')
const thumbnailsDir = path.join(uploadsDir, 'thumbnails')
const thumbnailWidth = 315

const fs = require('fs')

fs.readdirSync(uploadsDir).forEach(file => {
    var fileExtension = path.extname(file)
    if(fileExtension === '.jpg' || fileExtension === '.png' || fileExtension === '.png_large') { // .png_large is for images added from twitter scraping
        let imagePath = path.join(uploadsDir, file)
        console.log(imagePath)
        let thumbnailSavePath = path.join(thumbnailsDir, file)
        sharp(imagePath).resize(thumbnailWidth).jpeg({ quality: 95 }).toFile(thumbnailSavePath).then(data => {
            console.log(thumbnailSavePath)
        })
    }
})
