import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import { connectDatabase } from '../src/config/db.js'
import Cita from '../src/models/Cita.js'
import Cliente from '../src/models/Cliente.js'
import Producto from '../src/models/Producto.js'
import User from '../src/models/User.js'

let mongoServer
let adminToken
let recepcionistaToken
let secondRecepcionistaToken
let barberoOne
let barberoTwo

const password = 'password-123'
const createUser = async (overrides) => User.create({ ...overrides, password: await bcrypt.hash(password, 10) })
const tokenFor = (user) => jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET)
const dataFor = (overrides = {}) => ({
  clienteNombre: 'Cliente Reportes', clienteTelefono: '555-0606', barbero: barberoOne._id.toString(), servicio: 'Corte',
  fecha: '2026-09-21', horaInicio: '11:00', horaFin: '11:45', ...overrides,
})
const createAppointment = (token, overrides = {}) => request(app).post('/api/citas').set('Authorization', `Bearer ${token}`).send(dataFor(overrides))
const complete = (token, id, body = { precioBase: 100, metodoPago: 'efectivo' }) => request(app).patch(`/api/citas/${id}/completar`).set('Authorization', `Bearer ${token}`).send(body)

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  mongoServer = await MongoMemoryServer.create()
  process.env.MONGO_URI = mongoServer.getUri()
  await connectDatabase()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Cliente.deleteMany({}), Cita.deleteMany({}), Producto.deleteMany({})])
  const users = await Promise.all([
    createUser({ name: 'Admin', email: 'admin-reportes@test.local', role: 'admin' }),
    createUser({ name: 'Recepcionista Uno', email: 'recep-uno-reportes@test.local', role: 'recepcionista' }),
    createUser({ name: 'Recepcionista Dos', email: 'recep-dos-reportes@test.local', role: 'recepcionista' }),
    createUser({ name: 'Barbero Uno', email: 'barbero-uno-reportes@test.local', role: 'barbero' }),
    createUser({ name: 'Barbero Dos', email: 'barbero-dos-reportes@test.local', role: 'barbero' }),
  ])
  barberoOne = users[3]
  barberoTwo = users[4]
  adminToken = tokenFor(users[0])
  recepcionistaToken = tokenFor(users[1])
  secondRecepcionistaToken = tokenFor(users[2])
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

