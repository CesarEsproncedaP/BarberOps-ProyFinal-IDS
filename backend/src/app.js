import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import authRoutes from './routes/authRoutes.js'

const app = express()

app.disable('x-powered-by')
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        childSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        manifestSrc: ["'self'"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        scriptSrcElem: ["'self'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        styleSrcAttr: ["'unsafe-inline'"],
        styleSrcElem: ["'self'", 'https:', "'unsafe-inline'"],
        workerSrc: ["'self'"],
      },
    },
  }),
)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
app.use(express.json())
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'barberops-api' }))
app.use('/api/auth', authRoutes)

app.use((error, req, res, next) => {
  console.error(error)
  res.status(500).json({ message: 'Internal server error' })
})

export default app
