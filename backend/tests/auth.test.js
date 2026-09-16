import bcrypt from 'bcrypt'
import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import { connectDatabase } from '../src/config/db.js'
import { requireRole } from '../src/middlewares/auth.js'
import User from '../src/models/User.js'

let mongoServer
let adminToken
let recepcionistaToken
let expiredToken

const adminData = {
  name: 'Admin BarberOps',
  email: 'admin@barberops.test',
  password: 'admin-password',
  role: 'admin',
}

const recepcionistaData = {
  name: 'Recepcionista BarberOps',
  email: 'recepcionista@barberops.test',
  password: 'recepcionista-password',
  role: 'recepcionista',
}

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  mongoServer = await MongoMemoryServer.create()
  process.env.MONGO_URI = mongoServer.getUri()
  await connectDatabase()
})

beforeEach(async () => {
  await User.deleteMany({})

  const admin = await User.create({
    ...adminData,
    password: await bcrypt.hash(adminData.password, 10),
  })
  const recepcionista = await User.create({
    ...recepcionistaData,
    password: await bcrypt.hash(recepcionistaData.password, 10),
  })

  adminToken = jwt.sign({ userId: admin._id.toString() }, process.env.JWT_SECRET)
  recepcionistaToken = jwt.sign({ userId: recepcionista._id.toString() }, process.env.JWT_SECRET)
  expiredToken = jwt.sign({ userId: admin._id.toString() }, process.env.JWT_SECRET, { expiresIn: -1 })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

describe('authentication integration', () => {
  it('registers a user when requested by an authenticated admin', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Nuevo Barbero',
        email: 'nuevo@barberops.test',
        password: 'nuevo-password',
        role: 'barbero',
      })

    expect(response.status).toBe(201)
    expect(response.body.user).toMatchObject({
      name: 'Nuevo Barbero',
      email: 'nuevo@barberops.test',
      role: 'barbero',
    })
    expect(response.body.user).not.toHaveProperty('password')
    expect(response.body.token).toEqual(expect.any(String))
  })

  it('rejects registration with 403 when the requester is not admin', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ name: 'Usuario bloqueado', email: 'bloqueado@barberops.test', password: 'password-123' })

    expect(response.status).toBe(403)
  })

  it('rejects registration with 409 when the email already exists', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Duplicado', email: recepcionistaData.email, password: 'password-123' })

    expect(response.status).toBe(409)
  })

  it('rejects registration with missing fields or a short password', async () => {
    const missingFields = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Registro incompleto' })
    const shortPassword = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Password corto', email: 'corto@barberops.test', password: 'corto' })

    expect(missingFields.status).toBe(400)
    expect(shortPassword.status).toBe(400)
  })

  it('logs in with valid credentials and returns a valid token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: adminData.email, password: adminData.password })

    expect(response.status).toBe(200)
    expect(response.body.token).toEqual(expect.any(String))
    expect(jwt.verify(response.body.token, process.env.JWT_SECRET)).toHaveProperty('userId')
  })

  it('rejects login with an incorrect password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: adminData.email, password: 'wrong-password' })

    expect(response.status).toBe(401)
  })

  it('rejects login with an unknown email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'missing@barberops.test', password: adminData.password })

    expect(response.status).toBe(401)
  })

  it('returns the authenticated user without password from /me', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({ email: adminData.email, role: 'admin' })
    expect(response.body.user).not.toHaveProperty('password')
  })

  it('rejects /me without a token', async () => {
    const response = await request(app).get('/api/auth/me')

    expect(response.status).toBe(401)
  })

  it.each([
    ['invalid', 'invalid-token'],
    ['expired', () => expiredToken],
  ])('rejects /me with an %s token', async (_description, tokenValue) => {
    const token = typeof tokenValue === 'function' ? tokenValue() : tokenValue
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(401)
  })

  it('requireRole rejects an unauthorized role with 403', () => {
    const req = { user: { role: 'barbero' } }
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const next = jest.fn()

    requireRole('admin')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ message: 'Insufficient permissions' })
    expect(next).not.toHaveBeenCalled()
  })

  it('requireRole rejects a request without a user with 403', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }

    requireRole('admin')({}, res, jest.fn())

    expect(res.status).toHaveBeenCalledWith(403)
  })
})
