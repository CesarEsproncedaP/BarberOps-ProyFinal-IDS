import mongoose from 'mongoose'
import MovimientoInventario from '../models/MovimientoInventario.js'
import Producto from '../models/Producto.js'
import { recordClientPurchase } from '../services/clienteService.js'

const movementTypes = ['entrada', 'salida_uso', 'venta']
const productTypes = ['insumo', 'venta']

const invalidNumber = (value, allowZero = false) => typeof value !== 'number'
  || !Number.isFinite(value)
  || (allowZero ? value < 0 : value <= 0)

const publicProducto = (producto) => {
  const data = producto.toObject ? producto.toObject() : producto
  return { ...data, necesitaReabastecimiento: data.stockActual < data.stockMinimo }
}

export const createProducto = async (req, res) => {
  const { nombre, tipo, stockActual = 0, stockMinimo = 5, precio = 0, unidad } = req.body
  if (!nombre || !productTypes.includes(tipo) || !unidad
    || invalidNumber(stockActual, true) || invalidNumber(stockMinimo, true)
    || invalidNumber(precio, true) || (tipo === 'venta' && req.body.precio === undefined)) {
    return res.status(400).json({ message: 'Los datos del producto no son válidos' })
  }

  const producto = await Producto.create({ nombre, tipo, stockActual, stockMinimo, precio, unidad })
  return res.status(201).json({ producto: publicProducto(producto) })
}

export const listProductos = async (req, res) => {
  const query = {}
  if (req.query.tipo !== undefined) {
    if (!productTypes.includes(req.query.tipo)) return res.status(400).json({ message: 'El tipo de producto no es válido' })
    query.tipo = req.query.tipo
  }

  const productos = await Producto.find(query).sort({ nombre: 1 })
  return res.json({ productos: productos.map(publicProducto) })
}

export const createMovimiento = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Producto no encontrado' })

  const { tipoMovimiento, cantidad, gratis = false, clienteTelefono, clienteNombre } = req.body
  const normalizedClientPhone = typeof clienteTelefono === 'string' ? clienteTelefono.trim() : clienteTelefono
  if (!movementTypes.includes(tipoMovimiento) || invalidNumber(cantidad) || typeof gratis !== 'boolean') {
    return res.status(400).json({ message: 'Los datos del movimiento no son válidos' })
  }
  if (gratis && tipoMovimiento !== 'venta') return res.status(400).json({ message: 'El movimiento gratis debe ser una venta' })

  const producto = await Producto.findById(req.params.id)
  if (!producto) return res.status(404).json({ message: 'Producto no encontrado' })

  const stockDelta = tipoMovimiento === 'entrada' ? cantidad : -cantidad
  if (producto.stockActual + stockDelta < 0) return res.status(400).json({ message: 'Stock insuficiente para este movimiento' })

  producto.stockActual += stockDelta
  await producto.save()

  const movimiento = await MovimientoInventario.create({
    producto: producto._id,
    tipoMovimiento,
    cantidad,
    gratis,
    clienteTelefono: tipoMovimiento === 'venta' ? normalizedClientPhone || undefined : undefined,
    registradoPor: req.user._id,
  })

  if (tipoMovimiento === 'venta' && normalizedClientPhone) {
    await recordClientPurchase({
      clienteNombre,
      clienteTelefono: normalizedClientPhone,
      producto: producto.nombre,
      precio: gratis ? 0 : producto.precio * cantidad,
      fecha: movimiento.fecha,
    })
  }

  return res.status(201).json({ producto: publicProducto(producto), movimiento })
}

export const listMovimientos = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Producto no encontrado' })
  if (!(await Producto.exists({ _id: req.params.id }))) return res.status(404).json({ message: 'Producto no encontrado' })

  const movimientos = await MovimientoInventario.find({ producto: req.params.id })
    .sort({ fecha: -1 })
    .populate('registradoPor', 'name email role')
  return res.json({ movimientos })
}
