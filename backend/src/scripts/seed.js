import 'dotenv/config'
import bcrypt from 'bcrypt'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import User from '../models/User.js'
import Producto from '../models/Producto.js'

const seedUsers = [
  { name: 'Admin BarberOps', email: 'admin@barberops.com', password: 'BARBEROPS123!', role: 'admin' },
  { name: 'Recepción BarberOps', email: 'recepcion@barberops.com', password: 'BARBEROPS123!', role: 'recepcionista' },
  { name: 'Patricia Pantoja', email: 'patricia.pantoja@barberops.com', password: 'BARBEROPS123!', role: 'recepcionista' },
  { name: 'Barbero 1 BarberOps', email: 'barbero1@barberops.com', password: 'BARBEROPS123!', role: 'barbero' },
  { name: 'Alejandro Carrillo', email: 'alejandro.carrillo@barberops.com', password: 'BARBEROPS123!', role: 'barbero' },
  { name: 'Daniel Gonzalez', email: 'daniel.gonzalez@barberops.com', password: 'BARBEROPS123!', role: 'barbero' },
  { name: 'Diego Villarreal', email: 'diego.villarreal@barberops.com', password: 'BARBEROPS123!', role: 'barbero' },
  { name: 'Martin Martinez', email: 'martin.martinez@barberops.com', password: 'BARBEROPS123!', role: 'barbero' },
  { name: 'Gerardo Rodriguez', email: 'gerardo.rodriguez@barberops.com', password: 'BARBEROPS123!', role: 'barbero' },
]

const seedProducts = [
  { nombre: 'Cera moldeadora', tipo: 'insumo', precio: 0, stockActual: 20, stockMinimo: 5, unidad: 'unidad' },
  { nombre: 'Navajas de afeitar', tipo: 'insumo', precio: 0, stockActual: 15, stockMinimo: 5, unidad: 'unidad' },
  { nombre: 'Toallas de trabajo', tipo: 'insumo', precio: 0, stockActual: 30, stockMinimo: 10, unidad: 'unidad' },
  { nombre: 'Shampoo profesional (uso interno)', tipo: 'insumo', precio: 0, stockActual: 10, stockMinimo: 3, unidad: 'unidad' },
  { nombre: 'Peine profesional', tipo: 'venta', precio: 120, stockActual: 15, stockMinimo: 5, unidad: 'unidad' },
  { nombre: 'Toalla personalizada BarberOps', tipo: 'venta', precio: 150, stockActual: 10, stockMinimo: 3, unidad: 'unidad' },
  { nombre: 'Jabón artesanal', tipo: 'venta', precio: 90, stockActual: 20, stockMinimo: 5, unidad: 'unidad' },
  { nombre: 'Decant de perfume 30ml', tipo: 'venta', precio: 180, stockActual: 8, stockMinimo: 3, unidad: 'unidad' },
  { nombre: 'Aromatizante para barba', tipo: 'venta', precio: 130, stockActual: 12, stockMinimo: 4, unidad: 'unidad' },
  { nombre: 'Shampoo especial', tipo: 'venta', precio: 160, stockActual: 10, stockMinimo: 3, unidad: 'unidad' },
  { nombre: 'Navaja de colección', tipo: 'venta', precio: 220, stockActual: 6, stockMinimo: 2, unidad: 'unidad' },
]

try {
  await connectDatabase()

  for (const seedUser of seedUsers) {
    const existingUser = await User.findOne({ email: seedUser.email })
    if (existingUser) {
      existingUser.password = await bcrypt.hash(seedUser.password, 12)
      await existingUser.save()
      console.log(`Contraseña sincronizada: ${seedUser.email}`)
      continue
    }

    await User.create({
      name: seedUser.name,
      email: seedUser.email,
      password: await bcrypt.hash(seedUser.password, 12),
      role: seedUser.role,
    })
    console.log(`Usuario creado: ${seedUser.email} (${seedUser.role})`)
  }

  for (const seedProduct of seedProducts) {
    const existingProduct = await Producto.findOne({ nombre: seedProduct.nombre, tipo: seedProduct.tipo })
    if (existingProduct) {
      console.log(`Producto existente: ${seedProduct.nombre}`)
      continue
    }
    await Producto.create(seedProduct)
    console.log(`Producto creado: ${seedProduct.nombre}`)
  }
} catch (error) {
  console.error('No se pudo ejecutar el seed', error)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
