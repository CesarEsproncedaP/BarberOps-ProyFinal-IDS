import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
})

const createToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1d' })

export const register = async (req, res) => {
  const { name, email, password, role } = req.body
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' })
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' })

  const normalizedEmail = email.toLowerCase().trim()
  if (await User.findOne({ email: normalizedEmail })) return res.status(409).json({ message: 'Email is already registered' })

  const user = await User.create({
    name,
    email: normalizedEmail,
    password: await bcrypt.hash(password, 12),
    role: role || 'barbero',
  })

  return res.status(201).json({ token: createToken(user._id.toString()), user: publicUser(user) })
}

export const login = async (req, res) => {
  const { email, password } = req.body
  const user = await User.findOne({ email: email?.toLowerCase().trim() }).select('+password')
  if (!user || !(await bcrypt.compare(password || '', user.password))) return res.status(401).json({ message: 'Invalid credentials' })
  return res.json({ token: createToken(user._id.toString()), user: publicUser(user) })
}

export const getCurrentUser = (req, res) => res.json({ user: publicUser(req.user) })
