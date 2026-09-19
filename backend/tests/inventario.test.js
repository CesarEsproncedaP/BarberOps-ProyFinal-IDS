import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import { connectDatabase } from '../src/config/db.js'
import Cliente from '../src/models/Cliente.js'
import MovimientoInventario from '../src/models/MovimientoInventario.js'
import Producto from '../src/models/Producto.js'
import User from '../src/models/User.js'

let mongoServer
let adminToken
let recepcionistaToken
let barberoToken

const password = 'password-123'

const createUser = async (overrides) => User.create({
  ...overrides,
  password: await bcrypt.hash(password, 10),
})

const tokenFor = (user) => jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET)

const createProduct = (overrides = {}) => request(app)
  .post('/api/inventario')
  .set('Authorization', `Bearer ${recepcionistaToken}`)
  .send({ nombre: 'Cera mate', tipo: 'insumo', unidad: 'pieza', ...overrides })

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  mongoServer = await MongoMemoryServer.create()
  process.env.MONGO_URI = mongoServer.getUri()
  await connectDatabase()
})

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Cliente.deleteMany({}),
    Producto.deleteMany({}),
    MovimientoInventario.deleteMany({}),
  ])
  const users = await Promise.all([
    createUser({ name: 'Admin', email: 'admin-inventario@test.local', role: 'admin' }),
    createUser({ name: 'Recepcionista', email: 'recepcion-inventario@test.local', role: 'recepcionista' }),
    createUser({ name: 'Barbero', email: 'barbero-inventario@test.local', role: 'barbero' }),
  ])
  adminToken = tokenFor(users[0])
  recepcionistaToken = tokenFor(users[1])
  barberoToken = tokenFor(users[2])
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

