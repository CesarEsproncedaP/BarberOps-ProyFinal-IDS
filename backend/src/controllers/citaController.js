import mongoose from 'mongoose'
import Cliente from '../models/Cliente.js'
import Cita from '../models/Cita.js'
import { loyaltyBenefitFor, recordClientVisit } from '../services/clienteService.js'
import User from '../models/User.js'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const appointmentDurationMinutes = 45
const weekdayWindows = [
  ['11:00', '14:00'],
  ['15:00', '20:00'],
]
const saturdayWindows = [['11:00', '15:00']]

const normalizeDate = (value) => {
  if (typeof value !== 'string' || !datePattern.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return date
}

const publicCita = (cita) => cita

const minutesFromTime = (time) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

const getWorkingWindows = (date) => {
  const day = date.getUTCDay()
  if (day === 0) return []
  return day === 6 ? saturdayWindows : weekdayWindows
}

const validateTimeRange = (fecha, horaInicio, horaFin) => {
  if (!timePattern.test(horaInicio) || !timePattern.test(horaFin)) return false
  if (minutesFromTime(horaFin) - minutesFromTime(horaInicio) !== appointmentDurationMinutes) return false
  return getWorkingWindows(fecha).some(([windowStart, windowEnd]) => horaInicio >= windowStart && horaFin <= windowEnd)
}

const findBarber = async (barbero) => {
  if (!mongoose.isValidObjectId(barbero)) return null
  return User.findOne({ _id: barbero, role: 'barbero' })
}

const hasOverlap = async ({ barbero, fecha, horaInicio, horaFin, excludeId }) => {
  const query = {
    barbero,
    fecha,
    estado: { $ne: 'cancelada' },
    horaInicio: { $lt: horaFin },
    horaFin: { $gt: horaInicio },
  }

  if (excludeId) query._id = { $ne: excludeId }
  return Cita.exists(query)
}

const sendInvalidData = (res, message) => res.status(400).json({ message })

const normalizePhone = (value) => typeof value === 'string' ? value.trim() : ''

const serviceIncludesCut = (servicio) => /\bcorte\b/i.test(servicio)

export const createCita = async (req, res) => {
  const { clienteNombre, barbero, servicio, fecha, horaInicio, horaFin, notas } = req.body
  const clienteTelefono = normalizePhone(req.body.clienteTelefono)
  const incluyoCorte = req.body.incluyoCorte === undefined ? serviceIncludesCut(servicio || '') : req.body.incluyoCorte === true
  const normalizedDate = normalizeDate(fecha)

  if (!clienteNombre || !clienteTelefono || !barbero || !servicio || !normalizedDate || !validateTimeRange(normalizedDate, horaInicio, horaFin)) {
    return sendInvalidData(res, 'Los datos de la cita no son válidos')
  }

  if (!(await findBarber(barbero))) return sendInvalidData(res, 'El usuario seleccionado no es un barbero válido')
  if (await hasOverlap({ barbero, fecha: normalizedDate, horaInicio, horaFin })) {
    return res.status(409).json({ message: 'El barbero ya tiene una cita en ese horario' })
  }

  const cita = await Cita.create({
    clienteNombre,
    clienteTelefono,
    barbero,
    servicio,
    incluyoCorte,
    fecha: normalizedDate,
    horaInicio,
    horaFin,
    notas,
    creadoPor: req.user._id,
  })

  await recordClientVisit({ cita, clienteNombre, clienteTelefono, barbero, servicio, incluyoCorte })

  return res.status(201).json({ cita: await Cita.findById(cita._id).populate('barbero', 'name email role').populate('creadoPor', 'name email role') })
}

export const listCitas = async (req, res) => {
  const query = {}
  if (req.user.role === 'barbero') query.barbero = req.user._id

  if (req.query.fecha !== undefined) {
    const date = normalizeDate(req.query.fecha)
    if (!date) return sendInvalidData(res, 'El filtro fecha debe tener formato YYYY-MM-DD')
    query.fecha = date
  }

  const citas = await Cita.find(query)
    .sort({ fecha: 1, horaInicio: 1 })
    .populate('barbero', 'name email role')
    .populate('creadoPor', 'name email role')

  return res.json({ citas })
}

export const getCita = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Cita no encontrada' })

  const query = { _id: req.params.id }
  if (req.user.role === 'barbero') query.barbero = req.user._id

  const cita = await Cita.findOne(query).populate('barbero', 'name email role').populate('creadoPor', 'name email role')
  if (!cita) return res.status(404).json({ message: 'Cita no encontrada' })
  return res.json({ cita })
}

