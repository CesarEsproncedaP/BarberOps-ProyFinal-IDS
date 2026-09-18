import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import authRoutes from './routes/authRoutes.js'
import citaRoutes from './routes/citaRoutes.js'
import clienteRoutes from './routes/clienteRoutes.js'
import inventarioRoutes from './routes/inventarioRoutes.js'
import reporteRoutes from './routes/reporteRoutes.js'

const app = express()

app.disable('x-powered-by')
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
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
app.use('/api/citas', citaRoutes)
app.use('/api/clientes', clienteRoutes)
app.use('/api/inventario', inventarioRoutes)
app.use('/api/reportes', reporteRoutes)

app.use((error, req, res, next) => {
  console.error(error)
  res.status(500).json({ message: 'Internal server error' })
})

export default app