describe('inventario integration', () => {
  it('creates an insumo and a product for sale', async () => {
    const insumo = await createProduct()
    const venta = await createProduct({ nombre: 'Shampoo premium', tipo: 'venta', precio: 250, stockActual: 4 })

    expect(insumo.status).toBe(201)
    expect(insumo.body.producto.tipo).toBe('insumo')
    expect(venta.status).toBe(201)
    expect(venta.body.producto).toMatchObject({ tipo: 'venta', precio: 250 })
  })

  it('lists insumos and sale products separately', async () => {
    await createProduct()
    await createProduct({ nombre: 'Peine profesional', tipo: 'venta', precio: 120 })

    const insumos = await request(app).get('/api/inventario?tipo=insumo').set('Authorization', `Bearer ${adminToken}`)
    const ventas = await request(app).get('/api/inventario?tipo=venta').set('Authorization', `Bearer ${adminToken}`)

    expect(insumos.status).toBe(200)
    expect(insumos.body.productos).toHaveLength(1)
    expect(insumos.body.productos[0].tipo).toBe('insumo')
    expect(ventas.body.productos).toHaveLength(1)
    expect(ventas.body.productos[0].tipo).toBe('venta')
  })

  it('marks a product below its minimum stock for restocking', async () => {
    await createProduct({ stockActual: 2, stockMinimo: 5 })
    const response = await request(app).get('/api/inventario?tipo=insumo').set('Authorization', `Bearer ${adminToken}`)

    expect(response.body.productos[0]).toMatchObject({ stockActual: 2, stockMinimo: 5, necesitaReabastecimiento: true })
  })

  it('adds stock with an entry movement', async () => {
    const created = await createProduct({ stockActual: 2 })
    const response = await request(app)
      .post(`/api/inventario/${created.body.producto._id}/movimiento`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tipoMovimiento: 'entrada', cantidad: 8 })

    expect(response.status).toBe(201)
    expect(response.body.producto.stockActual).toBe(10)
    expect(await MovimientoInventario.countDocuments()).toBe(1)
  })

  it('subtracts stock with a usage movement', async () => {
    const created = await createProduct({ stockActual: 8 })
    const response = await request(app)
      .post(`/api/inventario/${created.body.producto._id}/movimiento`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ tipoMovimiento: 'salida_uso', cantidad: 3 })

    expect(response.status).toBe(201)
    expect(response.body.producto.stockActual).toBe(5)
  })

  it('rejects a movement that would make stock negative', async () => {
    const created = await createProduct({ stockActual: 2 })
    const response = await request(app)
      .post(`/api/inventario/${created.body.producto._id}/movimiento`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ tipoMovimiento: 'salida_uso', cantidad: 3 })

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/stock insuficiente/i)
  })

  it('records a sale in the client purchase history', async () => {
    const created = await createProduct({ nombre: 'Shampoo premium', tipo: 'venta', precio: 100, stockActual: 5 })
    const response = await request(app)
      .post(`/api/inventario/${created.body.producto._id}/movimiento`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ tipoMovimiento: 'venta', cantidad: 2, clienteTelefono: '555-0404', clienteNombre: 'Cliente Compra' })
    const client = await Cliente.findOne({ telefono: '555-0404' })

    expect(response.status).toBe(201)
    expect(response.body.producto.stockActual).toBe(3)
    expect(client).not.toBeNull()
    expect(client.historialCompras).toHaveLength(1)
    expect(client.historialCompras[0]).toMatchObject({ producto: 'Shampoo premium', precio: 200 })
  })

  it('allows a sale without associating a client', async () => {
    const created = await createProduct({ nombre: 'Producto mostrador', tipo: 'venta', precio: 50, stockActual: 2 })
    const response = await request(app)
      .post(`/api/inventario/${created.body.producto._id}/movimiento`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ tipoMovimiento: 'venta', cantidad: 1, clienteTelefono: '' })

    expect(response.status).toBe(201)
    expect(response.body.producto.stockActual).toBe(1)
  })

  it('records a free product sale at zero price and subtracts stock', async () => {
    const created = await createProduct({ nombre: 'Peine de lealtad', tipo: 'venta', precio: 80, stockActual: 2 })
    const response = await request(app)
      .post(`/api/inventario/${created.body.producto._id}/movimiento`)
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ tipoMovimiento: 'venta', cantidad: 1, gratis: true, clienteTelefono: '555-0505' })
    const client = await Cliente.findOne({ telefono: '555-0505' })

    expect(response.status).toBe(201)
    expect(response.body.movimiento.gratis).toBe(true)
    expect(response.body.producto.stockActual).toBe(1)
    expect(client.historialCompras[0].precio).toBe(0)
  })

  it('sells multiple products in one transaction', async () => {
    const first = await createProduct({ nombre: 'Peine', tipo: 'venta', precio: 120, stockActual: 5 })
    const second = await createProduct({ nombre: 'Shampoo', tipo: 'venta', precio: 160, stockActual: 4 })
    const response = await request(app)
      .post('/api/inventario/venta')
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ items: [{ productoId: first.body.producto._id, cantidad: 2 }, { productoId: second.body.producto._id, cantidad: 1 }] })

    const products = await Producto.find({ _id: { $in: [first.body.producto._id, second.body.producto._id] } }).sort({ nombre: 1 })
    expect(response.status).toBe(201)
    expect(response.body.total).toBe(400)
    expect(products.find((product) => product.nombre === 'Peine').stockActual).toBe(3)
    expect(products.find((product) => product.nombre === 'Shampoo').stockActual).toBe(3)
  })

  it('rejects the whole multi-sale when one item lacks stock', async () => {
    const available = await createProduct({ nombre: 'Disponible', tipo: 'venta', precio: 100, stockActual: 5 })
    const limited = await createProduct({ nombre: 'Limitado', tipo: 'venta', precio: 80, stockActual: 1 })
    const response = await request(app)
      .post('/api/inventario/venta')
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ items: [{ productoId: available.body.producto._id, cantidad: 2 }, { productoId: limited.body.producto._id, cantidad: 2 }] })

    const products = await Producto.find({ _id: { $in: [available.body.producto._id, limited.body.producto._id] } })
    expect(response.status).toBe(400)
    expect(products.find((product) => product.nombre === 'Disponible').stockActual).toBe(5)
    expect(products.find((product) => product.nombre === 'Limitado').stockActual).toBe(1)
  })

  it('adds every multi-sale item to the client purchase history', async () => {
    const first = await createProduct({ nombre: 'Producto A', tipo: 'venta', precio: 30, stockActual: 5 })
    const second = await createProduct({ nombre: 'Producto B', tipo: 'venta', precio: 40, stockActual: 5 })
    const response = await request(app)
      .post('/api/inventario/venta')
      .set('Authorization', `Bearer ${recepcionistaToken}`)
      .send({ items: [{ productoId: first.body.producto._id, cantidad: 1 }, { productoId: second.body.producto._id, cantidad: 2 }], clienteTelefono: '555-7777', clienteNombre: 'Cliente Carrito' })
    const client = await Cliente.findOne({ telefono: '555-7777' })

    expect(response.status).toBe(201)
    expect(client.historialCompras).toHaveLength(2)
    expect(client.historialCompras.map((purchase) => purchase.producto).sort()).toEqual(['Producto A', 'Producto B'])
  })

  it('allows a multi-sale without a client and rejects a barbero', async () => {
    const product = await createProduct({ nombre: 'Venta directa', tipo: 'venta', precio: 30, stockActual: 2 })
    const withoutClient = await request(app).post('/api/inventario/venta').set('Authorization', `Bearer ${recepcionistaToken}`).send({ items: [{ productoId: product.body.producto._id, cantidad: 1 }] })
    const blocked = await request(app).post('/api/inventario/venta').set('Authorization', `Bearer ${barberoToken}`).send({ items: [{ productoId: product.body.producto._id, cantidad: 1 }] })

    expect(withoutClient.status).toBe(201)
    expect(blocked.status).toBe(403)
  })

  it('returns movement history for a product', async () => {
    const created = await createProduct({ stockActual: 1 })
    await request(app).post(`/api/inventario/${created.body.producto._id}/movimiento`).set('Authorization', `Bearer ${adminToken}`).send({ tipoMovimiento: 'entrada', cantidad: 4 })
    const response = await request(app).get(`/api/inventario/${created.body.producto._id}/movimientos`).set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(200)
    expect(response.body.movimientos).toHaveLength(1)
    expect(response.body.movimientos[0].registradoPor.role).toBe('admin')
  })

  it('rejects a barbero from every inventory endpoint', async () => {
    const list = await request(app).get('/api/inventario').set('Authorization', `Bearer ${barberoToken}`)
    const create = await request(app).post('/api/inventario').set('Authorization', `Bearer ${barberoToken}`).send({ nombre: 'Bloqueado', tipo: 'insumo', unidad: 'pieza' })
    const missingMovement = await request(app).post(`/api/inventario/${new mongoose.Types.ObjectId()}/movimiento`).set('Authorization', `Bearer ${barberoToken}`).send({ tipoMovimiento: 'entrada', cantidad: 1 })

    expect(list.status).toBe(403)
    expect(create.status).toBe(403)
    expect(missingMovement.status).toBe(403)
  })
})
