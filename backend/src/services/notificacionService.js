import twilio from 'twilio'
import Notificacion from '../models/Notificacion.js'
import User from '../models/User.js'

const hasTwilioCredentials = () => Boolean(
  process.env.TWILIO_ACCOUNT_SID
  && process.env.TWILIO_AUTH_TOKEN
  && process.env.TWILIO_WHATSAPP_FROM,
)

const formatDate = (date) => new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeZone: 'UTC',
}).format(new Date(date))

const formatPhone = (phone) => phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`

const buildMessage = async (cita, type) => {
  const barber = await User.findById(cita.barbero).select('name')
  const prefix = type === 'confirmacion' ? 'BarberOps: tu cita ha sido confirmada' : 'BarberOps: recordatorio de tu cita'
  return `${prefix} para el ${formatDate(cita.fecha)} a las ${cita.horaInicio}. Barbero: ${barber?.name || 'asignado'}. Servicio: ${cita.servicio}.`
}

const sendNotification = async (cita, tipo) => {
  const mensaje = await buildMessage(cita, tipo)
  const base = { cliente: cita.clienteTelefono, cita: cita._id, tipo, mensaje }

  if (!hasTwilioCredentials()) {
    console.log(`[Notificacion simulada] ${cita.clienteTelefono}: ${mensaje}`)
    return Notificacion.create({ ...base, estado: 'simulado' })
  }

  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    await client.messages.create({
      from: formatPhone(process.env.TWILIO_WHATSAPP_FROM),
      to: formatPhone(cita.clienteTelefono),
      body: mensaje,
    })
    return Notificacion.create({ ...base, estado: 'enviado' })
  } catch (error) {
    await Notificacion.create({ ...base, estado: 'fallido' })
    throw error
  }
}

export const notificationService = {
  enviarConfirmacion: (cita) => sendNotification(cita, 'confirmacion'),
  enviarRecordatorio: (cita) => sendNotification(cita, 'recordatorio'),
}

export const enviarConfirmacion = notificationService.enviarConfirmacion
export const enviarRecordatorio = notificationService.enviarRecordatorio
