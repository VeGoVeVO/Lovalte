/**
 * Spanish (es-ES) translations. Register: peninsular Spanish as spoken in Madrid
 * for a modern product, friendly and direct, "tú" not "usted". No literal,
 * machine-sounding translations: "Members" is the warmer "Clientes", "Staff" is
 * "Equipo", buttons read like a person wrote them. Key = the English source.
 *
 * Keep this free of em-dashes (project-wide style). Missing key falls back to
 * English automatically, so partial coverage degrades gracefully.
 */
export const ES: Record<string, string> = {
  // ── Shell / navigation ───────────────────────────────────────────────
  Dashboard: "Panel",
  Builder: "Diseño",
  Members: "Clientes",
  Staff: "Equipo",
  Analytics: "Estadísticas",
  Issue: "Emitir",
  Scan: "Escanear",
  Home: "Inicio",
  Cards: "Tarjetas",
  More: "Más",
  "Log out": "Cerrar sesión",
  Overview: "Resumen",

  // ── Dashboard ────────────────────────────────────────────────────────
  "Sign in to view your dashboard.": "Inicia sesión para ver tu panel.",
  "Active members": "Clientes activos",
  Scans: "Escaneos",
  Redemptions: "Canjes",
  "Points liability": "Saldo de puntos",
  "Cards removed": "Tarjetas eliminadas",

  // ── Members ──────────────────────────────────────────────────────────
  "Failed to load members: {message}": "No se han podido cargar los clientes: {message}",
  "Unknown error": "Error desconocido",
  "Loading members": "Cargando clientes",
  "No members yet - issue a card to get started.":
    "Aún no tienes clientes, emite una tarjeta para empezar.",
  "Members appear here once a loyalty card has been issued to a customer.":
    "Los clientes aparecen aquí cuando se les emite una tarjeta de fidelidad.",
  Name: "Nombre",
  Balance: "Saldo",
  Tier: "Nivel",
  Actions: "Acciones",
  "View details for {name}": "Ver detalles de {name}",
  member: "cliente",
  "{balance} points": "{balance} puntos",
  "{count} members": "{count} clientes",

  // ── Member detail ────────────────────────────────────────────────────
  "Back to members list": "Volver a la lista de clientes",
  "Could not load member: {message}": "No se ha podido cargar el cliente: {message}",
  Member: "Cliente",
  Activity: "Actividad",
  "Could not load activity: {message}": "No se ha podido cargar la actividad: {message}",
  "Loading activity…": "Cargando actividad…",
  "No activity recorded yet.": "Aún no hay actividad registrada.",
  "Activity ledger": "Historial de actividad",
  Date: "Fecha",
  Reason: "Motivo",
  Points: "Puntos",
  "{delta} points": "{delta} puntos",
  "Activity pagination": "Paginación de actividad",
  "Previous page": "Página anterior",
  "Next page": "Página siguiente",
  "← Previous": "← Anterior",
  "Next →": "Siguiente →",
  "Page {page} of {totalPages}": "Página {page} de {totalPages}",

  // ── Staff ─────────────────────────────────────────────────────────────
  "Invite team member": "Invitar a alguien al equipo",
  "Owners and managers can invite staff or additional managers.":
    "Los propietarios y responsables pueden invitar a personal o a más responsables.",
  "Email address": "Correo electrónico",
  "colleague@example.com": "compañero@ejemplo.com",
  Role: "Rol",
  Manager: "Responsable",
  "Sending…": "Enviando…",
  "Send invite": "Enviar invitación",
  "Invitation failed": "Error al enviar la invitación",
  "Invite sent to {email}": "Invitación enviada a {email}",
  "Share this token with the invitee - expires {date}.":
    "Comparte este token con la persona invitada, caduca el {date}.",
  "Copy invitation token": "Copiar token de invitación",
  "Team members": "Miembros del equipo",
  "Loading team…": "Cargando equipo…",
  "Could not load users. Only owners and managers can view this page.":
    "No se han podido cargar los usuarios. Solo propietarios y responsables pueden ver esta página.",
  "No team members yet - invite someone above.": "Aún no hay nadie en el equipo, invita a alguien.",
  "Joined {date}": "Se unió el {date}",
  "Role: {role}": "Rol: {role}",
  "Status: {status}": "Estado: {status}",

  // ── Common actions / states ──────────────────────────────────────────
  Save: "Guardar",
  "Save changes": "Guardar cambios",
  Cancel: "Cancelar",
  Add: "Añadir",
  Delete: "Eliminar",
  Remove: "Quitar",
  Edit: "Editar",
  Close: "Cerrar",
  Back: "Volver",
  Next: "Siguiente",
  Continue: "Continuar",
  Confirm: "Confirmar",
  Search: "Buscar",
  Loading: "Cargando",
  "Loading…": "Cargando…",
  Copy: "Copiar",
  Copied: "Copiado",
  "Copied!": "¡Copiado!",
  Download: "Descargar",
  Retry: "Reintentar",
  "Try again": "Inténtalo de nuevo",
  Optional: "Opcional",
  Required: "Obligatorio",
  Yes: "Sí",
  No: "No",

  // ── Marketing landing ────────────────────────────────────────────────
  Primary: "Principal",
  Product: "Producto",
  "How it works": "Cómo funciona",
  Pricing: "Precios",
  "Loyalty in Apple Wallet": "Fidelidad en Apple Wallet",
  "Loyalty cards your customers actually keep.":
    "Tarjetas de fidelidad que tus clientes guardan de verdad.",
  "Lovalte turns paper punch cards into a beautiful pass in Apple Wallet. Design your card, share one QR, and watch repeat visits grow - nothing for customers to install.":
    "Lovalte convierte las tarjetas de papel en un pase bonito en Apple Wallet. Diseña tu tarjeta, comparte un QR y mira cómo crecen las visitas repetidas, sin que tus clientes tengan que instalar nada.",
  "Get started": "Empezar",
  "Get started free": "Empezar gratis",
  "See how it works": "Ver cómo funciona",
  "Already a member?": "¿Ya eres cliente?",
  "Everything you need": "Todo lo que necesitas",
  "A loyalty program your customers love.": "Un programa de fidelidad que tus clientes adoran.",
  "Live in three steps.": "En marcha en tres pasos.",
  "Free to start": "Gratis para empezar",
  "Start your loyalty program.": "Empieza tu programa de fidelidad.",
  "Build your first card today. No customer app, no hardware - just a QR and Apple Wallet.":
    "Crea tu primera tarjeta hoy. Sin app para clientes, sin hardware, solo un QR y Apple Wallet.",
  "© 2026 Lovalte. Loyalty in Apple Wallet.": "© 2026 Lovalte. Fidelidad en Apple Wallet.",

  // ── Auth (sign in / sign up) ─────────────────────────────────────────
  "Sign in": "Iniciar sesión",
  "Welcome back.": "De vuelta.",
  "Business slug (optional)": "Identificador del negocio (opcional)",
  Email: "Correo electrónico",
  Password: "Contraseña",
  "Signing in…": "Iniciando sesión…",
  "Login failed": "Error al iniciar sesión",
  "New here?": "¿Es tu primera vez?",
  "Create a business": "Crear un negocio",
  "Business name": "Nombre del negocio",
  "Business name *": "Nombre del negocio *",
  "Password (min 12 characters)": "Contraseña (mín. 12 caracteres)",
  "Password must be at least 12 characters.": "La contraseña debe tener al menos 12 caracteres.",
  "Creating…": "Creando…",
  "Create business": "Crear negocio",
  "Sign up failed": "Error al crear la cuenta",
  "Already have an account?": "¿Ya tienes cuenta?",
  "Something went wrong. Please try again.": "Algo ha salido mal. Inténtalo de nuevo.",

  // ── Enrollment (public self-enroll) ──────────────────────────────────
  "Setting up your loyalty card…": "Preparando tu tarjeta de fidelidad…",
  "Couldn't set up your card": "No hemos podido preparar tu tarjeta",
  "This enrollment link is invalid or expired.": "Este enlace de alta no es válido o ha caducado.",
  "This enrollment link is missing its code.": "A este enlace de alta le falta el código.",
  "Your loyalty card is ready. Add it to Apple Wallet:":
    "Tu tarjeta de fidelidad está lista. Añádela a Apple Wallet:",
  "Add to Apple Wallet": "Añadir a Apple Wallet",
  "Add to Apple Wallet - downloads your pass": "Añadir a Apple Wallet (descarga tu pase)",
  "On iPhone this opens straight in Wallet. If nothing happens, open this page in Safari.":
    "En iPhone se abre directamente en Wallet. Si no pasa nada, abre esta página en Safari.",
  "You're in! 🎉": "¡Ya estás dentro! 🎉",
  "Your Business": "Tu negocio",
  "your business": "tu negocio",
  "Loyalty card": "Tarjeta de fidelidad",
  "Loyalty card preview for {name}": "Vista previa de la tarjeta de {name}",
  "Loyalty cards in Apple Wallet · lovalte.com":
    "Tarjetas de fidelidad en Apple Wallet · lovalte.com",

  // ── Issue a pass ─────────────────────────────────────────────────────
  "Issue a Wallet Pass": "Emitir una tarjeta de Wallet",
  "Pick a published card, then let customers self-enroll by scanning a QR - each scan creates a unique member automatically. No member IDs to type.":
    "Elige una tarjeta publicada y deja que tus clientes se den de alta escaneando un QR. Cada escaneo crea un cliente único automáticamente, sin teclear ningún ID.",
  "Select a published card…": "Elige una tarjeta publicada…",
  "No published cards yet. Create and publish a card in the builder first.":
    "Aún no tienes tarjetas publicadas. Crea y publica una tarjeta en el editor primero.",
  "Create enrollment QR": "Crear QR de alta",
  "Enrollment QR": "QR de alta",
  "Customers scan this to get their loyalty card":
    "Tus clientes lo escanean para conseguir su tarjeta de fidelidad",
  "Issue one to a walk-in": "Emite una a alguien que entra",
  "Issued pass": "Tarjeta emitida",
  "Issuing…": "Emitiendo…",
  "Pass issued - member {memberId}.": "Tarjeta emitida, cliente {memberId}.",
  "Pass signing isn't fully configured yet (Apple certificate / card icon). Check the card has an icon and the certs are set.":
    "La firma del pase aún no está del todo configurada (certificado de Apple o icono de la tarjeta). Comprueba que la tarjeta tiene icono y que los certificados están puestos.",
  "Add to Apple Wallet - downloads the .pkpass file":
    "Añadir a Apple Wallet (descarga el archivo .pkpass)",

  // ── Card builder ─────────────────────────────────────────────────────
  "Card Builder": "Editor de tarjetas",
  "+ New card": "+ Nueva tarjeta",
  "New card": "Nueva tarjeta",
  "Edit: {name}": "Editando: {name}",
  "Edit template: {name}": "Editar plantilla: {name}",
  "Loading templates…": "Cargando plantillas…",
  "Could not load templates. Please refresh.":
    "No se han podido cargar las plantillas. Actualiza la página.",
  "No templates yet - create your first loyalty card.":
    "Aún no tienes plantillas, crea tu primera tarjeta de fidelidad.",
  "Back to templates list": "Volver a la lista de plantillas",
  "Card settings": "Ajustes de la tarjeta",
  "Card images": "Imágenes de la tarjeta",
  Colors: "Colores",
  "Template name *": "Nombre de la plantilla *",
  "e.g. Summer Campaign": "p. ej. Campaña de verano",
  "Logo text (max 24 chars)": "Texto del logo (máx. 24 caracteres)",
  "Primary field *": "Campo principal *",
  "Primary field label": "Etiqueta del campo principal",
  "Primary field value template": "Plantilla del valor del campo principal",
  "Label (e.g. POINTS)": "Etiqueta (p. ej. PUNTOS)",
  "e.g. LOYALTY": "p. ej. FIDELIDAD",
  "Template (e.g. {{points}})": "Plantilla (p. ej. {{points}})",
  "Points per visit": "Puntos por visita",
  "Reward threshold": "Puntos para la recompensa",
  "Save draft": "Guardar borrador",
  "Save the draft first.": "Guarda primero el borrador.",
  "Draft saved.": "Borrador guardado.",
  "Save failed.": "Error al guardar.",
  "Saving…": "Guardando…",
  Publish: "Publicar",
  "Publish failed.": "Error al publicar.",
  "Published.": "Publicado.",
  "Publishing…": "Publicando…",
  "Confirm publish?": "¿Confirmas la publicación?",
  "Published (v{version}). Saving will create a new draft version.":
    "Publicada (v{version}). Al guardar se creará una nueva versión en borrador.",
  "Processing…": "Procesando…",
  "Live preview": "Vista previa en directo",
  "Preview updates as you type. Actual card appearance may vary with uploaded images.":
    "La vista previa se actualiza mientras escribes. El aspecto real de la tarjeta puede variar según las imágenes que subas.",
  "Shown on the card": "Se muestra en la tarjeta",

  // ── Asset / image fields ─────────────────────────────────────────────
  "Icon *": "Icono *",
  Logo: "Logo",
  Strip: "Banda",
  "Required to publish. Pick a Lucide icon or upload a 29×29 px PNG.":
    "Obligatorio para publicar. Elige un icono de Lucide o sube un PNG de 29×29 px.",
  "Shown top-left on the pass. Upload ≤160×50 px PNG.":
    "Se muestra arriba a la izquierda del pase. Sube un PNG de ≤160×50 px.",
  "Full-width banner. Upload 375×144 px PNG.": "Banner a todo el ancho. Sube un PNG de 375×144 px.",
  "Choose icon": "Elegir icono",
  Upload: "Subir",
  "Uploading…": "Subiendo…",
  "Upload failed.": "Error al subir.",

  // ── Icon picker ──────────────────────────────────────────────────────
  "Choose an icon": "Elige un icono",
  "Close icon picker": "Cerrar selector de iconos",
  "Search icons - e.g. coffee, star, gift": "Busca iconos, p. ej. café, estrella, regalo",
  "Search {n} icons": "Buscar entre {n} iconos",
  "No icons match - try another word.": "Ningún icono coincide, prueba con otra palabra.",
  "Popular icons · {n} in total - search to find any.":
    "Iconos populares · {n} en total, busca para encontrar cualquiera.",
  "Showing {shown} of {total} - keep typing to narrow.":
    "Mostrando {shown} de {total}, sigue escribiendo para afinar.",
  "Could not save icon.": "No se ha podido guardar el icono.",
  "{n} icons.": "{n} iconos.",
  "1 icon.": "1 icono.",

  // ── Analytics ────────────────────────────────────────────────────────
  "Key performance indicators": "Indicadores clave",
  "Unable to load overview data - please refresh or sign in.":
    "No se han podido cargar los datos del resumen. Actualiza la página o inicia sesión.",
  Metric: "Métrica",
  Range: "Periodo",
  "Last {n} days": "Últimos {n} días",
  "{label} over time": "{label} a lo largo del tiempo",
  "{label} preview": "Vista previa de {label}",
  "{label} color": "Color de {label}",
  "No data for this period.": "No hay datos para este periodo.",
  "No {metric} data for this period": "No hay datos de {metric} para este periodo",
  "Failed to load chart data. Please try again.":
    "No se han podido cargar los datos del gráfico. Inténtalo de nuevo.",
  "Loading chart data": "Cargando datos del gráfico",
  "{metric} timeseries line chart": "Gráfico de líneas de {metric} a lo largo del tiempo",
  loading: "cargando",
  none: "ninguno",

  // ── Scan ─────────────────────────────────────────────────────────────
  "Scan a card": "Escanea una tarjeta",
  "Point the camera at a customer's QR code to award or redeem points.":
    "Apunta la cámara al código QR del cliente para sumar o canjear puntos.",
  "Start Camera": "Encender cámara",
  "Stop Camera": "Apagar cámara",
  "Start camera to scan a QR code": "Enciende la cámara para escanear un QR",
  "Stop the camera": "Apagar la cámara",
  "Requesting camera permission…": "Pidiendo permiso de la cámara…",
  "Scanning for QR code…": "Buscando el código QR…",
  "Camera viewfinder": "Visor de la cámara",
  "Hold the customer's card QR inside the frame":
    "Coloca el QR de la tarjeta del cliente dentro del marco",
  "QR detected": "QR detectado",
  "Scanned QR code": "Código QR escaneado",
  "Card detected - award or redeem below.": "Tarjeta detectada, suma o canjea puntos abajo.",
  "Award point": "Sumar punto",
  "Redeem reward": "Canjear recompensa",
  "Award one loyalty point to this member": "Suma un punto de fidelidad a este cliente",
  "Redeem a loyalty reward for this member": "Canjea una recompensa de este cliente",
  "Awarded 1 point!": "¡Punto sumado!",
  "Awarded {n} points!": "¡{n} puntos sumados!",
  "Redeemed 1 point!": "¡1 punto canjeado!",
  "Redeemed {n} points!": "¡{n} puntos canjeados!",
  "Scan again": "Escanear otra vez",
  "Scan failed. Please try again.": "El escaneo ha fallado. Inténtalo de nuevo.",
  "Clear this QR and scan a new code": "Borra este QR y escanea uno nuevo",
  "Camera access was denied. Paste the QR token below to continue.":
    "Se ha denegado el acceso a la cámara. Pega el token del QR abajo para continuar.",
  "QR scanning is not supported in this browser. Paste the QR token below.":
    "Este navegador no admite el escaneo de QR. Pega el token del QR abajo.",
  "QR Token": "Token del QR",
  "QR token": "Token del QR",
  "Paste QR token here": "Pega aquí el token del QR",
  "Could not load cards. Refresh the page.":
    "No se han podido cargar las tarjetas. Actualiza la página.",
  "Loading cards…": "Cargando tarjetas…",

  // ── Landing feature cards + steps (rendered from const arrays) ───────
  "Design your card": "Diseña tu tarjeta",
  "A visual builder - colors, logo, fields and reward rules. Publish a card to Apple Wallet in minutes.":
    "Un editor visual con colores, logo, campos y reglas de puntos. Publica una tarjeta en Apple Wallet en minutos.",
  "One QR to scan": "Un QR para escanear",
  "Staff scan a customer's pass to award or redeem points. No app for them, no extra hardware for you.":
    "Tu equipo escanea el pase del cliente para dar o canjear puntos. Sin app para ellos, sin hardware extra para ti.",
  "See what works": "Mira qué funciona",
  "A live dashboard of members, visits, redemptions and points liability - across every location.":
    "Un panel en tiempo real de clientes, visitas, canjes y puntos emitidos, en todos tus locales.",
  Build: "Crea",
  "Design your loyalty card and set the reward.":
    "Diseña tu tarjeta de fidelidad y define la recompensa.",
  Share: "Comparte",
  "Customers add it to Apple Wallet in one tap.":
    "Tus clientes la añaden a Apple Wallet con un toque.",
  Grow: "Crece",
  "Scan, reward, and watch repeat visits add up.":
    "Escanea, premia y mira cómo se acumulan las visitas.",

  // ── Analytics metric / KPI labels (rendered from const arrays) ───────
  "Points Earned": "Puntos ganados",
  "Points Redeemed": "Puntos canjeados",
  "Passes Issued": "Tarjetas emitidas",
  "Total Members": "Total de clientes",
  "Total Scans": "Total de escaneos",
  "Points Liability": "Saldo de puntos",

  // ── Builder color labels + status badges (rendered dynamically) ──────
  Background: "Fondo",
  "Text color": "Color del texto",
  "Label color": "Color de la etiqueta",
  published: "publicada",
  draft: "borrador",

  // ── Misc ─────────────────────────────────────────────────────────────
  "Add member": "Añadir cliente",
  "← Back": "← Volver",
};