export const updateCita = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Cita no encontrada' })

  const cita = await Cita.findById(req.params.id)
  if (!cita) return res.status(404).json({ message: 'Cita no encontrada' })

  const fields = ['clienteNombre', 'clienteTelefono', 'barbero', 'servicio', 'fecha', 'horaInicio', 'horaFin', 'notas']
  const updates = Object.fromEntries(fields.filter((field) => req.body[field] !== undefined).map((field) => [field, req.body[field]]))
  const nextDate = req.body.fecha === undefined ? cita.fecha : normalizeDate(req.body.fecha)
  const nextStart = req.body.horaInicio === undefined ? cita.horaInicio : req.body.horaInicio
  const nextEnd = req.body.horaFin === undefined ? cita.horaFin : req.body.horaFin
  const nextBarber = req.body.barbero === undefined ? cita.barbero.toString() : req.body.barbero

  if (!nextDate || !validateTimeRange(nextDate, nextStart, nextEnd)) return sendInvalidData(res, 'Los datos de la cita no son válidos')
  if (!(await findBarber(nextBarber))) return sendInvalidData(res, 'El usuario seleccionado no es un barbero válido')
  if (await hasOverlap({ barbero: nextBarber, fecha: nextDate, horaInicio: nextStart, horaFin: nextEnd, excludeId: cita._id })) {
    return res.status(409).json({ message: 'El barbero ya tiene una cita en ese horario' })
  }

  Object.assign(cita, { ...updates, fecha: nextDate, horaInicio: nextStart, horaFin: nextEnd, barbero: nextBarber })
  await cita.save()

  return res.json({ cita: await Cita.findById(cita._id).populate('barbero', 'name email role').populate('creadoPor', 'name email role') })
}

export const cancelCita = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Cita no encontrada' })

  const cita = await Cita.findById(req.params.id)
  if (!cita) return res.status(404).json({ message: 'Cita no encontrada' })

  cita.estado = 'cancelada'
  await cita.save()
  return res.json({ cita })
}

export const completeCita = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Cita no encontrada' })

  const { precioBase, metodoPago } = req.body
  if (typeof precioBase !== 'number' || !Number.isFinite(precioBase) || precioBase < 0
    || !['efectivo', 'transferencia'].includes(metodoPago)) {
    return res.status(400).json({ message: 'Precio y método de pago no son válidos' })
  }

  const cita = await Cita.findById(req.params.id)
  if (!cita) return res.status(404).json({ message: 'Cita no encontrada' })
  if (cita.estado === 'completada' || cita.estado === 'cancelada') {
    return res.status(400).json({ message: 'La cita ya no puede completarse' })
  }

  const cliente = await Cliente.findOne({ telefono: cita.clienteTelefono })
  if (!cliente) return res.status(400).json({ message: 'No se encontró la ficha del cliente' })
  if (metodoPago === 'transferencia' && (cliente.historialVisitas.length < 5 || cliente.metodoPagoRestringido)) {
    const reason = cliente.metodoPagoRestringido ? 'tiene un adeudo pendiente' : 'tiene menos de 5 visitas registradas'
    return res.status(400).json({ message: `No puede pagar por transferencia porque ${reason}` })
  }

  const totalCortes = cliente.historialVisitas.filter((visit) => visit.incluyoCorte).length
  const benefit = loyaltyBenefitFor(cliente.contadorCortes, totalCortes)
  cita.precioBase = precioBase
  cita.precioFinal = benefit ? Number((precioBase * benefit.priceMultiplier).toFixed(2)) : precioBase
  cita.metodoPago = metodoPago
  cita.beneficioAplicado = benefit?.label
  cita.estado = 'completada'
  await cita.save()

  return res.json({ cita })
}
