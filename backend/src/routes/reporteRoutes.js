import { Router } from 'express'
import { authenticate, requireRole } from '../middlewares/auth.js'
import { corteCaja, ingresos, ocupacion } from '../controllers/reporteController.js'

const router = Router()

router.get('/ingresos', authenticate, requireRole('admin'), ingresos)
router.get('/ocupacion', authenticate, requireRole('admin'), ocupacion)
router.get('/corte-caja', authenticate, requireRole('admin', 'recepcionista'), corteCaja)

export default router
