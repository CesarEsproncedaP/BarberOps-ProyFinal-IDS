import mongoose from 'mongoose'

const movimientoSchema = new mongoose.Schema(
  {
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
    tipoMovimiento: { type: String, enum: ['entrada', 'salida_uso', 'venta'], required: true },
    cantidad: { type: Number, required: true, min: 0 },
    gratis: { type: Boolean, default: false },
    clienteTelefono: { type: String, trim: true },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

export default mongoose.model('MovimientoInventario', movimientoSchema)
