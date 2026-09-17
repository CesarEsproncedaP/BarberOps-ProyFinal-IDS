import { useCallback, useEffect, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const weekdaySlots = [
  ['11:00', '11:45'],
  ['11:45', '12:30'],
  ['12:30', '13:15'],
  ['13:15', '14:00'],
  ['15:00', '15:45'],
  ['15:45', '16:30'],
  ['16:30', '17:15'],
  ['17:15', '18:00'],
  ['18:00', '18:45'],
  ['18:45', '19:30'],
]
const saturdaySlots = [
  ['11:00', '11:45'],
  ['11:45', '12:30'],
  ['12:30', '13:15'],
  ['13:15', '14:00'],
  ['14:00', '14:45'],
]

const formatDate = (date) => new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}).format(new Date(`${date}T00:00:00`))

const emptyForm = () => ({
  clienteNombre: '', clienteTelefono: '', barbero: '', servicio: 'Corte',
  fecha: new Date().toISOString().slice(0, 10), horaInicio: '11:00', horaFin: '11:45', notas: '',
})

const getAvailableSlots = (date, barberId, appointments) => {
  if (!barberId) return []
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  const appointmentSlots = day === 0 ? [] : day === 6 ? saturdaySlots : weekdaySlots
  const occupied = appointments.filter((appointment) => appointment.estado !== 'cancelada'
    && appointment.fecha.slice(0, 10) === date
    && (appointment.barbero?._id || appointment.barbero) === barberId)

  return appointmentSlots.filter(([start, end]) => !occupied.some((appointment) => appointment.horaInicio < end && appointment.horaFin > start))
}