describe('cobro y reportes integration', () => {
  it('completes without loyalty benefit at the base price', async () => {
    const created = await createAppointment(recepcionistaToken, { servicio: 'Barba', incluyoCorte: false })
    const response = await complete(recepcionistaToken, created.body.cita._id, { precioBase: 180, metodoPago: 'efectivo' })
    expect(response.status).toBe(200)
    expect(response.body.cita).toMatchObject({ estado: 'completada', precioBase: 180, precioFinal: 180, metodoPago: 'efectivo' })
  })

  it('uses the service price by default and records a tip', async () => {
    const created = await createAppointment(recepcionistaToken, { servicio: 'Barba' })
    const response = await request(app)
      .patch(`/api/citas/${created.body.cita._id}/completar`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ metodoPago: 'efectivo', propina: 35 })

    expect(response.status).toBe(200)
    expect(response.body.cita).toMatchObject({ precioBase: 150, precioFinal: 150, propina: 35 })
  })

  it('returns weekly tips by role and blocks reception', async () => {
    const created = await createAppointment(recepcionistaToken)
    await complete(recepcionistaToken, created.body.cita._id, { precioBase: 100, metodoPago: 'efectivo' })
    await Cita.updateOne({ _id: created.body.cita._id }, { $set: { propina: 25, fecha: new Date() } })
    const admin = await request(app).get('/api/reportes/propinas').set('Authorization', `Bearer ${adminToken}`)
    const reception = await request(app).get('/api/reportes/propinas').set('Authorization', `Bearer ${recepcionistaToken}`)
    expect(admin.status).toBe(200)
    expect(admin.body.total).toBe(25)
    expect(reception.status).toBe(403)
  })

  it('rebuilds a missing client ficha for a legacy appointment when charging', async () => {
    const created = await createAppointment(recepcionistaToken, { clienteTelefono: '555-0611' })
    await Cliente.deleteOne({ telefono: '555-0611' })

    const response = await complete(recepcionistaToken, created.body.cita._id, { precioBase: 120, metodoPago: 'efectivo' })

    expect(response.status).toBe(200)
    expect(await Cliente.exists({ telefono: '555-0611' })).not.toBeNull()
  })

  it('applies 20 percent discount on the third cut', async () => {
    const dates = ['2026-09-21', '2026-09-22', '2026-09-23']
    let last
    for (const [index, fecha] of dates.entries()) last = await createAppointment(recepcionistaToken, { fecha, horaInicio: index === 2 ? '15:00' : '11:00', horaFin: index === 2 ? '15:45' : '11:45' })
    const response = await complete(recepcionistaToken, last.body.cita._id, { precioBase: 100, metodoPago: 'efectivo' })
    expect(response.body.cita).toMatchObject({ precioFinal: 80, beneficioAplicado: '20% descuento (3er corte)' })
  })

  it('makes the twelfth cut free and resets the loyalty counter', async () => {
    const dates = []
    const date = new Date('2026-09-21T00:00:00.000Z')
    while (dates.length < 12) {
      if (date.getUTCDay() !== 0) dates.push(date.toISOString().slice(0, 10))
      date.setUTCDate(date.getUTCDate() + 1)
    }
    let last
    for (const [index, fecha] of dates.entries()) {
      const saturday = new Date(`${fecha}T00:00:00.000Z`).getUTCDay() === 6
      last = await createAppointment(recepcionistaToken, { fecha, horaInicio: saturday ? '14:00' : index % 2 ? '15:00' : '11:00', horaFin: saturday ? '14:45' : index % 2 ? '15:45' : '11:45' })
    }
    const response = await complete(recepcionistaToken, last.body.cita._id, { precioBase: 250, metodoPago: 'efectivo' })
    const client = await Cliente.findOne({ telefono: '555-0606' })
    expect(response.body.cita).toMatchObject({ precioFinal: 0, beneficioAplicado: 'Corte normal gratis (12vo corte)' })
    expect(client.contadorCortes).toBe(0)
  })

  it.each([
    ['less than five visits', 1, false],
    ['pending debt', 5, true],
  ])('rejects transfer when client has %s', async (_description, visits, debt) => {
    for (let index = 0; index < visits; index += 1) {
      await createAppointment(recepcionistaToken, { clienteTelefono: `555-070${visits}`, fecha: `2026-09-${String(21 + index).padStart(2, '0')}`, horaInicio: '11:00', horaFin: '11:45' })
    }
    const client = await Cliente.findOne({ telefono: `555-070${visits}` })
    if (debt) {
      client.adeudo = 50
      client.metodoPagoRestringido = true
      await client.save()
    }
    const created = await createAppointment(recepcionistaToken, { clienteTelefono: `555-070${visits}`, fecha: '2026-10-05', horaInicio: '11:00', horaFin: '11:45' })
    const response = await complete(recepcionistaToken, created.body.cita._id, { precioBase: 100, metodoPago: 'transferencia' })
    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/transferencia/i)
  })

  it('restricts income and occupancy reports to admin', async () => {
    const income = await request(app).get('/api/reportes/ingresos').set('Authorization', `Bearer ${recepcionistaToken}`)
    const occupancy = await request(app).get('/api/reportes/ocupacion').set('Authorization', `Bearer ${barberoOne ? tokenFor(barberoOne) : ''}`)
    expect(income.status).toBe(403)
    expect(occupancy.status).toBe(403)
  })

  it('rejects invalid report dates and returns occupancy counts', async () => {
    const invalidIncome = await request(app).get('/api/reportes/ingresos?fechaInicio=bad').set('Authorization', `Bearer ${adminToken}`)
    const invalidCash = await request(app).get('/api/reportes/corte-caja?fecha=bad').set('Authorization', `Bearer ${adminToken}`)
    const pending = await createAppointment(recepcionistaToken, { clienteTelefono: '555-0810' })
    const cancelled = await createAppointment(recepcionistaToken, { clienteTelefono: '555-0811', horaInicio: '12:00', horaFin: '12:45' })
    await request(app).patch(`/api/citas/${cancelled.body.cita._id}/cancelar`).set('Authorization', `Bearer ${recepcionistaToken}`)
    const occupancy = await request(app).get('/api/reportes/ocupacion?fechaInicio=2026-09-21&fechaFin=2026-09-21').set('Authorization', `Bearer ${adminToken}`)

    expect(invalidIncome.status).toBe(400)
    expect(invalidCash.status).toBe(400)
    expect(pending.status).toBe(201)
    expect(occupancy.body.porBarbero['Barbero Uno']).toMatchObject({ agendadas: 1, canceladas: 1, completadas: 0 })
  })

  it('sums income by barber for admin', async () => {
    const first = await createAppointment(recepcionistaToken, { clienteTelefono: '555-0801', barbero: barberoOne._id.toString(), fecha: '2026-09-21' })
    const second = await createAppointment(recepcionistaToken, { clienteTelefono: '555-0802', barbero: barberoTwo._id.toString(), fecha: '2026-09-21', horaInicio: '12:00', horaFin: '12:45' })
    await complete(recepcionistaToken, first.body.cita._id, { precioBase: 100, metodoPago: 'efectivo' })
    await complete(recepcionistaToken, second.body.cita._id, { precioBase: 80, metodoPago: 'efectivo' })
    const response = await request(app).get('/api/reportes/ingresos?fechaInicio=2026-09-21&fechaFin=2026-09-21').set('Authorization', `Bearer ${adminToken}`)
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ ingresosCitas: 180, ingresosTotales: 180 })
    expect(response.body.porBarbero['Barbero Uno']).toBe(100)
    expect(response.body.porBarbero['Barbero Dos']).toBe(80)
  })

  it('includes paid product sales in total income', async () => {
    const product = await Producto.create({ nombre: 'Shampoo', tipo: 'venta', stockActual: 5, stockMinimo: 1, precio: 40, unidad: 'pieza' })
    await request(app).post(`/api/inventario/${product._id}/movimiento`).set('Authorization', `Bearer ${recepcionistaToken}`).send({ tipoMovimiento: 'venta', cantidad: 2 })
    const today = new Date().toISOString().slice(0, 10)
    const response = await request(app).get(`/api/reportes/ingresos?fechaInicio=${today}&fechaFin=${today}`).set('Authorization', `Bearer ${adminToken}`)
    expect(response.body).toMatchObject({ ingresosCitas: 0, ingresosProductos: 80, ingresosTotales: 80 })
  })

  it('filters receptionist cash cut to their own completed appointments', async () => {
    const first = await createAppointment(recepcionistaToken, { clienteTelefono: '555-0901' })
    for (let index = 0; index < 4; index += 1) {
      await createAppointment(secondRecepcionistaToken, { clienteTelefono: '555-0902', fecha: `2026-09-${String(21 + index).padStart(2, '0')}` })
    }
    const existingClient = await Cliente.findOne({ telefono: '555-0902' })
    existingClient.historialVisitas.push({ citaId: new mongoose.Types.ObjectId(), fecha: new Date('2026-09-20T00:00:00.000Z'), barbero: barberoOne._id, servicio: 'Corte', incluyoCorte: true })
    await existingClient.save()
    const second = await createAppointment(secondRecepcionistaToken, { clienteTelefono: '555-0902', fecha: '2026-09-21', horaInicio: '12:00', horaFin: '12:45' })
    await complete(recepcionistaToken, first.body.cita._id, { precioBase: 100, metodoPago: 'efectivo' })
    await complete(secondRecepcionistaToken, second.body.cita._id, { precioBase: 200, metodoPago: 'transferencia' })
    const own = await request(app).get('/api/reportes/corte-caja?fecha=2026-09-21').set('Authorization', `Bearer ${recepcionistaToken}`)
    const admin = await request(app).get('/api/reportes/corte-caja?fecha=2026-09-21').set('Authorization', `Bearer ${adminToken}`)
    expect(own.body).toMatchObject({ totalEfectivo: 100, totalTransferencia: 0 })
    expect(admin.body).toMatchObject({ totalEfectivo: 100, totalTransferencia: 200 })
    expect(admin.body.turnos).toHaveLength(2)
  })

  it('closes a receptionist turn and keeps the historical total for admin', async () => {
    const created = await createAppointment(recepcionistaToken, { clienteTelefono: '555-0910' })
    await complete(recepcionistaToken, created.body.cita._id, { precioBase: 150, metodoPago: 'efectivo' })
    const closed = await request(app)
      .post('/api/reportes/corte-caja/cerrar')
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ fecha: '2026-09-21' })
    const ownAfterClose = await request(app)
      .get('/api/reportes/corte-caja?fecha=2026-09-21')
      .set('Authorization', `Bearer ${recepcionistaToken}`)
    const adminAfterClose = await request(app)
      .get('/api/reportes/corte-caja?fecha=2026-09-21')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(closed.status).toBe(201)
    expect(ownAfterClose.body).toMatchObject({ cerrado: true, totalEfectivo: 0, totalTransferencia: 0 })
    expect(adminAfterClose.body.totalEfectivo).toBe(150)
  })

  it('allows admin to close their own turn and then shows zero in the cash cut', async () => {
    const created = await createAppointment(adminToken, { clienteTelefono: '555-0920' })
    await complete(adminToken, created.body.cita._id, { precioBase: 200, metodoPago: 'efectivo' })
    const closed = await request(app)
      .post('/api/reportes/corte-caja/cerrar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fecha: '2026-09-21' })
    const afterClose = await request(app)
      .get('/api/reportes/corte-caja?fecha=2026-09-21')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(closed.status).toBe(201)
    expect(afterClose.body).toMatchObject({ cerrado: true, totalEfectivo: 0, totalTransferencia: 0 })
  })

  it('counts new payments made after a previous turn closure', async () => {
    const first = await createAppointment(recepcionistaToken, { clienteTelefono: '555-0930' })
    await complete(recepcionistaToken, first.body.cita._id, { precioBase: 100, metodoPago: 'efectivo' })
    await request(app).post('/api/reportes/corte-caja/cerrar').set('Authorization', `Bearer ${recepcionistaToken}`).send({ fecha: '2026-09-21' })
    const second = await createAppointment(recepcionistaToken, { clienteTelefono: '555-0931', fecha: '2026-09-21', horaInicio: '12:00', horaFin: '12:45' })
    await complete(recepcionistaToken, second.body.cita._id, { precioBase: 75, metodoPago: 'efectivo' })
    const current = await request(app).get('/api/reportes/corte-caja?fecha=2026-09-21').set('Authorization', `Bearer ${recepcionistaToken}`)

    expect(current.body.totalEfectivo).toBe(75)
  })

  it('includes paid product sales in the cash cut', async () => {
    const product = await Producto.create({ nombre: 'Producto caja', tipo: 'venta', stockActual: 5, stockMinimo: 1, precio: 80, unidad: 'pieza' })
    const movement = await request(app)
      .post(`/api/inventario/${product._id}/movimiento`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ tipoMovimiento: 'venta', cantidad: 2 })
    const today = new Date().toISOString().slice(0, 10)
    const response = await request(app)
      .get(`/api/reportes/corte-caja?fecha=${today}`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)

    expect(movement.status).toBe(201)
    expect(response.status).toBe(200)
    expect(response.body.totalEfectivo).toBe(160)
  })
})
