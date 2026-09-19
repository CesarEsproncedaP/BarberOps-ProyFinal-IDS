import { Router } from 'express'
import { authenticate, requireRole } from '../middlewares/auth.js'
import { createMovimiento, createProducto, createVentaMultiple, listMovimientos, listProductos } from '../controllers/inventarioController.js'

const router = Router()
const staffOnly = [authenticate, requireRole('admin', 'recepcionista')]

router.get('/', ...staffOnly, listProductos)
router.post('/', ...staffOnly, createProducto)
router.post('/venta', ...staffOnly, createVentaMultiple)
router.post('/:id/movimiento', ...staffOnly, createMovimiento)
router.get('/:id/movimientos', ...staffOnly, listMovimientos)

export default router
