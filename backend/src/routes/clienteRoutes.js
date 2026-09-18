import { Router } from 'express'
import { authenticate, requireRole } from '../middlewares/auth.js'
import { getCliente, getClienteByTelefono, listClientes, updateAdeudo } from '../controllers/clienteController.js'

const router = Router()
const staffOnly = [authenticate, requireRole('admin', 'recepcionista')]

router.get('/', ...staffOnly, listClientes)
router.get('/telefono/:telefono', ...staffOnly, getClienteByTelefono)
router.get('/:id', ...staffOnly, getCliente)
router.patch('/:id/adeudo', ...staffOnly, updateAdeudo)

export default router
