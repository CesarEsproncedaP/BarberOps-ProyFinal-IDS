import mongoose from 'mongoose'
import Cliente from '../models/Cliente.js'

const benefitFor = (contadorCortes) => {
  if (contadorCortes === 9) return '35% de descuento o producto gratis'
  if (contadorCortes === 6) return 'Producto gratis'
  if (contadorCortes === 3) return '20% de descuento'
  return null
}

const publicCliente = (cliente) => {
  const data = cliente.toObject ? cliente.toObject() : cliente
  return {
    ...data,
    beneficioLealtad: benefitFor(data.contadorCortes),
    puedePagarTransferencia: data.historialVisitas.length >= 5 && !data.metodoPagoRestringido,
  }
}

const populateClient = (query) => query
  .populate('historialVisitas.citaId', 'fecha horaInicio horaFin estado')
  .populate('historialVisitas.barbero', 'name email role')

const invalidAmount = (value) => typeof value !== 'number' || !Number.isFinite(value) || value <= 0

export const listClientes = async (req, res) => {
  const query = {}
  if (req.query.telefono !== undefined) query.telefono = String(req.query.telefono).trim()

  const clientes = await populateClient(Cliente.find(query).sort({ nombre: 1 }))
  return res.json({ clientes: clientes.map(publicCliente) })
}

export const getCliente = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Cliente no encontrado' })

  const cliente = await populateClient(Cliente.findById(req.params.id))
  if (!cliente) return res.status(404).json({ message: 'Cliente no encontrado' })
  return res.json({ cliente: publicCliente(cliente) })
}

export const getClienteByTelefono = async (req, res) => {
  const telefono = String(req.params.telefono).trim()
  if (!telefono) return res.status(400).json({ message: 'El teléfono es requerido' })

  const cliente = await populateClient(Cliente.findOne({ telefono }))
  if (!cliente) return res.status(404).json({ message: 'Cliente no encontrado' })
  return res.json({ cliente: publicCliente(cliente) })
}

export const updateAdeudo = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Cliente no encontrado' })

  const { monto, accion } = req.body
  if (invalidAmount(monto) || !['agregar', 'saldar'].includes(accion)) {
    return res.status(400).json({ message: 'Monto y acción de adeudo no son válidos' })
  }

  const cliente = await Cliente.findById(req.params.id)
  if (!cliente) return res.status(404).json({ message: 'Cliente no encontrado' })

  if (accion === 'agregar') {
    cliente.adeudo = Number((cliente.adeudo + monto).toFixed(2))
  } else {
    cliente.adeudo = Number(Math.max(0, cliente.adeudo - monto).toFixed(2))
  }
  cliente.metodoPagoRestringido = cliente.adeudo > 0
  await cliente.save()

  return res.json({ cliente: publicCliente(cliente) })
}
