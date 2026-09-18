import mongoose from 'mongoose'

const visitaSchema = new mongoose.Schema(
  {
    citaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cita', required: true },
    fecha: { type: Date, required: true },
    barbero: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    servicio: { type: String, required: true, trim: true },
    incluyoCorte: { type: Boolean, required: true, default: false },
  },
  { _id: false },
)

const compraSchema = new mongoose.Schema(
  {
    producto: { type: String, required: true, trim: true },
    fecha: { type: Date, required: true },
    precio: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const clienteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    telefono: { type: String, required: true, unique: true, trim: true },
    historialVisitas: { type: [visitaSchema], default: [] },
    historialCompras: { type: [compraSchema], default: [] },
    contadorCortes: { type: Number, default: 0, min: 0 },
    adeudo: { type: Number, default: 0, min: 0 },
    metodoPagoRestringido: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export default mongoose.model('Cliente', clienteSchema)
