import 'dotenv/config'
import mongoose from 'mongoose'
import Cita from '../models/Cita.js'
import User from '../models/User.js'

await mongoose.connect(process.env.MONGO_URI)
const citas = await Cita.find({ fecha: new Date('2026-09-26T00:00:00.000Z'), estado: 'agendada' })
  .populate('barbero', 'name')
  .sort({ 'barbero.name': 1, horaInicio: 1 })
  .lean()
console.log(JSON.stringify(citas.map((cita) => ({
  id: cita._id,
  barbero: cita.barbero.name,
  hora: `${cita.horaInicio}-${cita.horaFin}`,
  cliente: cita.clienteNombre,
})), null, 2))
await mongoose.disconnect()
