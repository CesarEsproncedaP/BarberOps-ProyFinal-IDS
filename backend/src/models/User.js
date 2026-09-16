import mongoose from 'mongoose'

export const USER_ROLES = ['admin', 'recepcionista', 'barbero']

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: USER_ROLES, required: true, default: 'barbero' },
  },
  { timestamps: true },
)

export default mongoose.model('User', userSchema)
