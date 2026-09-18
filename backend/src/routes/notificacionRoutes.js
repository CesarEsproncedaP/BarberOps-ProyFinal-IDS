import { Router } from 'express'
import { authenticate, requireRole } from '../middlewares/auth.js'
import { listNotifications, sendReminder } from '../controllers/notificacionController.js'

const router = Router()

router.post('/recordatorio/:citaId', authenticate, requireRole('admin', 'recepcionista'), sendReminder)
router.get('/', authenticate, requireRole('admin'), listNotifications)

export default router
