import { Router } from 'express'
import { authenticate, requireRole } from '../middlewares/auth.js'
import { cerrarCaja, corteCaja, ingresos, ocupacion, propinas } from '../controllers/reporteController.js'

const router = Router()

router.get('/ingresos', authenticate, requireRole('admin'), ingresos)
router.get('/ocupacion', authenticate, requireRole('admin'), ocupacion)
router.get('/corte-caja', authenticate, requireRole('admin', 'recepcionista'), corteCaja)
router.post('/corte-caja/cerrar', authenticate, requireRole('admin', 'recepcionista'), cerrarCaja)
router.get('/propinas', authenticate, propinas)

export default router
