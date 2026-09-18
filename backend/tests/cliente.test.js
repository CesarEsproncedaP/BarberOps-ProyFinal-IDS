import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import { connectDatabase } from '../src/config/db.js'
import Cita from '../src/models/Cita.js'
import Cliente from '../src/models/Cliente.js'
import User from '../src/models/User.js'

let mongoServer
let adminToken
let recepcionistaToken
let barberoToken
let barbero

const password = 'password-123'

const createUser = async (overrides) => User.create({
  ...overrides,
  password: await bcrypt.hash(password, 10),
})

const tokenFor = (user) => jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET)

const appointmentData = (overrides = {}) => ({
  clienteNombre: 'Cliente Leal',
  clienteTelefono: '555-0202',
  barbero: barbero._id.toString(),
  servicio: 'Corte',
  fecha: '2026-09-21',
  horaInicio: '11:00',
  horaFin: '11:45',
  ...overrides,
})

const createAppointment = (overrides = {}) => request(app)
  .post('/api/citas')
  .set('Authorization', `Bearer ${recepcionistaToken}`)
  .send(appointmentData(overrides))

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  mongoServer = await MongoMemoryServer.create()
  process.env.MONGO_URI = mongoServer.getUri()
  await connectDatabase()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Cita.deleteMany({}), Cliente.deleteMany({})])
  const users = await Promise.all([
    createUser({ name: 'Admin', email: 'admin-clientes@test.local', role: 'admin' }),
    createUser({ name: 'Recepcionista', email: 'recepcion-clientes@test.local', role: 'recepcionista' }),
    createUser({ name: 'Barbero', email: 'barbero-clientes@test.local', role: 'barbero' }),
  ])

  barbero = users[2]
  adminToken = tokenFor(users[0])
  recepcionistaToken = tokenFor(users[1])
  barberoToken = tokenFor(barbero)
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

