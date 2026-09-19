import MovimientoInventario from '../models/MovimientoInventario.js'
import Cita from '../models/Cita.js'
import CorteCaja from '../models/CorteCaja.js'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const parseDate = (value) => {
  if (!value || !datePattern.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const getRange = (fechaInicio, fechaFin) => {
  const now = new Date()
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const start = fechaInicio ? parseDate(fechaInicio) : defaultStart
  const endDate = fechaFin ? parseDate(fechaFin) : new Date(defaultEnd.getTime() - 1)
  const end = fechaFin ? new Date(parseDate(fechaFin).getTime() + 86400000) : defaultEnd
  if (!start || !endDate || start >= end) return null
  return { start, end }
}

const dateQuery = (range) => ({ fecha: { $gte: range.start, $lt: range.end } })

export const ingresos = async (req, res) => {
  const range = getRange(req.query.fechaInicio, req.query.fechaFin)
  if (!range) return res.status(400).json({ message: 'El rango de fechas no es válido' })

  const citas = await Cita.find({ ...dateQuery(range), estado: 'completada' })
    .populate('barbero', 'name email role')
    .populate('creadoPor', 'name email role')
  const movimientos = await MovimientoInventario.find({ ...dateQuery(range), tipoMovimiento: 'venta', gratis: false })
    .populate('producto', 'nombre precio')

  const porBarbero = {}
  const porServicio = {}
  const porRecepcionista = {}
  for (const cita of citas) {
    const barberName = cita.barbero?.name || 'Sin barbero'
    porBarbero[barberName] = (porBarbero[barberName] || 0) + (cita.precioFinal || 0)
    porServicio[cita.servicio] = (porServicio[cita.servicio] || 0) + (cita.precioFinal || 0)
    const receptionistName = cita.creadoPor?.name || 'Sin recepcionista'
    porRecepcionista[receptionistName] = (porRecepcionista[receptionistName] || 0) + (cita.precioFinal || 0)
  }
  const ingresosCitas = citas.reduce((total, cita) => total + (cita.precioFinal || 0), 0)
  const ingresosProductos = movimientos.reduce((total, movimiento) => total + ((movimiento.producto?.precio || 0) * movimiento.cantidad), 0)

  return res.json({
    rango: { fechaInicio: range.start.toISOString().slice(0, 10), fechaFin: new Date(range.end.getTime() - 86400000).toISOString().slice(0, 10) },
    ingresosCitas,
    ingresosProductos,
    ingresosTotales: ingresosCitas + ingresosProductos,
    porBarbero,
    porServicio,
    porRecepcionista,
  })
}

export const ocupacion = async (req, res) => {
  const range = getRange(req.query.fechaInicio, req.query.fechaFin)
  if (!range) return res.status(400).json({ message: 'El rango de fechas no es válido' })
  const citas = await Cita.find(dateQuery(range)).populate('barbero', 'name email role')
  const porBarbero = {}
  for (const cita of citas) {
    const name = cita.barbero?.name || 'Sin barbero'
    if (!porBarbero[name]) porBarbero[name] = { completadas: 0, canceladas: 0, agendadas: 0 }
    if (cita.estado === 'completada') porBarbero[name].completadas += 1
    if (cita.estado === 'cancelada') porBarbero[name].canceladas += 1
    if (cita.estado === 'agendada') porBarbero[name].agendadas += 1
  }
  return res.json({ rango: { fechaInicio: range.start.toISOString().slice(0, 10), fechaFin: new Date(range.end.getTime() - 86400000).toISOString().slice(0, 10) }, porBarbero })
}

export const corteCaja = async (req, res) => {
  const date = parseDate(req.query.fecha)
  if (!date) return res.status(400).json({ message: 'La fecha debe tener formato YYYY-MM-DD' })
  const nextDate = new Date(date.getTime() + 86400000)
  const query = { fecha: { $gte: date, $lt: nextDate }, estado: 'completada' }
  const existingClosure = await CorteCaja.findOne({ fecha: date, registradoPor: req.user._id })
  if (existingClosure) query.createdAt = { $gt: existingClosure.cerradoEn }
  if (req.user.role === 'recepcionista') {
    query.creadoPor = req.user._id
  }

  const citas = await Cita.find(query).populate('creadoPor', 'name email role').populate('barbero', 'name email role')
  const movementQuery = { fecha: { $gte: date, $lt: nextDate }, tipoMovimiento: 'venta', gratis: false }
  if (existingClosure) movementQuery.createdAt = { $gt: existingClosure.cerradoEn }
  if (req.user.role === 'recepcionista') movementQuery.registradoPor = req.user._id
  const movimientos = await MovimientoInventario.find(movementQuery).populate('producto', 'nombre precio').populate('registradoPor', 'name email role')
  const turnos = {}
  for (const cita of citas) {
    const key = cita.creadoPor?._id.toString() || 'sin-registrador'
    if (!turnos[key]) turnos[key] = { registradoPor: cita.creadoPor, totalEfectivo: 0, totalTransferencia: 0, propinasEfectivo: 0, propinasTransferencia: 0, totalPropinas: 0, citas: [], movimientos: [] }
    const amount = cita.precioFinal || 0
    const tip = cita.propina || 0
    if (cita.metodoPago === 'transferencia') {
      turnos[key].totalTransferencia += amount + tip
      turnos[key].propinasTransferencia += tip
    } else {
      turnos[key].totalEfectivo += amount + tip
      turnos[key].propinasEfectivo += tip
    }
    turnos[key].totalPropinas += tip
    turnos[key].citas.push(cita)
  }
  for (const movimiento of movimientos) {
    const key = movimiento.registradoPor?._id.toString() || 'sin-registrador'
    if (!turnos[key]) turnos[key] = { registradoPor: movimiento.registradoPor, totalEfectivo: 0, totalTransferencia: 0, propinasEfectivo: 0, propinasTransferencia: 0, totalPropinas: 0, citas: [], movimientos: [] }
    turnos[key].totalEfectivo += (movimiento.producto?.precio || 0) * movimiento.cantidad
    turnos[key].movimientos.push(movimiento)
  }
  return res.json({ fecha: req.query.fecha, cerrado: Boolean(existingClosure && citas.length === 0), totalEfectivo: Object.values(turnos).reduce((sum, turno) => sum + turno.totalEfectivo, 0), totalTransferencia: Object.values(turnos).reduce((sum, turno) => sum + turno.totalTransferencia, 0), propinasEfectivo: Object.values(turnos).reduce((sum, turno) => sum + turno.propinasEfectivo, 0), propinasTransferencia: Object.values(turnos).reduce((sum, turno) => sum + turno.propinasTransferencia, 0), totalPropinas: Object.values(turnos).reduce((sum, turno) => sum + turno.totalPropinas, 0), turnos: Object.values(turnos) })
}

export const cerrarCaja = async (req, res) => {
  const date = parseDate(req.body.fecha || new Date().toISOString().slice(0, 10))
  if (!date) return res.status(400).json({ message: 'La fecha debe tener formato YYYY-MM-DD' })
  const nextDate = new Date(date.getTime() + 86400000)
  const closeQuery = { fecha: { $gte: date, $lt: nextDate }, estado: 'completada' }
  if (req.user.role === 'recepcionista') closeQuery.creadoPor = req.user._id
  const citas = await Cita.find(closeQuery)
  const movementQuery = { fecha: { $gte: date, $lt: nextDate }, tipoMovimiento: 'venta', gratis: false }
  if (req.user.role === 'recepcionista') movementQuery.registradoPor = req.user._id
  const movimientos = await MovimientoInventario.find(movementQuery).populate('producto', 'precio')
  const propinasEfectivo = citas.filter((cita) => cita.metodoPago !== 'transferencia').reduce((sum, cita) => sum + (cita.propina || 0), 0)
  const propinasTransferencia = citas.filter((cita) => cita.metodoPago === 'transferencia').reduce((sum, cita) => sum + (cita.propina || 0), 0)
  const totalEfectivo = citas.filter((cita) => cita.metodoPago !== 'transferencia').reduce((sum, cita) => sum + (cita.precioFinal || 0) + (cita.propina || 0), 0)
    + movimientos.reduce((sum, movimiento) => sum + (movimiento.producto?.precio || 0) * movimiento.cantidad, 0)
  const totalTransferencia = citas.filter((cita) => cita.metodoPago === 'transferencia').reduce((sum, cita) => sum + (cita.precioFinal || 0) + (cita.propina || 0), 0)
  const corte = await CorteCaja.findOneAndUpdate(
    { fecha: date, registradoPor: req.user._id },
    { fecha: date, registradoPor: req.user._id, totalEfectivo, totalTransferencia, propinasEfectivo, propinasTransferencia, totalPropinas: propinasEfectivo + propinasTransferencia, citas: citas.map((cita) => cita._id), movimientos: movimientos.map((movimiento) => movimiento._id), cerradoEn: new Date() },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
  return res.status(201).json({ corte, cerrado: true })
}

export const propinas = async (req, res) => {
  if (req.user.role === 'recepcionista') return res.status(403).json({ message: 'Las propinas no están disponibles para recepcionistas' })
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const mondayOffset = (today.getUTCDay() + 6) % 7
  const start = new Date(today.getTime() - mondayOffset * 86400000)
  const end = new Date(start.getTime() + 7 * 86400000)
  const query = { fecha: { $gte: start, $lt: end }, estado: 'completada' }
  if (req.user.role === 'barbero') query.barbero = req.user._id
  const citas = await Cita.find(query).populate('barbero', 'name email role')
  const byBarber = {}
  for (const cita of citas) {
    const key = cita.barbero?._id.toString() || 'sin-barbero'
    if (!byBarber[key]) byBarber[key] = { barbero: cita.barbero, total: 0 }
    byBarber[key].total += cita.propina || 0
  }
  const porBarbero = Object.values(byBarber)
  return res.json({ fechaInicio: start.toISOString().slice(0, 10), fechaFin: new Date(end.getTime() - 86400000).toISOString().slice(0, 10), total: porBarbero.reduce((sum, item) => sum + item.total, 0), porBarbero })
}
