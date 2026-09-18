import Cliente from '../models/Cliente.js'

export const loyaltyBenefitFor = (contadorCortes, totalCortes = null) => {
  const currentMilestone = totalCortes > 0 && totalCortes % 12 === 0 ? 12 : contadorCortes
  if (currentMilestone === 12) return { label: 'Corte normal gratis (12vo corte)', priceMultiplier: 0 }
  if (currentMilestone === 9) return { label: '35% descuento (9no corte)', priceMultiplier: 0.65 }
  if (currentMilestone === 6) return { label: 'Producto gratis (6to corte)', priceMultiplier: 1 }
  if (currentMilestone === 3) return { label: '20% descuento (3er corte)', priceMultiplier: 0.8 }
  return null
}

export const findOrCreateCliente = async ({ nombre, telefono }) => {
  const cliente = await Cliente.findOneAndUpdate(
    { telefono },
    { $setOnInsert: { nombre, telefono } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  )

  if (nombre && cliente.nombre !== nombre) {
    cliente.nombre = nombre
    await cliente.save()
  }
  return cliente
}

export const recordClientVisit = async ({ cita, clienteNombre, clienteTelefono, barbero, servicio, incluyoCorte }) => {
  const cliente = await findOrCreateCliente({ nombre: clienteNombre, telefono: clienteTelefono })
  cliente.historialVisitas.push({ citaId: cita._id, fecha: cita.fecha, barbero, servicio, incluyoCorte })
  if (incluyoCorte) {
    cliente.contadorCortes += 1
    if (cliente.contadorCortes === 12) cliente.contadorCortes = 0
  }
  await cliente.save()
  return cliente
}

export const recordClientPurchase = async ({ clienteNombre, clienteTelefono, producto, precio, fecha = new Date() }) => {
  const cliente = await findOrCreateCliente({ nombre: clienteNombre || clienteTelefono, telefono: clienteTelefono })
  cliente.historialCompras.push({ producto, fecha, precio })
  await cliente.save()
  return cliente
}