describe('clientes integration', () => {
  it('creates a client automatically with a new appointment', async () => {
    const response = await createAppointment()
    const cliente = await Cliente.findOne({ telefono: '555-0202' })

    expect(response.status).toBe(201)
    expect(cliente).not.toBeNull()
    expect(cliente.nombre).toBe('Cliente Leal')
    expect(cliente.historialVisitas).toHaveLength(1)
    expect(cliente.contadorCortes).toBe(1)
  })

  it('reuses an existing client and appends a visit', async () => {
    await createAppointment()
    const second = await createAppointment({ fecha: '2026-09-22', horaInicio: '12:00', horaFin: '12:45', servicio: 'Barba' })
    const clientes = await Cliente.find({ telefono: '555-0202' })

    expect(second.status).toBe(201)
    expect(clientes).toHaveLength(1)
    expect(clientes[0].historialVisitas).toHaveLength(2)
    expect(clientes[0].contadorCortes).toBe(1)
  })

  it('only increments the cut counter when the visit includes a cut', async () => {
    await createAppointment({ servicio: 'Barba', incluyoCorte: false })
    const cliente = await Cliente.findOne({ telefono: '555-0202' })

    expect(cliente.contadorCortes).toBe(0)
    expect(cliente.historialVisitas[0].incluyoCorte).toBe(false)
  })

  it('finds a client by phone and returns loyalty and payment information', async () => {
    await createAppointment()
    const response = await request(app)
      .get('/api/clientes/telefono/555-0202')
      .set('Authorization', `Bearer ${recepcionistaToken}`)

    expect(response.status).toBe(200)
    expect(response.body.cliente).toMatchObject({ nombre: 'Cliente Leal', contadorCortes: 1, beneficioLealtad: null, puedePagarTransferencia: false })
    expect(response.body.cliente.historialVisitas).toHaveLength(1)
  })

  it('exposes the loyalty benefit and transfer eligibility from visit history', async () => {
    const dates = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
    for (const [index, date] of dates.entries()) {
      await createAppointment({ fecha: date, horaInicio: index < 4 ? '11:00' : '15:00', horaFin: index < 4 ? '11:45' : '15:45' })
    }

    const response = await request(app)
      .get('/api/clientes/telefono/555-0202')
      .set('Authorization', `Bearer ${recepcionistaToken}`)

    expect(response.status).toBe(200)
    expect(response.body.cliente).toMatchObject({ contadorCortes: 5, beneficioLealtad: null, puedePagarTransferencia: true })
  })

  it.each([
    [3, '20% de descuento'],
    [6, 'Producto gratis'],
    [9, '35% de descuento o producto gratis'],
    [12, null],
    [4, null],
    [7, null],
    [8, null],
  ])('returns the exact loyalty benefit for %s cuts', async (cuts, expectedBenefit) => {
    const telefono = `555-${4000 + cuts}`
    await Cliente.create({ nombre: `Cliente ${cuts}`, telefono, contadorCortes: cuts })

    const response = await request(app)
      .get(`/api/clientes/telefono/${telefono}`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)

    expect(response.status).toBe(200)
    expect(response.body.cliente.beneficioLealtad).toBe(expectedBenefit)
  })

  it('resets the cut counter after the twelfth cut', async () => {
    const dates = []
    const date = new Date('2026-09-21T00:00:00.000Z')
    while (dates.length < 12) {
      if (date.getUTCDay() !== 0) dates.push(date.toISOString().slice(0, 10))
      date.setUTCDate(date.getUTCDate() + 1)
    }

    for (const [index, currentDate] of dates.entries()) {
      const isSaturday = new Date(`${currentDate}T00:00:00.000Z`).getUTCDay() === 6
      await createAppointment({
        fecha: currentDate,
        horaInicio: isSaturday ? '14:00' : index % 2 === 0 ? '11:00' : '15:00',
        horaFin: isSaturday ? '14:45' : index % 2 === 0 ? '11:45' : '15:45',
      })
    }

    const cliente = await Cliente.findOne({ telefono: '555-0202' })
    const response = await request(app)
      .get('/api/clientes/telefono/555-0202')
      .set('Authorization', `Bearer ${recepcionistaToken}`)

    expect(cliente.historialVisitas).toHaveLength(12)
    expect(cliente.contadorCortes).toBe(0)
    expect(response.body.cliente.beneficioLealtad).toBeNull()
  })

  it('returns 404 for an unknown phone', async () => {
    const response = await request(app)
      .get('/api/clientes/telefono/555-9999')
      .set('Authorization', `Bearer ${recepcionistaToken}`)
    expect(response.status).toBe(404)
  })

  it('returns a client by id and supports the phone filter on the list', async () => {
    await createAppointment()
    const client = await Cliente.findOne({ telefono: '555-0202' })
    const byId = await request(app)
      .get(`/api/clientes/${client._id}`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)
    const byFilter = await request(app)
      .get('/api/clientes?telefono=555-0202')
      .set('Authorization', `Bearer ${recepcionistaToken}`)

    expect(byId.status).toBe(200)
    expect(byId.body.cliente.telefono).toBe('555-0202')
    expect(byFilter.status).toBe(200)
    expect(byFilter.body.clientes).toHaveLength(1)
  })

  it('returns 404 for an invalid or missing client id', async () => {
    const invalid = await request(app)
      .get('/api/clientes/not-an-id')
      .set('Authorization', `Bearer ${recepcionistaToken}`)
    const missing = await request(app)
      .get(`/api/clientes/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)

    expect(invalid.status).toBe(404)
    expect(missing.status).toBe(404)
  })

  it('rejects an empty phone and invalid debt data', async () => {
    const emptyPhone = await request(app)
      .get('/api/clientes/telefono/%20')
      .set('Authorization', `Bearer ${recepcionistaToken}`)
    const invalidBody = await request(app)
      .patch(`/api/clientes/${new mongoose.Types.ObjectId()}/adeudo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ monto: 0, accion: 'desconocida' })
    const invalidId = await request(app)
      .patch('/api/clientes/not-an-id/adeudo')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ monto: 10, accion: 'agregar' })

    expect(emptyPhone.status).toBe(400)
    expect(invalidBody.status).toBe(400)
    expect(invalidId.status).toBe(404)
  })

  it('does not allow a barbero to access clients', async () => {
    const response = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${barberoToken}`)
    expect(response.status).toBe(403)
  })

  it('registers debt and unlocks payment when fully settled', async () => {
    await createAppointment()
    const client = await Cliente.findOne({ telefono: '555-0202' })
    const added = await request(app)
      .patch(`/api/clientes/${client._id}/adeudo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ monto: 150, accion: 'agregar' })
    const settled = await request(app)
      .patch(`/api/clientes/${client._id}/adeudo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ monto: 150, accion: 'saldar' })

    expect(added.status).toBe(200)
    expect(added.body.cliente).toMatchObject({ adeudo: 150, metodoPagoRestringido: true })
    expect(settled.status).toBe(200)
    expect(settled.body.cliente).toMatchObject({ adeudo: 0, metodoPagoRestringido: false })
  })

  it('keeps payment restricted when an adeudo is only partially settled', async () => {
    await createAppointment()
    const client = await Cliente.findOne({ telefono: '555-0202' })
    await request(app)
      .patch(`/api/clientes/${client._id}/adeudo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ monto: 200, accion: 'agregar' })

    const response = await request(app)
      .patch(`/api/clientes/${client._id}/adeudo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ monto: 75, accion: 'saldar' })

    expect(response.status).toBe(200)
    expect(response.body.cliente).toMatchObject({ adeudo: 125, metodoPagoRestringido: true })
  })

  it('returns 404 when updating the debt of a missing client', async () => {
    const response = await request(app)
      .patch(`/api/clientes/${new mongoose.Types.ObjectId()}/adeudo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ monto: 10, accion: 'agregar' })

    expect(response.status).toBe(404)
  })

  it('lists all clients for admin', async () => {
    await createAppointment()
    await createAppointment({ clienteNombre: 'Otra persona', clienteTelefono: '555-0303', fecha: '2026-09-22', horaInicio: '12:00', horaFin: '12:45' })
    const response = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(200)
    expect(response.body.clientes).toHaveLength(2)
  })
})
