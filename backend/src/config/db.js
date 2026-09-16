import mongoose from 'mongoose'

export const connectDatabase = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured')
  }

  await mongoose.connect(process.env.MONGO_URI)
  console.log('MongoDB connected')
}
