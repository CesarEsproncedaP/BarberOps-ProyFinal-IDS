import { useCallback, useEffect, useState } from "react";
import barberopsLogo from "./assets/barberops-logo.svg";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SERVICE_PRICES = { Corte: 250, "Corte y barba": 320, Barba: 150 };
const weekdaySlots = [
  ["11:00", "11:45"],
  ["11:45", "12:30"],
  ["12:30", "13:15"],
  ["13:15", "14:00"],
  ["15:00", "15:45"],
  ["15:45", "16:30"],
  ["16:30", "17:15"],
  ["17:15", "18:00"],
  ["18:00", "18:45"],
  ["19:15", "20:00"],
];
const saturdaySlots = [
  ["11:00", "11:45"],
  ["11:45", "12:30"],
  ["12:30", "13:15"],
  ["13:15", "14:00"],
  ["14:15", "15:00"],
];

const formatDate = (date) =>
  new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));

const emptyForm = () => ({
  clienteNombre: "",
  clienteTelefono: "",
  barbero: "",
  servicio: "Corte",
  fecha: new Date().toISOString().slice(0, 10),
  horaInicio: "11:00",
  horaFin: "11:45",
  notas: "",
});

const getAvailableSlots = (date, barberId, appointments) => {
  if (!barberId) return [];
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const appointmentSlots =
    day === 0 ? [] : day === 6 ? saturdaySlots : weekdaySlots;
  const occupied = appointments.filter(
    (appointment) =>
      appointment.estado !== "cancelada" &&
      appointment.fecha.slice(0, 10) === date &&
      (appointment.barbero?._id || appointment.barbero) === barberId,
  );

  return appointmentSlots.filter(
    ([start, end]) =>
      !occupied.some(
        (appointment) =>
          appointment.horaInicio < end && appointment.horaFin > start,
      ),
  );
};

const getDaySlots = (date) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? [] : day === 6 ? saturdaySlots : weekdaySlots;
};

