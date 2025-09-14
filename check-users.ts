import { user } from './drizzle/schema'
import { getDatabase } from './src/db'

async function checkUsers() {
  try {
    const db = getDatabase()
    const result = await db.select().from(user)
    console.log('Users in database:', result)
  } catch (error) {
    console.error('Error checking users:', error)
  }
}

checkUsers()
