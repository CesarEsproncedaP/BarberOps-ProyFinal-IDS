import bcrypt from 'bcrypt'
import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import { connectDatabase } from '../src/config/db.js'
import Cita from '../src/models/Cita.js'
import Cliente from '../src/models/Cliente.js'
import Notificacion from '../src/models/Notificacion.js'
import User from '../src/models/User.js'
import { notificationService } from '../src/services/notificacionService.js'

let mongoServer
let adminToken
let recepcionistaToken
let barberoToken
let barbero

const password = 'password-123'
const createUser = async (overrides) => User.create({ ...overrides, password: await bcrypt.hash(password, 10) })
const tokenFor = (user) => jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET)
const appointmentData = (overrides = {}) => ({
  clienteNombre: 'Cliente Notificaciones', clienteTelefono: '555-1010', barbero: barbero._id.toString(), servicio: 'Corte', fecha: '2026-09-21', horaInicio: '11:00', horaFin: '11:45', ...overrides,
})
const createAppointment = (token = recepcionistaToken, overrides = {}) => request(app).post('/api/citas').set('Authorization', `Bearer ${token}`).send(appointmentData(overrides))

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  delete process.env.TWILIO_ACCOUNT_SID
  delete process.env.TWILIO_AUTH_TOKEN
  delete process.env.TWILIO_WHATSAPP_FROM
  mongoServer = await MongoMemoryServer.create()
  process.env.MONGO_URI = mongoServer.getUri()
  await connectDatabase()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Cliente.deleteMany({}), Cita.deleteMany({}), Notificacion.deleteMany({})])
  const users = await Promise.all([
    createUser({ name: 'Admin', email: 'admin-notif@test.local', role: 'admin' }),
    createUser({ name: 'Recepcionista', email: 'recep-notif@test.local', role: 'recepcionista' }),
    createUser({ name: 'Barbero', email: 'barbero-notif@test.local', role: 'barbero' }),
  ])
  adminToken = tokenFor(users[0])
  recepcionistaToken = tokenFor(users[1])
  barbero = users[2]
  barberoToken = tokenFor(barbero)
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

describe('notificaciones integration', () => {
  it('creates a simulated confirmation when creating an appointment', async () => {
    const response = await createAppointment()
    const notifications = await Notificacion.find({ cita: response.body.cita._id })

    expect(response.status).toBe(201)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ tipo: 'confirmacion', estado: 'simulado', cliente: '555-1010' })
    expect(notifications[0].mensaje).toMatch(/11:00|Corte|Barbero/i)
  })

  it('creates a simulated reminder manually', async () => {
    const created = await createAppointment()
    const response = await request(app)
      .post(`/api/notificaciones/recordatorio/${created.body.cita._id}`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)

    expect(response.status).toBe(201)
    expect(response.body.notificacion).toMatchObject({ tipo: 'recordatorio', estado: 'simulado' })
    expect(await Notificacion.countDocuments({ tipo: 'recordatorio' })).toBe(1)
  })

  it('returns 404 for a reminder of a missing appointment', async () => {
    const response = await request(app)
      .post(`/api/notificaciones/recordatorio/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)
    expect(response.status).toBe(404)
  })

  it('lists notifications only for admin', async () => {
    await createAppointment()
    const admin = await request(app).get('/api/notificaciones').set('Authorization', `Bearer ${adminToken}`)
    const receptionist = await request(app).get('/api/notificaciones').set('Authorization', `Bearer ${recepcionistaToken}`)
    const barber = await request(app).get('/api/notificaciones').set('Authorization', `Bearer ${barberoToken}`)

    expect(admin.status).toBe(200)
    expect(admin.body.notificaciones).toHaveLength(1)
    expect(receptionist.status).toBe(403)
    expect(barber.status).toBe(403)
  })

  it('keeps the appointment when confirmation service fails', async () => {
    const spy = jest.spyOn(notificationService, 'enviarConfirmacion').mockRejectedValueOnce(new Error('Twilio unavailable'))
    const response = await createAppointment()
    spy.mockRestore()

    expect(response.status).toBe(201)
    expect(await Cita.exists({ _id: response.body.cita._id })).not.toBeNull()
  })
})
