import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import { connectDatabase } from '../src/config/db.js'
import Cita from '../src/models/Cita.js'
import User from '../src/models/User.js'

let mongoServer
let adminToken
let recepcionistaToken
let barberoOneToken
let barberoTwoToken
let barberoOne
let barberoTwo

const password = 'password-123'

const createUser = async (overrides) => User.create({
  ...overrides,
  password: await bcrypt.hash(password, 10),
})

const tokenFor = (user) => jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET)

const appointmentData = (barbero = barberoOne._id) => ({
  clienteNombre: 'Cliente de prueba',
  clienteTelefono: '555-0101',
  barbero: barbero.toString(),
  servicio: 'Corte y barba',
  fecha: '2026-09-21',
  horaInicio: '11:00',
  horaFin: '11:45',
  notas: 'Cliente puntual',
})

const createAppointment = (token, data = appointmentData()) => request(app)
  .post('/api/citas')
  .set('Authorization', `Bearer ${token}`)
  .send(data)

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  mongoServer = await MongoMemoryServer.create()
  process.env.MONGO_URI = mongoServer.getUri()
  await connectDatabase()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Cita.deleteMany({})])

  const users = await Promise.all([
    createUser({ name: 'Admin', email: 'admin-citas@test.local', role: 'admin' }),
    createUser({ name: 'Recepcionista', email: 'recepcion-citas@test.local', role: 'recepcionista' }),
    createUser({ name: 'Barbero Uno', email: 'barbero-uno@test.local', role: 'barbero' }),
    createUser({ name: 'Barbero Dos', email: 'barbero-dos@test.local', role: 'barbero' }),
  ])

  const [admin, recepcionista] = users
  barberoOne = users[2]
  barberoTwo = users[3]
  adminToken = tokenFor(admin)
  recepcionistaToken = tokenFor(recepcionista)
  barberoOneToken = tokenFor(barberoOne)
  barberoTwoToken = tokenFor(barberoTwo)
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

describe('citas integration', () => {
  it('creates an appointment as a recepcionista', async () => {
    const response = await createAppointment(recepcionistaToken)

    expect(response.status).toBe(201)
    expect(response.body.cita).toMatchObject({
      clienteNombre: 'Cliente de prueba',
      servicio: 'Corte y barba',
      estado: 'agendada',
    })
    expect(response.body.cita.creadoPor.name).toBe('Recepcionista')
  })

  it('rejects creation by a barbero', async () => {
    const response = await createAppointment(barberoOneToken)
    expect(response.status).toBe(403)
  })

  it('rejects an overlapping appointment', async () => {
    await createAppointment(recepcionistaToken)
    const response = await createAppointment(recepcionistaToken, {
      ...appointmentData(),
      horaInicio: '11:30',
      horaFin: '12:15',
    })

    expect(response.status).toBe(409)
    expect(response.body.message).toMatch(/ya tiene una cita/i)
  })

  it('rejects an invalid barber', async () => {
    const response = await createAppointment(recepcionistaToken, {
      ...appointmentData(),
      barbero: new mongoose.Types.ObjectId().toString(),
    })
    expect(response.status).toBe(400)
  })

  it('rejects a duration or schedule outside the configured working windows', async () => {
    const response = await createAppointment(recepcionistaToken, {
      ...appointmentData(),
      horaInicio: '14:00',
      horaFin: '14:45',
    })

    expect(response.status).toBe(400)
  })

  it('allows a Saturday appointment in the continuous shift', async () => {
    const response = await createAppointment(recepcionistaToken, {
      ...appointmentData(),
      fecha: '2026-09-26',
      horaInicio: '14:00',
      horaFin: '14:45',
    })

    expect(response.status).toBe(201)
  })

  it('rejects appointments on Sunday', async () => {
    const response = await createAppointment(recepcionistaToken, {
      ...appointmentData(),
      fecha: '2026-09-20',
    })

    expect(response.status).toBe(400)
  })

  it('lets admin list all appointments', async () => {
    await createAppointment(recepcionistaToken, appointmentData(barberoOne._id))
    await createAppointment(recepcionistaToken, { ...appointmentData(barberoTwo._id), horaInicio: '12:00', horaFin: '12:45' })

    const response = await request(app)
      .get('/api/citas')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(200)
    expect(response.body.citas).toHaveLength(2)
  })

  it('only lists each barbero own appointments', async () => {
    await createAppointment(recepcionistaToken, appointmentData(barberoOne._id))
    await createAppointment(recepcionistaToken, { ...appointmentData(barberoTwo._id), horaInicio: '12:00', horaFin: '12:45' })

    const oneResponse = await request(app).get('/api/citas').set('Authorization', `Bearer ${barberoOneToken}`)
    const twoResponse = await request(app).get('/api/citas').set('Authorization', `Bearer ${barberoTwoToken}`)

    expect(oneResponse.body.citas).toHaveLength(1)
    expect(oneResponse.body.citas[0].barbero._id).toBe(barberoOne._id.toString())
    expect(twoResponse.body.citas).toHaveLength(1)
    expect(twoResponse.body.citas[0].barbero._id).toBe(barberoTwo._id.toString())
  })

  it('filters appointments by date', async () => {
    await createAppointment(recepcionistaToken)
    await createAppointment(recepcionistaToken, { ...appointmentData(), fecha: '2026-09-22' })

    const response = await request(app)
      .get('/api/citas?fecha=2026-09-22')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(200)
    expect(response.body.citas).toHaveLength(1)
  })

  it('reschedules an appointment', async () => {
    const created = await createAppointment(recepcionistaToken)
    const response = await request(app)
      .put(`/api/citas/${created.body.cita._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fecha: '2026-09-23', horaInicio: '15:00', horaFin: '15:45', barbero: barberoTwo._id })

    expect(response.status).toBe(200)
    expect(response.body.cita.horaInicio).toBe('15:00')
    expect(response.body.cita.barbero._id).toBe(barberoTwo._id.toString())
  })

  it('rejects rescheduling by a barbero', async () => {
    const created = await createAppointment(recepcionistaToken)
    const response = await request(app)
      .put(`/api/citas/${created.body.cita._id}`)
      .set('Authorization', `Bearer ${barberoOneToken}`)
      .send({ horaInicio: '15:00', horaFin: '15:45' })

    expect(response.status).toBe(403)
  })

  it('cancels an appointment without deleting it', async () => {
    const created = await createAppointment(recepcionistaToken)
    const response = await request(app)
      .patch(`/api/citas/${created.body.cita._id}/cancelar`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)

    expect(response.status).toBe(200)
    expect(response.body.cita.estado).toBe('cancelada')
    expect(await Cita.findById(created.body.cita._id)).not.toBeNull()
  })

  it('rejects cancellation without authentication', async () => {
    const created = await createAppointment(recepcionistaToken)
    const response = await request(app).patch(`/api/citas/${created.body.cita._id}/cancelar`)
    expect(response.status).toBe(401)
  })

  it('returns 404 for a missing appointment', async () => {
    const response = await request(app)
      .get(`/api/citas/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(response.status).toBe(404)
  })
})
