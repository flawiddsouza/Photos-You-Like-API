exports.up = knex => {
    return knex.schema
        .createTable('users', table => {
            table.increments('id').primary()
            table.string('googleUserId')
            table.string('name')
            table.timestamps(true, true)
        })
        .createTable('photographers', table => {
            table.increments('id').primary()
            table.string('name')
            table.text('links')
            table
                .integer('addedByUserId')
                .unsigned()
                .references('id')
                .inTable('users')
            table.timestamps(true, true)
        })
        .createTable('photos', table => {
            table.increments('id').primary()
            table.string('title')
            table.
                integer('photographerId')
                .unsigned()
                .references('id')
                .inTable('photographers')
            table.text('images')
            table.string('source')
            table.text('tags')
                .defaultTo('[]')
            table.text('note')
            table.text('metadata') // can include taken on, camera used, lens used etc
            table
                .integer('addedByUserId')
                .unsigned()
                .references('id')
                .inTable('users')
            table.timestamps(true, true)
        })
}

exports.down = knex => {
    return knex.schema
        .dropTableIfExists('photos')
        .dropTableIfExists('photographers')
        .dropTableIfExists('users')
}
