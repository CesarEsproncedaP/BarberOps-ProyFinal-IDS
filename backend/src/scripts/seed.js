import 'dotenv/config'
import bcrypt from 'bcrypt'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import User from '../models/User.js'

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
} catch (error) {
  console.error('No se pudo ejecutar el seed', error)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
