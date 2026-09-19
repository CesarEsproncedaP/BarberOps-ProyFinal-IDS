import mongoose from 'mongoose'

const corteCajaSchema = new mongoose.Schema(
  {
    fecha: { type: Date, required: true },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    totalEfectivo: { type: Number, required: true, default: 0 },
    totalTransferencia: { type: Number, required: true, default: 0 },
    citas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cita' }],
    movimientos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MovimientoInventario' }],
    cerradoEn: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

corteCajaSchema.index({ fecha: 1, registradoPor: 1 }, { unique: true })

export default mongoose.model('CorteCaja', corteCajaSchema)
