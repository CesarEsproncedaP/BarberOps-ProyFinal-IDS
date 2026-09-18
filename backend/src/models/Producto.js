import mongoose from 'mongoose'

const productoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    tipo: { type: String, enum: ['insumo', 'venta'], required: true },
    stockActual: { type: Number, required: true, default: 0, min: 0 },
    stockMinimo: { type: Number, required: true, default: 5, min: 0 },
    precio: { type: Number, min: 0, required: function isSale() { return this.tipo === 'venta' } },
    unidad: { type: String, required: true, trim: true },
  },
  { timestamps: true },
)

export default mongoose.model('Producto', productoSchema)
