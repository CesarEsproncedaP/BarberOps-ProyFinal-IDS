import mongoose from 'mongoose'

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

const citaSchema = new mongoose.Schema(
  {
    clienteNombre: { type: String, required: true, trim: true },
    clienteTelefono: { type: String, required: true, trim: true },
    barbero: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    servicio: { type: String, required: true, trim: true },
    incluyoCorte: { type: Boolean, default: false },
    fecha: { type: Date, required: true },
    horaInicio: { type: String, required: true, match: timePattern },
    horaFin: { type: String, required: true, match: timePattern },
    estado: {
      type: String,
      enum: ['agendada', 'cancelada', 'completada'],
      default: 'agendada',
    },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notas: { type: String, trim: true },
    precioBase: { type: Number, min: 0 },
    precioFinal: { type: Number, min: 0 },
    metodoPago: { type: String, enum: ['efectivo', 'transferencia'] },
    beneficioAplicado: { type: String, trim: true },
  },
  { timestamps: true },
)

export default mongoose.model('Cita', citaSchema)
