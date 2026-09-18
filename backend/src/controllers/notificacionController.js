import mongoose from 'mongoose'
import Cita from '../models/Cita.js'
import Notificacion from '../models/Notificacion.js'
import { notificationService } from '../services/notificacionService.js'

export const sendReminder = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.citaId)) return res.status(404).json({ message: 'Cita no encontrada' })

  const cita = await Cita.findById(req.params.citaId)
  if (!cita) return res.status(404).json({ message: 'Cita no encontrada' })

  const notificacion = await notificationService.enviarRecordatorio(cita)
  return res.status(201).json({ notificacion })
}

export const listNotifications = async (req, res) => {
  const notificaciones = await Notificacion.find()
    .sort({ fecha: -1 })
    .populate('cita', 'clienteNombre clienteTelefono fecha horaInicio horaFin servicio')
  return res.json({ notificaciones })
}
