import { Router } from 'express'
import { getCurrentUser, listBarbers, login, register } from '../controllers/authController.js'
import { authenticate, requireRole } from '../middlewares/auth.js'

const router = Router()

router.post('/register', authenticate, requireRole('admin'), register)
router.post('/login', login)
router.get('/me', authenticate, getCurrentUser)
router.get('/barberos', authenticate, requireRole('admin', 'recepcionista'), listBarbers)

export default router
