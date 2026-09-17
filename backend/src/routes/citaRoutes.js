import { Router } from 'express'
import { authenticate, requireRole } from '../middlewares/auth.js'
import { cancelCita, createCita, getCita, listCitas, updateCita } from '../controllers/citaController.js'

const router = Router()

router.use(authenticate)
router.post('/', requireRole('admin', 'recepcionista'), createCita)
router.get('/', listCitas)
router.get('/:id', getCita)
router.put('/:id', requireRole('admin', 'recepcionista'), updateCita)
router.patch('/:id/cancelar', requireRole('admin', 'recepcionista'), cancelCita)

export default router
