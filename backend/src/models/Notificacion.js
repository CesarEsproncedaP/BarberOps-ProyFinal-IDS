import mongoose from 'mongoose'

const notificacionSchema = new mongoose.Schema(
  {
    cliente: { type: String, required: true, trim: true },
    cita: { type: mongoose.Schema.Types.ObjectId, ref: 'Cita', required: true },
    tipo: { type: String, enum: ['confirmacion', 'recordatorio'], required: true },
    mensaje: { type: String, required: true },
    estado: { type: String, enum: ['simulado', 'enviado', 'fallido'], required: true },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

export default mongoose.model('Notificacion', notificacionSchema)