const getDaySlots = (date) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? [] : day === 6 ? saturdaySlots : weekdaySlots
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('barberops_token'))
  const [user, setUser] = useState(null)
  const [citas, setCitas] = useState([])
  const [barberos, setBarberos] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const api = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.message || 'No se pudo completar la solicitud')
    return body
  }, [token])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('barberops_token')
    setToken(null)
    setUser(null)
    setCitas([])
  }, [])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const session = await api('/auth/me')
      setUser(session.user)
      const appointments = await api(`/citas?fecha=${form.fecha}`)
      setCitas(appointments.citas)
      if (session.user.role !== 'barbero') {
        const barberResponse = await api('/auth/barberos')
        setBarberos(barberResponse.users)
        setForm((current) => ({ ...current, barbero: current.barbero || barberResponse.users[0]?._id || '' }))
      }
    } catch (requestError) {
      setError(requestError.message)
      if (/token|autentic/i.test(requestError.message)) handleLogout()
    } finally {
      setLoading(false)
    }
  }, [api, form.fecha, handleLogout])

  useEffect(() => {
    if (!token) return undefined
    const timer = setTimeout(() => { void loadDashboard() }, 0)
    return () => clearTimeout(timer)
  }, [loadDashboard, token])

  const handleLogin = async (event) => {
    event.preventDefault()
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'Credenciales inválidas')
      localStorage.setItem('barberops_token', body.token)
      setToken(body.token)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api('/citas', { method: 'POST', body: JSON.stringify(form) })
      setNotice('Cita creada correctamente')
      setForm(emptyForm())
      setShowForm(false)
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const handleCancel = async (id) => {
    setError('')
    setNotice('')
    try {
      await api(`/citas/${id}/cancelar`, { method: 'PATCH' })
      setNotice('Cita cancelada')
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  if (!token || !user) {
    return <main className="login-shell">
      <section className="login-panel">
        <div className="brand-mark">BO</div>
        <p className="eyebrow">BarberOps / Operaciones</p>
        <h1>Tu agenda, en orden.</h1>
        <p className="login-copy">Accede al centro de operaciones para coordinar cada cita del día.</p>
        <form className="login-form" onSubmit={handleLogin}>
          <label>Email<input name="email" type="email" placeholder="nombre@barberia.com" required /></label>
          <label>Contraseña<input name="password" type="password" placeholder="••••••••" required /></label>
          {error && <p className="error-message">{error}</p>}
          <button className="primary-button" type="submit">Entrar al sistema</button>
        </form>
      </section>
      <aside className="login-aside"><span className="aside-kicker">Agenda central</span><strong>El ritmo de la barbería empieza aquí.</strong><div className="aside-note"><span className="live-dot" /> Sistema operativo</div></aside>
    </main>
  }

  const isStaff = user.role === 'admin' || user.role === 'recepcionista'
  const visibleCitas = citas.filter((cita) => cita.estado !== 'cancelada')
  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const availableSlots = getAvailableSlots(form.fecha, form.barbero, citas)
  const hasSelectedSlot = availableSlots.some(([start]) => start === form.horaInicio)
  const daySlots = getDaySlots(form.fecha)
  const appointmentFor = (barberId, start) => visibleCitas.find((cita) => (cita.barbero?._id || cita.barbero) === barberId && cita.horaInicio === start)
  const updateSchedule = (field, value) => {
    const nextForm = { ...form, [field]: value }
    const nextSlots = getAvailableSlots(nextForm.fecha, nextForm.barbero, citas)
    const nextSlot = nextSlots[0] || ['', '']
    setForm({ ...nextForm, horaInicio: nextSlot[0], horaFin: nextSlot[1] })
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark small">BO</span><span>BarberOps</span></div><div className="account"><div><strong>{user.name}</strong><span>{user.role}</span></div><button className="text-button" onClick={handleLogout}>Salir</button></div></header>
    <section className="content">
      <div className="page-heading"><div><p className="eyebrow">{isStaff ? 'Control de operación' : 'Vista personal'}</p><h1>{isStaff ? 'Agenda' : 'Mi Agenda'}</h1><p className="subheading">{isStaff ? 'Coordina las citas de tu equipo para que cada silla tenga su momento.' : 'Tus próximas citas asignadas, siempre a la vista.'}</p></div>{isStaff && <button className="primary-button" onClick={() => setShowForm((current) => !current)}>{showForm ? 'Cerrar formulario' : '+ Nueva cita'}</button>}</div>
      {error && <div className="feedback error-message">{error}</div>}
      {notice && <div className="feedback success-message">{notice}</div>}
      {showForm && isStaff && <form className="appointment-form" onSubmit={handleCreate}>
        <div className="form-heading"><div><p className="eyebrow">Nueva reserva</p><h2>Agendar una cita</h2></div><span>Completa los datos de la visita</span></div>
        <div className="form-grid">
          <label>Nombre del cliente<input value={form.clienteNombre} onChange={(event) => updateForm('clienteNombre', event.target.value)} required /></label>
          <label>Teléfono<input value={form.clienteTelefono} onChange={(event) => updateForm('clienteTelefono', event.target.value)} required /></label>
          <label>Barbero<select value={form.barbero} onChange={(event) => updateSchedule('barbero', event.target.value)} required><option value="">Selecciona un barbero</option>{barberos.map((barbero) => <option key={barbero._id} value={barbero._id}>{barbero.name}</option>)}</select></label>
          <label>Servicio<select value={form.servicio} onChange={(event) => updateForm('servicio', event.target.value)}><option>Corte</option><option>Corte y barba</option><option>Barba</option></select></label>
          <label>Fecha<input type="date" value={form.fecha} onChange={(event) => updateSchedule('fecha', event.target.value)} required /></label>
          <label>Horario disponible<select value={form.horaInicio} onChange={(event) => updateForm('horaInicio', event.target.value)} required disabled={!availableSlots.length}><option value="">{availableSlots.length ? 'Selecciona un horario' : 'Sin horarios disponibles'}</option>{availableSlots.map(([start, end]) => <option key={start} value={start}>{start} - {end}</option>)}</select></label>
          <label>Duración<input value="45 minutos" readOnly /></label>
          <label className="wide">Notas<textarea value={form.notas} onChange={(event) => updateForm('notas', event.target.value)} rows="2" placeholder="Preferencias o detalles importantes" /></label>
        </div>
        <button className="primary-button" type="submit" disabled={!hasSelectedSlot}>Guardar cita</button>
      </form>}
      <div className="agenda-toolbar"><div><h2>{formatDate(form.fecha)}</h2><p>{visibleCitas.length} {visibleCitas.length === 1 ? 'cita activa' : 'citas activas'}</p></div><input aria-label="Filtrar fecha" type="date" value={form.fecha} onChange={(event) => updateForm('fecha', event.target.value)} /></div>
      {loading ? <div className="empty-state"><span className="loader" />Cargando agenda...</div> : isStaff ? <div className="calendar-scroll"><div className="calendar-grid" style={{ '--barber-count': Math.max(barberos.length, 1) }}><div className="calendar-corner">Hora</div>{barberos.map((barbero) => <div className="calendar-barber" key={barbero._id}><span>Barbero</span><strong>{barbero.name}</strong></div>)}{daySlots.length === 0 ? <div className="calendar-closed">Domingo cerrado</div> : daySlots.map(([start, end]) => <div className="calendar-row" key={start}><div className="calendar-time"><strong>{start}</strong><span>{end}</span></div>{barberos.map((barbero) => { const cita = appointmentFor(barbero._id, start); return <div className="calendar-cell" key={`${barbero._id}-${start}`}>{cita && <article className="calendar-appointment"><div className="appointment-title"><h3>{cita.clienteNombre}</h3><span className="status">{cita.estado}</span></div><p>{cita.servicio}</p><small>{cita.clienteTelefono}</small><button className="cancel-button" onClick={() => handleCancel(cita._id)}>Cancelar</button></article>}</div> })}</div>)}</div></div> : visibleCitas.length === 0 ? <div className="empty-state"><strong>La agenda está despejada.</strong><span>No tienes citas asignadas para esta fecha.</span></div> : <div className="appointment-list">{visibleCitas.map((cita) => <article className="appointment-row" key={cita._id}><div className="time-block"><strong>{cita.horaInicio}</strong><span>{cita.horaFin}</span></div><div className="appointment-info"><div className="appointment-title"><h3>{cita.clienteNombre}</h3><span className="status">{cita.estado}</span></div><p>{cita.servicio} <span>·</span> {cita.clienteTelefono}</p>{cita.notas && <small>{cita.notas}</small>}</div><div className="barber-info"><span>Barbero</span><strong>{cita.barbero?.name || 'Sin asignar'}</strong></div></article>)}</div>}
    </section>
  </main>
}

export default App
