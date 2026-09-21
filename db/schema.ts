import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', {
  id: integer('id').primaryKey(),
  owner: text('owner').notNull(),
  state: text('state').notNull(),
  version: integer('version').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