function App() {
  const [token, setToken] = useState(() =>
    localStorage.getItem("barberops_token"),
  );
  const [user, setUser] = useState(null);
  const [citas, setCitas] = useState([]);
  const [barberos, setBarberos] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clientLookup, setClientLookup] = useState(null);
  const [clientLookupLoading, setClientLookupLoading] = useState(false);
  const [activeView, setActiveView] = useState("agenda");
  const [inventoryType, setInventoryType] = useState("insumo");
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [movementForm, setMovementForm] = useState({
    productoId: "",
    tipoMovimiento: "entrada",
    cantidad: 1,
    gratis: false,
    clienteTelefono: "",
    clienteNombre: "",
  });
  const [saleCart, setSaleCart] = useState([]);
  const [saleDraft, setSaleDraft] = useState({ productoId: "", cantidad: 1 });
  const [saleClientPhone, setSaleClientPhone] = useState("");
  const [saleClientLookup, setSaleClientLookup] = useState(null);
  const [completingCita, setCompletingCita] = useState(null);
  const [reschedulingCita, setReschedulingCita] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({
    barbero: "",
    fecha: "",
    horaInicio: "",
    horaFin: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    precioBase: "",
    metodoPago: "efectivo",
  });
  const [reportData, setReportData] = useState(null);
  const [reportTips, setReportTips] = useState(null);
  const [cashData, setCashData] = useState(null);
  const [tipData, setTipData] = useState(null);
  const [paymentBenefit, setPaymentBenefit] = useState(null);

  const api = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.message || "No se pudo completar la solicitud");
      return body;
    },
    [token],
  );

  const handleLogout = useCallback(() => {
    localStorage.removeItem("barberops_token");
    setToken(null);
    setUser(null);
    setCitas([]);
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const session = await api("/auth/me");
      setUser(session.user);
      const appointments = await api(`/citas?fecha=${form.fecha}`);
      setCitas(appointments.citas);
      if (session.user.role !== "barbero") {
        const barberResponse = await api("/auth/barberos");
        setBarberos(barberResponse.users);
        setForm((current) => ({
          ...current,
          barbero: current.barbero || barberResponse.users[0]?._id || "",
        }));
      }
    } catch (requestError) {
      setError(requestError.message);
      if (/token|autentic/i.test(requestError.message)) handleLogout();
    } finally {
      setLoading(false);
    }
  }, [api, form.fecha, handleLogout]);

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const response = await api(`/inventario?tipo=${inventoryType}`);
      setInventoryProducts(response.productos);
      setMovementForm((current) => ({
        ...current,
        productoId: response.productos[0]?._id || "",
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setInventoryLoading(false);
    }
  }, [api, inventoryType]);

  const loadReports = useCallback(async () => {
    try {
      if (user?.role === "admin") {
        const [income, occupancy, tips] = await Promise.all([
          api("/reportes/ingresos"),
          api("/reportes/ocupacion"),
          api("/reportes/propinas"),
        ]);
        setReportData({ income, occupancy });
        setReportTips(tips);
      }
      if (user?.role === "barbero") {
        setTipData(await api("/reportes/propinas"));
      } else {
        const today = new Date().toISOString().slice(0, 10);
        setCashData(await api(`/reportes/corte-caja?fecha=${today}`));
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [api, user]);

  useEffect(() => {
    if (!token) return undefined;
    const timer = setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadDashboard, token]);

  useEffect(() => {
    if (
      !token ||
      !user ||
      user.role === "barbero" ||
      activeView !== "inventario"
    )
      return undefined;
    const timer = setTimeout(() => {
      void loadInventory();
    }, 0);
    return () => clearTimeout(timer);
  }, [activeView, loadInventory, token, user]);

  useEffect(() => {
    if (!token || !saleClientPhone.trim() || activeView !== "inventario" || inventoryType !== "venta") {
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await api(`/clientes/telefono/${encodeURIComponent(saleClientPhone.trim())}`);
        setSaleClientLookup(response.cliente);
      } catch (requestError) {
        setSaleClientLookup(requestError.message === "Cliente no encontrado" ? { nuevo: true } : { error: requestError.message });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [activeView, api, inventoryType, saleClientPhone, token]);

  useEffect(() => {
    if (
      !token ||
      !user ||
      !["reportes", "caja", "propinas"].includes(activeView)
    )
      return undefined;
    const timer = setTimeout(() => {
      void loadReports();
    }, 0);
    return () => clearTimeout(timer);
  }, [activeView, loadReports, token, user]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message || "Credenciales inválidas");
      localStorage.setItem("barberops_token", body.token);
      setToken(body.token);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api("/citas", { method: "POST", body: JSON.stringify(form) });
      setNotice("Cita creada correctamente");
      setForm(emptyForm());
      setShowForm(false);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleClientLookup = async () => {
    if (!form.clienteTelefono.trim()) return;
    setClientLookupLoading(true);
    setError("");
    try {
      const response = await api(
        `/clientes/telefono/${encodeURIComponent(form.clienteTelefono.trim())}`,
      );
      setClientLookup(response.cliente);
      updateForm("clienteNombre", response.cliente.nombre);
    } catch (requestError) {
      if (requestError.message === "Cliente no encontrado") {
        setClientLookup({ nuevo: true });
      } else {
        setError(requestError.message);
      }
    } finally {
      setClientLookupLoading(false);
    }
  };

  const handleCancel = async (id) => {
    setError("");
    setNotice("");
    try {
      await api(`/citas/${id}/cancelar`, { method: "PATCH" });
      setNotice("Cita cancelada");
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleOpenReschedule = (cita) => {
    setError("");
    setReschedulingCita(cita);
    setRescheduleForm({
      barbero: cita.barbero?._id || cita.barbero,
      fecha: cita.fecha.slice(0, 10),
      horaInicio: cita.horaInicio,
      horaFin: cita.horaFin,
    });
  };

  const handleReschedule = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api(`/citas/${reschedulingCita._id}`, {
        method: "PUT",
        body: JSON.stringify({
          clienteNombre: reschedulingCita.clienteNombre,
          clienteTelefono: reschedulingCita.clienteTelefono,
          servicio: reschedulingCita.servicio,
          notas: reschedulingCita.notas,
          barbero: rescheduleForm.barbero,
          fecha: rescheduleForm.fecha,
          horaInicio: rescheduleForm.horaInicio,
          horaFin: rescheduleForm.horaFin,
        }),
      });
      setNotice("Cita reagendada correctamente");
      setReschedulingCita(null);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleMovement = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api(`/inventario/${movementForm.productoId}/movimiento`, {
        method: "POST",
        body: JSON.stringify({
          tipoMovimiento: movementForm.tipoMovimiento,
          cantidad: Number(movementForm.cantidad),
          gratis: movementForm.gratis,
          clienteTelefono:
            movementForm.tipoMovimiento === "venta"
              ? movementForm.clienteTelefono
              : undefined,
          clienteNombre:
            movementForm.tipoMovimiento === "venta"
              ? movementForm.clienteNombre
              : undefined,
        }),
      });
      setNotice("Movimiento registrado correctamente");
      setMovementForm((current) => ({
        ...current,
        cantidad: 1,
        gratis: false,
        clienteTelefono: "",
        clienteNombre: "",
      }));
      await loadInventory();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleComplete = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const response = await api(`/citas/${completingCita._id}/completar`, {
        method: "PATCH",
        body: JSON.stringify({
          precioBase: Number(paymentForm.precioBase),
          metodoPago: paymentForm.metodoPago,
          propina: Number(paymentForm.propina || 0),
        }),
      });
      setNotice(
        response.cita.beneficioAplicado
          ? `Cobro registrado: ${response.cita.beneficioAplicado}`
          : "Cobro registrado correctamente",
      );
      setCompletingCita(null);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleCloseTurn = async () => {
    try {
      const fecha = new Date().toISOString().slice(0, 10);
      await api("/reportes/corte-caja/cerrar", {
        method: "POST",
        body: JSON.stringify({ fecha }),
      });
      await loadReports();
      setNotice(
        "Turno cerrado correctamente. Los totales de este turno quedaron en cero.",
      );
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleOpenComplete = async (cita) => {
    setError("");
    const defaultPrice = SERVICE_PRICES[cita.servicio] || 0;
    let benefit = null;
    try {
      const response = await api(
        `/clientes/telefono/${encodeURIComponent(cita.clienteTelefono)}`,
      );
      benefit = response.cliente.beneficioLealtad
        ? { label: response.cliente.beneficioLealtad }
        : null;
    } catch (requestError) {
      if (requestError.message !== "Cliente no encontrado")
        setError(requestError.message);
    }
    setPaymentBenefit(benefit);
    setCompletingCita(cita);
    setPaymentForm({
      precioBase: defaultPrice,
      metodoPago: "efectivo",
      propina: 0,
    });
  };

  if (!token || !user) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="login-heading">
            <h1>BarberOps</h1>
            <p>Agenda para administrar una barbería</p>
          </div>
          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                placeholder="nombre@barberops.com"
                required
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                placeholder="Ingresa tu contraseña"
                required
              />
            </label>
            {error && <p className="error-message">{error}</p>}
            <button className="primary-button" type="submit">
              Iniciar sesión
            </button>
          </form>
          <p className="login-footnote">
            Para más información manda WhatsApp al 81 24154041
          </p>
        </section>
        <aside className="login-aside">
          <img
            className="login-logo"
            src={barberopsLogo}
            alt="BarberOps Management System"
          />
        </aside>
      </main>
    );
  }

  const addSaleItem = () => {
    const product = inventoryProducts.find((item) => item._id === saleDraft.productoId)
    const quantity = Number(saleDraft.cantidad)
    if (!product || !Number.isFinite(quantity) || quantity <= 0) return
    setSaleCart((current) => {
      const existing = current.find((item) => item.productoId === product._id)
      if (existing) return current.map((item) => item.productoId === product._id ? { ...item, cantidad: item.cantidad + quantity } : item)
      return [...current, { productoId: product._id, nombre: product.nombre, precio: product.precio, cantidad: quantity }]
    })
    setSaleDraft({ productoId: "", cantidad: 1 })
  }

  const confirmSale = async (event) => {
    event.preventDefault()
    if (!saleCart.length) return
    setError("")
    setNotice("")
    try {
      const response = await api("/inventario/venta", { method: "POST", body: JSON.stringify({ items: saleCart.map(({ productoId, cantidad }) => ({ productoId, cantidad })), clienteTelefono: saleClientPhone || undefined }) })
      setNotice(`Venta registrada por $${response.total.toFixed(2)}`)
      setSaleCart([])
      setSaleClientPhone("")
      await loadInventory()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const isStaff = user.role === "admin" || user.role === "recepcionista";
  const visibleCitas = citas.filter((cita) => cita.estado !== "cancelada");
  const updateForm = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));
  const availableSlots = getAvailableSlots(form.fecha, form.barbero, citas);
  const hasSelectedSlot = availableSlots.some(
    ([start]) => start === form.horaInicio,
  );
  const daySlots = getDaySlots(form.fecha);
  const appointmentFor = (barberId, start) =>
    visibleCitas.find(
      (cita) =>
        (cita.barbero?._id || cita.barbero) === barberId &&
        cita.horaInicio === start,
    );
  const updateSchedule = (field, value) => {
    const nextForm = { ...form, [field]: value };
    const nextSlots = getAvailableSlots(
      nextForm.fecha,
      nextForm.barbero,
      citas,
    );
    const nextSlot = nextSlots[0] || ["", ""];
    setForm({ ...nextForm, horaInicio: nextSlot[0], horaFin: nextSlot[1] });
  };
  const rescheduleSlots = getAvailableSlots(
    rescheduleForm.fecha,
    rescheduleForm.barbero,
    citas,
  );
  if (
    reschedulingCita &&
    reschedulingCita.fecha.slice(0, 10) === rescheduleForm.fecha &&
    (reschedulingCita.barbero?._id || reschedulingCita.barbero) ===
      rescheduleForm.barbero &&
    !rescheduleSlots.some(([start]) => start === reschedulingCita.horaInicio)
  ) {
    rescheduleSlots.push([
      reschedulingCita.horaInicio,
      reschedulingCita.horaFin,
    ]);
    rescheduleSlots.sort(([first], [second]) => first.localeCompare(second));
  }
  const updateRescheduleSchedule = (field, value) => {
    const nextForm = { ...rescheduleForm, [field]: value };
    const nextSlots = getAvailableSlots(
      nextForm.fecha,
      nextForm.barbero,
      citas,
    );
    const nextSlot = nextSlots[0] || ["", ""];
    setRescheduleForm({
      ...nextForm,
      horaInicio: nextSlot[0],
      horaFin: nextSlot[1],
    });
  };
  const calculatedPaymentTotal = paymentBenefit?.label?.includes("20%")
    ? Number((Number(paymentForm.precioBase) * 0.8).toFixed(2))
    : paymentBenefit?.label?.includes("35%")
      ? Number((Number(paymentForm.precioBase) * 0.65).toFixed(2))
      : paymentBenefit?.label?.includes("gratis") &&
          paymentBenefit?.label?.includes("12vo")
        ? 0
        : Number(paymentForm.precioBase || 0);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="app-logo" src={barberopsLogo} alt="BarberOps" />
        </div>
        <div className="topbar-actions">
          {isStaff ? (
            <nav className="view-nav">
              <button
                className={activeView === "agenda" ? "active" : ""}
                onClick={() => setActiveView("agenda")}
              >
                Agenda
              </button>
              <button
                className={activeView === "inventario" ? "active" : ""}
                onClick={() => setActiveView("inventario")}
              >
                Inventario
              </button>
              <button
                className={activeView === "caja" ? "active" : ""}
                onClick={() => setActiveView("caja")}
              >
                Corte de caja
              </button>
              {user.role === "admin" && (
                <button
                  className={activeView === "reportes" ? "active" : ""}
                  onClick={() => setActiveView("reportes")}
                >
                  Reportes
                </button>
              )}
            </nav>
          ) : (
            <nav className="view-nav">
              <button
                className={activeView === "agenda" ? "active" : ""}
                onClick={() => setActiveView("agenda")}
              >
                Mi Agenda
              </button>
              <button
                className={activeView === "propinas" ? "active" : ""}
                onClick={() => setActiveView("propinas")}
              >
                Propinas
              </button>
            </nav>
          )}
          <div className="account">
            <div>
              <strong>{user.name}</strong>
              <span>{user.role}</span>
            </div>
            <button className="text-button" onClick={handleLogout}>
              Salir
            </button>
          </div>
        </div>
      </header>
      {activeView === "agenda" || !isStaff ? (
        <section className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {isStaff ? "Control de operaciones" : "Vista personal"}
              </p>
              <h1>{isStaff ? "Agenda" : "Mi Agenda"}</h1>
              <p className="subheading">
                {isStaff
                  ? "Programa las citas de tus clientes con tus barberos"
                  : "Tus próximas citas asignadas, siempre a la vista."}
              </p>
            </div>
            {isStaff && (
              <button
                className="primary-button"
                onClick={() => setShowForm((current) => !current)}
              >
                {showForm ? "Cerrar formulario" : "+ Nueva cita"}
              </button>
            )}
          </div>
          {!isStaff && tipData && (
            <div className="tip-summary">
              <span>Propinas de esta semana</span>
              <strong>${tipData.total.toFixed(2)}</strong>
            </div>
          )}
          {error && <div className="feedback error-message">{error}</div>}
          {notice && <div className="feedback success-message">{notice}</div>}
          {showForm && isStaff && (
            <form className="appointment-form" onSubmit={handleCreate}>
              <div className="form-heading">
                <div>
                  <p className="eyebrow">Nueva reserva</p>
                  <h2>Agendar una cita</h2>
                </div>
                <span>Completa los datos de la visita</span>
              </div>
              <div className="form-grid">
                <label>
                  Nombre del cliente
                  <input
                    value={form.clienteNombre}
                    onChange={(event) =>
                      updateForm("clienteNombre", event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  Teléfono
                  <div className="phone-search">
                    <input
                      value={form.clienteTelefono}
                      onChange={(event) => {
                        updateForm("clienteTelefono", event.target.value);
                        setClientLookup(null);
                      }}
                      required
                    />
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={handleClientLookup}
                      disabled={clientLookupLoading}
                    >
                      {clientLookupLoading ? "Buscando..." : "Buscar"}
                    </button>
                  </div>
                </label>
                <label>
                  Barbero
                  <select
                    value={form.barbero}
                    onChange={(event) =>
                      updateSchedule("barbero", event.target.value)
                    }
                    required
                  >
                    <option value="">Selecciona un barbero</option>
                    {barberos.map((barbero) => (
                      <option key={barbero._id} value={barbero._id}>
                        {barbero.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Servicio
                  <select
                    value={form.servicio}
                    onChange={(event) =>
                      updateForm("servicio", event.target.value)
                    }
                  >
                    <option>Corte</option>
                    <option>Corte y barba</option>
                    <option>Barba</option>
                  </select>
                </label>
                <label>
                  Fecha
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={(event) =>
                      updateSchedule("fecha", event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  Horario disponible
                  <select
                    value={form.horaInicio}
                    onChange={(event) => {
                      const selectedSlot = availableSlots.find(
                        ([start]) => start === event.target.value,
                      );
                      setForm((current) => ({
                        ...current,
                        horaInicio: selectedSlot?.[0] || "",
                        horaFin: selectedSlot?.[1] || "",
                      }));
                    }}
                    required
                    disabled={!availableSlots.length}
                  >
                    <option value="">
                      {availableSlots.length
                        ? "Selecciona un horario"
                        : "Sin horarios disponibles"}
                    </option>
                    {availableSlots.map(([start, end]) => (
                      <option key={start} value={start}>
                        {start} - {end}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Duración
                  <input value="45 minutos" readOnly />
                </label>
                <label className="wide">
                  Notas
                  <textarea
                    value={form.notas}
                    onChange={(event) =>
                      updateForm("notas", event.target.value)
                    }
                    rows="2"
                    placeholder="Preferencias o detalles importantes"
                  />
                </label>
              </div>
              {clientLookup && (
                <div
                  className={`client-summary ${clientLookup.nuevo ? "client-new" : ""}`}
                >
                  {clientLookup.nuevo ? (
                    <>
                      <strong>Cliente nuevo</strong>
                      <span>
                        Se creará su ficha automáticamente al guardar la cita.
                      </span>
                    </>
                  ) : (
                    <>
                      <div>
                        <strong>{clientLookup.nombre}</strong>
                        <span>
                          {clientLookup.historialVisitas.length} visitas ·{" "}
                          {clientLookup.contadorCortes} cortes acumulados
                        </span>
                      </div>
                      <div>
                        <strong>
                          {clientLookup.adeudo > 0
                            ? `Adeudo pendiente: $${clientLookup.adeudo.toFixed(2)}`
                            : "Sin adeudo pendiente"}
                        </strong>
                        <span>
                          {clientLookup.beneficioLealtad
                            ? `Beneficio disponible: ${clientLookup.beneficioLealtad}`
                            : "Sin beneficio de lealtad por ahora"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
              <button
                className="primary-button"
                type="submit"
                disabled={!hasSelectedSlot}
              >
                Guardar cita
              </button>
            </form>
          )}
          <div className="agenda-toolbar">
            <div>
              <h2>{formatDate(form.fecha)}</h2>
              <p>
                {visibleCitas.length}{" "}
                {visibleCitas.length === 1 ? "cita activa" : "citas activas"}
              </p>
            </div>
            <input
              aria-label="Filtrar fecha"
              type="date"
              value={form.fecha}
              onChange={(event) => updateForm("fecha", event.target.value)}
            />
          </div>
          {loading ? (
            <div className="empty-state">
              <span className="loader" />
              Cargando agenda...
            </div>
          ) : isStaff ? (
            <div className="calendar-scroll">
              <div
                className="calendar-grid"
                style={{ "--barber-count": Math.max(barberos.length, 1) }}
              >
                <div className="calendar-corner">Hora</div>
                {barberos.map((barbero) => (
                  <div className="calendar-barber" key={barbero._id}>
                    <span>Barbero</span>
                    <strong>{barbero.name}</strong>
                  </div>
                ))}
                {daySlots.length === 0 ? (
                  <div className="calendar-closed">Domingo cerrado</div>
                ) : (
                  daySlots.map(([start, end]) => (
                    <div className="calendar-row" key={start}>
                      <div className="calendar-time">
                        <strong>{start}</strong>
                        <span>{end}</span>
                      </div>
                      {barberos.map((barbero) => {
                        const cita = appointmentFor(barbero._id, start);
                        return (
                          <div
                            className="calendar-cell"
                            key={`${barbero._id}-${start}`}
                          >
                            {cita && (
                              <article className="calendar-appointment">
                                <div className="appointment-title">
                                  <h3>{cita.clienteNombre}</h3>
                                  <span className="status">{cita.estado}</span>
                                </div>
                                <p>{cita.servicio}</p>
                                <small>{cita.clienteTelefono}</small>
                                {cita.estado === "agendada" && (
                                  <button
                                    className="complete-button"
                                    onClick={() => handleOpenComplete(cita)}
                                  >
                                    Completar y cobrar
                                  </button>
                                )}
                                {cita.estado === "agendada" && (
                                  <button
                                    className="secondary-button"
                                    onClick={() => handleOpenReschedule(cita)}
                                  >
                                    Reagendar
                                  </button>
                                )}
                                {cita.estado === "agendada" && (
                                  <button
                                    className="cancel-button"
                                    onClick={() => handleCancel(cita._id)}
                                  >
                                    Cancelar
                                  </button>
                                )}
                              </article>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : visibleCitas.length === 0 ? (
            <div className="empty-state">
              <strong>La agenda está despejada.</strong>
              <span>No tienes citas asignadas para esta fecha.</span>
            </div>
          ) : (
            <div className="appointment-list">
              {visibleCitas.map((cita) => (
                <article className="appointment-row" key={cita._id}>
                  <div className="time-block">
                    <strong>{cita.horaInicio}</strong>
                    <span>{cita.horaFin}</span>
                  </div>
                  <div className="appointment-info">
                    <div className="appointment-title">
                      <h3>{cita.clienteNombre}</h3>
                      <span className="status">{cita.estado}</span>
                    </div>
                    <p>
                      {cita.servicio} <span>·</span> {cita.clienteTelefono}
                    </p>
                    {cita.notas && <small>{cita.notas}</small>}
                  </div>
                  <div className="barber-info">
                    <span>Barbero</span>
                    <strong>{cita.barbero?.name || "Sin asignar"}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : activeView === "inventario" ? (
        <section className="content inventory-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Control de existencias</p>
              <h1>Inventario</h1>
              <p className="subheading">
                Separa los insumos de trabajo de los productos disponibles para
                venta.
              </p>
            </div>
          </div>
          {error && <div className="feedback error-message">{error}</div>}
          {notice && <div className="feedback success-message">{notice}</div>}
          <div className="inventory-tabs">
            <button
              className={inventoryType === "insumo" ? "active" : ""}
              onClick={() => setInventoryType("insumo")}
            >
              Insumos
            </button>
            <button
              className={inventoryType === "venta" ? "active" : ""}
              onClick={() => setInventoryType("venta")}
            >
              Productos de venta
            </button>
          </div>
          <div className="inventory-layout">
            <div className="inventory-list">
              {inventoryLoading ? (
                <div className="empty-state">
                  <span className="loader" />
                  Cargando inventario...
                </div>
              ) : inventoryProducts.length === 0 ? (
                <div className="empty-state">
                  <strong>No hay productos en esta vista.</strong>
                  <span>Agrega productos desde el API para comenzar.</span>
                </div>
              ) : (
                inventoryProducts.map((producto) => (
                  <article
                    className={`inventory-card ${producto.necesitaReabastecimiento ? "low-stock" : ""}`}
                    key={producto._id}
                  >
                    <div>
                      <span className="inventory-type">
                        {producto.tipo === "insumo" ? "Insumo" : "Venta"}
                      </span>
                      <h2>{producto.nombre}</h2>
                      <p>
                        {producto.stockActual} {producto.unidad} disponibles ·
                        mínimo {producto.stockMinimo}
                      </p>
                      {inventoryType === "venta" && <strong className="product-price">${producto.precio.toFixed(2)}</strong>}
                    </div>
                    <strong className="stock-number">
                      {producto.stockActual}
                    </strong>
                    {producto.necesitaReabastecimiento && (
                      <span className="restock-warning">
                        Necesita reabastecimiento
                      </span>
                    )}
                  </article>
                ))
              )}
            </div>
            <form className="movement-form" onSubmit={handleMovement}>
              <p className="eyebrow">Trazabilidad</p>
              <h2>Registrar movimiento</h2>
              <label>
                Producto
                <select
                  value={movementForm.productoId}
                  onChange={(event) =>
                    setMovementForm({
                      ...movementForm,
                      productoId: event.target.value,
                    })
                  }
                  required
                >
                  <option value="">Selecciona un producto</option>
                  {inventoryProducts.map((producto) => (
                    <option key={producto._id} value={producto._id}>
                      {producto.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo de movimiento
                <select
                  value={movementForm.tipoMovimiento}
                  onChange={(event) =>
                    setMovementForm({
                      ...movementForm,
                      tipoMovimiento: event.target.value,
                      gratis: event.target.value === "venta",
                    })
                  }
                >
                  <option value="entrada">Entrada</option>
                  <option value="salida_uso">Salida por uso</option>
                  {inventoryType === "venta" && (
                    <option value="venta">Producto gratis por lealtad</option>
                  )}
                </select>
              </label>
              <label>
                Cantidad
                <input
                  type="number"
                  min="1"
                  value={movementForm.cantidad}
                  onChange={(event) =>
                    setMovementForm({
                      ...movementForm,
                      cantidad: event.target.value,
                    })
                  }
                  required
                />
              </label>
              {movementForm.tipoMovimiento === "venta" && (
                <>
                  <label>
                    Teléfono del cliente (opcional)
                    <input
                      value={movementForm.clienteTelefono}
                      onChange={(event) =>
                        setMovementForm({
                          ...movementForm,
                          clienteTelefono: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Nombre del cliente
                    <input
                      value={movementForm.clienteNombre}
                      onChange={(event) =>
                        setMovementForm({
                          ...movementForm,
                          clienteNombre: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={movementForm.gratis}
                      readOnly
                      disabled
                    />{" "}
                    Producto gratis por lealtad
                  </label>
                </>
              )}
              <button
                className="primary-button"
                type="submit"
                disabled={!movementForm.productoId}
              >
                Guardar movimiento
              </button>
            </form>
            {inventoryType === "venta" && (
              <form className="movement-form sale-form" onSubmit={confirmSale}>
                <p className="eyebrow">Nueva venta</p>
                <h2>Carrito de productos</h2>
                <label>Producto<select value={saleDraft.productoId} onChange={(event) => setSaleDraft({ ...saleDraft, productoId: event.target.value })}><option value="">Selecciona un producto</option>{inventoryProducts.map((producto) => <option key={producto._id} value={producto._id}>{producto.nombre} · ${producto.precio.toFixed(2)}</option>)}</select></label>
                <label>Cantidad<input type="number" min="1" value={saleDraft.cantidad} onChange={(event) => setSaleDraft({ ...saleDraft, cantidad: event.target.value })} /></label>
                <button className="secondary-button" type="button" onClick={addSaleItem}>Agregar al carrito</button>
                <div className="sale-cart">{saleCart.map((item) => <div className="sale-cart-row" key={item.productoId}><span>{item.nombre} × {item.cantidad}</span><strong>${(item.precio * item.cantidad).toFixed(2)}</strong><button type="button" className="text-button" onClick={() => setSaleCart((current) => current.filter((entry) => entry.productoId !== item.productoId))}>Quitar</button></div>)}</div>
                <label>Teléfono del cliente (opcional)<input value={saleClientPhone} onChange={(event) => { setSaleClientPhone(event.target.value); setSaleClientLookup(null) }} /></label>
                {saleClientLookup?.error && <p className="error-message">{saleClientLookup.error}</p>}
                {saleClientLookup?.nuevo && <div className="client-summary client-new"><strong>Cliente nuevo</strong><span>La venta se registrará sin nombre asociado.</span></div>}
                {saleClientLookup && !saleClientLookup.nuevo && !saleClientLookup.error && <div className="client-summary"><div><strong>Cliente: {saleClientLookup.nombre}</strong><span>{saleClientLookup.historialVisitas.length} visitas · {saleClientLookup.contadorCortes} cortes acumulados</span></div><div><strong>{saleClientLookup.adeudo > 0 ? `Adeudo pendiente: $${saleClientLookup.adeudo.toFixed(2)}` : "Sin adeudo pendiente"}</strong><span>{saleClientLookup.beneficioLealtad ? `Beneficio disponible: ${saleClientLookup.beneficioLealtad}` : "Sin beneficio de lealtad por ahora"}</span></div></div>}
                <strong className="sale-total">Total: ${saleCart.reduce((sum, item) => sum + item.precio * item.cantidad, 0).toFixed(2)}</strong>
                <button className="primary-button" type="submit" disabled={!saleCart.length}>Confirmar venta</button>
              </form>
            )}
          </div>
        </section>
      ) : null}
      {activeView === "reportes" && user.role === "admin" && (
        <section className="content report-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Visión del negocio</p>
              <h1>Reportes</h1>
              <p className="subheading">Ingresos y ocupación de la barbería.</p>
            </div>
          </div>
          {error && <div className="feedback error-message">{error}</div>}
          {reportData ? (
            <div className="report-grid">
              <article className="metric-card">
                <span>Ingresos totales</span>
                <strong>${reportData.income.ingresosTotales.toFixed(2)}</strong>
              </article>
              <article className="metric-card">
                <span>Ingresos por citas</span>
                <strong>${reportData.income.ingresosCitas.toFixed(2)}</strong>
              </article>
              <article className="metric-card">
                <span>Ventas de productos</span>
                <strong>
                  ${reportData.income.ingresosProductos.toFixed(2)}
                </strong>
              </article>
              {reportTips && <section className="report-table tip-report-summary"><h2>Propinas de la semana - Todos los barberos</h2><p><span>Total</span><strong>${reportTips.total.toFixed(2)}</strong></p>{reportTips.porBarbero.map((barber) => <p key={barber.barbero?._id}><span>{barber.barbero?.name || "Sin barbero"}</span><strong>${barber.total.toFixed(2)}</strong></p>)}</section>}
              <section className="report-table">
                <h2>Ingresos por barbero</h2>
                {Object.entries(reportData.income.porBarbero).map(
                  ([name, amount]) => (
                    <p key={name}>
                      <span>{name}</span>
                      <strong>${amount.toFixed(2)}</strong>
                    </p>
                  ),
                )}
              </section>
              <section className="report-table">
                <h2>Ingresos por recepcionista</h2>
                {Object.entries(reportData.income.porRecepcionista || {}).map(
                  ([name, amount]) => (
                    <p key={name}>
                      <span>{name}</span>
                      <strong>${amount.toFixed(2)}</strong>
                    </p>
                  ),
                )}
              </section>
              <section className="report-table">
                <h2>Ocupación</h2>
                {Object.entries(reportData.occupancy.porBarbero).map(
                  ([name, values]) => (
                    <p key={name}>
                      <span>{name}</span>
                      <strong>
                        {values.completadas} completadas · {values.agendadas}{" "}
                        pendientes · {values.canceladas} canceladas
                      </strong>
                    </p>
                  ),
                )}
              </section>
            </div>
          ) : (
            <div className="empty-state">
              <span className="loader" />
              Cargando reportes...
            </div>
          )}
        </section>
      )}
      {activeView === "caja" && (
        <section className="content report-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Cierre del día</p>
              <h1>Corte de caja</h1>
              <p className="subheading">
                Citas cobradas registradas durante tu turno.
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                void handleCloseTurn();
              }}
            >
              Cerrar turno
            </button>
          </div>
          {cashData ? (
            <div className="report-grid">
              <article className="metric-card">
                <span>Total efectivo</span>
                <strong>${cashData.totalEfectivo.toFixed(2)}</strong>
              </article>
              <article className="metric-card">
                <span>Total transferencia</span>
                <strong>${cashData.totalTransferencia.toFixed(2)}</strong>
              </article>
              <article className="metric-card tip-pending">
                <span>Propinas incluidas en caja</span>
                <strong>${cashData.totalPropinas.toFixed(2)}</strong>
              </article>
              {cashData.turnos.map((turno, index) => (
                <section
                  className="report-table"
                  key={turno.registradoPor?._id || index}
                >
                  <h2>{turno.registradoPor?.name || "Turno"}</h2>
                  <p>
                    <span>Efectivo</span>
                    <strong>${turno.totalEfectivo.toFixed(2)}</strong>
                  </p>
                  <p>
                    <span>Transferencia</span>
                    <strong>${turno.totalTransferencia.toFixed(2)}</strong>
                  </p>
                </section>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="loader" />
              Cargando corte...
            </div>
          )}
        </section>
      )}
      {activeView === "propinas" && user.role === "barbero" && (
        <section className="content report-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Resumen semanal</p>
              <h1>Propinas</h1>
              <p className="subheading">
                Propinas acumuladas de lunes a domingo.
              </p>
            </div>
          </div>
          {tipData ? (
            <div className="report-grid">
              <article className="metric-card">
                <span>Propinas de esta semana</span>
                <strong>${tipData.total.toFixed(2)}</strong>
              </article>
              <section className="report-table">
                <h2>Periodo</h2>
                <p>
                  <span>Desde</span>
                  <strong>{tipData.fechaInicio}</strong>
                </p>
                <p>
                  <span>Hasta</span>
                  <strong>{tipData.fechaFin}</strong>
                </p>
              </section>
            </div>
          ) : (
            <div className="empty-state">
              <span className="loader" />
              Cargando propinas...
            </div>
          )}
        </section>
      )}
      {completingCita && (
        <div className="modal-backdrop">
          <form className="payment-modal" onSubmit={handleComplete}>
            <p className="eyebrow">Cerrar cita</p>
            <h2>Completar y cobrar</h2>
            <p>
              {completingCita.clienteNombre} · {completingCita.servicio}
            </p>
            {error && <p className="error-message">{error}</p>}
            <div className="price-reference">
              <span>Corte $250</span>
              <span>Corte y barba $320</span>
              <span>Barba $150</span>
            </div>
            {paymentBenefit && (
              <div className="benefit-notice">
                Beneficio: {paymentBenefit.label}
                <strong>
                  Precio final estimado: ${calculatedPaymentTotal.toFixed(2)}
                </strong>
              </div>
            )}
              <label>
                Precio del servicio
              <input
                  type="text"
                value={paymentForm.precioBase}
                  readOnly
              />
            </label>
            <label>
              Propina para el barbero (opcional)
              <input
                type="number"
                min="0"
                step="0.01"
                value={paymentForm.propina}
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    propina: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Método de pago
              <select
                value={paymentForm.metodoPago}
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    metodoPago: event.target.value,
                  })
                }
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCompletingCita(null)}
              >
                Cancelar
              </button>
              <button className="primary-button" type="submit">
                Registrar cobro
              </button>
            </div>
          </form>
        </div>
      )}
      {reschedulingCita && (
        <div className="modal-backdrop">
          <form className="payment-modal" onSubmit={handleReschedule}>
            <p className="eyebrow">Modificar cita</p>
            <h2>Reagendar</h2>
            <p>
              {reschedulingCita.clienteNombre} · {reschedulingCita.servicio}
            </p>
            {error && <p className="error-message">{error}</p>}
            <label>
              Barbero
              <select
                value={rescheduleForm.barbero}
                onChange={(event) =>
                  updateRescheduleSchedule("barbero", event.target.value)
                }
                required
              >
                {barberos.map((barbero) => (
                  <option key={barbero._id} value={barbero._id}>
                    {barbero.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha
              <input
                type="date"
                value={rescheduleForm.fecha}
                onChange={(event) =>
                  updateRescheduleSchedule("fecha", event.target.value)
                }
                required
              />
            </label>
            <label>
              Horario disponible
              <select
                value={rescheduleForm.horaInicio}
                onChange={(event) => {
                  const selectedSlot = rescheduleSlots.find(
                    ([start]) => start === event.target.value,
                  );
                  setRescheduleForm((current) => ({
                    ...current,
                    horaInicio: selectedSlot?.[0] || "",
                    horaFin: selectedSlot?.[1] || "",
                  }));
                }}
                required
                disabled={!rescheduleSlots.length}
              >
                <option value="">
                  {rescheduleSlots.length
                    ? "Selecciona un horario"
                    : "Sin horarios disponibles"}
                </option>
                {rescheduleSlots.map(([start, end]) => (
                  <option key={start} value={start}>
                    {start} - {end}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duración
              <input value="45 minutos" readOnly />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReschedulingCita(null)}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={!rescheduleSlots.some(
                  ([start]) => start === rescheduleForm.horaInicio,
                )}
              >
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default App;
