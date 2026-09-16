import 'dotenv/config'
import express from 'express'
import authRoutes from './routes/authRoutes.js'

const app = express()

app.use(express.json())
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'barberops-api' }))
app.use('/api/auth', authRoutes)

app.use((error, req, res, next) => {
  console.error(error)
  res.status(500).json({ message: 'Internal server error' })
})

export default app
