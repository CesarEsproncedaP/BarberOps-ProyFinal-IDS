import 'dotenv/config'
import app from './app.js'
import { connectDatabase } from './config/db.js'

const port = process.env.PORT || 5000

try {
  await connectDatabase()
  app.listen(port, () => console.log(`BarberOps API listening on port ${port}`))
} catch (error) {
  console.error('Unable to start server', error)
  process.exit(1)
}
