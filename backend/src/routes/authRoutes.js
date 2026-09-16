import { Router } from 'express'
import { getCurrentUser, login, register } from '../controllers/authController.js'
import { authenticate, requireRole } from '../middlewares/auth.js'

const router = Router()

router.post('/register', authenticate, requireRole('admin'), register)
router.post('/login', login)
router.get('/me', authenticate, getCurrentUser)

export default router
