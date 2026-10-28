// Campos particulares de cada tipo de negocio. Se guardan en products.details (jsonb) y se muestran al cliente.
// type: text | number | select | multi | check  ·  unit: texto que acompaña al valor al mostrarlo

const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '6', '8', '10', '12', '14', '16', '28', '30', '32', '34', '36', '38', '40', 'Única']
const COLORES = ['Negro', 'Blanco', 'Gris', 'Azul', 'Rojo', 'Verde', 'Amarillo', 'Rosado', 'Beige', 'Café', 'Morado', 'Naranja']

export const AMENIDADES = [
  'WiFi', 'Cocina equipada', 'TV', 'Aire acondicionado', 'Ventilador', 'Agua caliente', 'Lavadora', 'Parqueadero',
  'Piscina', 'Balcón / terraza', 'Ascensor', 'Zona de trabajo', 'Gimnasio', 'Seguridad 24 h', 'Ropa de cama y toallas',
]

export const PRODUCT_FIELDS = {
  restaurante: [
    { key: 'prep_min', label: 'Tiempo de preparación', type: 'number', unit: 'min' },
    { key: 'porcion', label: 'Porción', type: 'text', placeholder: 'Ej: 1 persona, 8 porciones' },
    { key: 'ingredientes', label: 'Ingredientes', type: 'text' },
    { key: 'alergenos', label: 'Alérgenos', type: 'multi', options: ['Gluten', 'Lácteos', 'Huevo', 'Maní', 'Frutos secos', 'Mariscos', 'Soya'] },
    { key: 'picante', label: 'Picante', type: 'select', options: ['No', 'Suave', 'Medio', 'Alto'] },
    { key: 'vegetariano', label: 'Es vegetariano / vegano', type: 'check' },
  ],
  minimarket: [
    { key: 'marca', label: 'Marca', type: 'text' },
    { key: 'presentacion', label: 'Presentación', type: 'text', placeholder: 'Ej: bolsa 500 g, caja x 12' },
    { key: 'origen', label: 'Origen', type: 'text', placeholder: 'Ej: Boyacá' },
    { key: 'vence', label: 'Vida útil', type: 'text', placeholder: 'Ej: 5 días refrigerado' },
  ],
  tecnologia: [
    { key: 'marca', label: 'Marca', type: 'text' },
    { key: 'modelo', label: 'Modelo', type: 'text' },
    { key: 'estado', label: 'Estado', type: 'select', options: ['Nuevo', 'Usado', 'Reacondicionado'] },
    { key: 'color', label: 'Color', type: 'text' },
    { key: 'specs', label: 'Especificaciones', type: 'text', placeholder: 'Ej: 128 GB, 6 GB RAM' },
    { key: 'garantia_meses', label: 'Garantía', type: 'number', unit: 'meses' },
    { key: 'factura', label: 'Incluye factura', type: 'check' },
  ],
  floristeria: [
    { key: 'ocasion', label: 'Ocasión', type: 'multi', options: ['Cumpleaños', 'Aniversario', 'San Valentín', 'Día de la Madre', 'Grados', 'Condolencias', 'Nacimiento', 'Sin ocasión'] },
    { key: 'flores', label: 'Tipo de flores', type: 'text', placeholder: 'Ej: rosas rojas, girasoles' },
    { key: 'unidades', label: 'Cantidad de flores', type: 'number' },
    { key: 'tamano', label: 'Tamaño', type: 'select', options: ['Pequeño', 'Mediano', 'Grande'] },
    { key: 'tarjeta', label: 'Incluye tarjeta con mensaje', type: 'check' },
    { key: 'anticipacion_h', label: 'Anticipación para pedirlo', type: 'number', unit: 'horas' },
  ],
  ferreteria: [
    { key: 'marca', label: 'Marca', type: 'text' },
    { key: 'medida', label: 'Medida / referencia', type: 'text', placeholder: 'Ej: 1/2 pulgada, 6 m' },
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'presentacion', label: 'Presentación', type: 'text', placeholder: 'Ej: caja x 100' },
    { key: 'garantia_meses', label: 'Garantía', type: 'number', unit: 'meses' },
  ],
  tienda: [
    { key: 'marca', label: 'Marca', type: 'text' },
    { key: 'presentacion', label: 'Presentación', type: 'text' },
    { key: 'estado', label: 'Estado', type: 'select', options: ['Nuevo', 'Usado'] },
  ],
  ropa: [
    { key: 'genero', label: 'Para', type: 'select', options: ['Mujer', 'Hombre', 'Niña', 'Niño', 'Unisex'] },
    { key: 'tallas', label: 'Tallas disponibles', type: 'multi', options: TALLAS },
    { key: 'colores', label: 'Colores disponibles', type: 'multi', options: COLORES },
    { key: 'marca', label: 'Marca', type: 'text' },
    { key: 'material', label: 'Material', type: 'text', placeholder: 'Ej: algodón, jean' },
    { key: 'estado', label: 'Estado', type: 'select', options: ['Nuevo', 'Usado'] },
    { key: 'cambios', label: 'Acepta cambios de talla', type: 'check' },
  ],
  taller: [
    { key: 'servicio', label: 'Tipo de servicio', type: 'select', options: ['Mecánica general', 'Latonería y pintura', 'Sistema eléctrico', 'Llantas y alineación', 'Lavado', 'Revisión técnico-mecánica', 'Grúa / asistencia', 'Repuestos', 'Otro'] },
    { key: 'vehiculos', label: 'Vehículos que atiende', type: 'multi', options: ['Moto', 'Carro', 'Camioneta', 'Camión', 'Bicicleta'] },
    { key: 'duracion', label: 'Duración estimada', type: 'text', placeholder: 'Ej: 2 horas' },
    { key: 'repuestos', label: 'Incluye repuestos', type: 'check' },
    { key: 'domicilio', label: 'Servicio a domicilio', type: 'check' },
    { key: 'garantia_dias', label: 'Garantía del servicio', type: 'number', unit: 'días' },
  ],
  alquiler: [
    { key: 'elemento', label: 'Tipo de elemento', type: 'text', placeholder: 'Ej: sillas, carpa, sonido, herramienta' },
    { key: 'cobro', label: 'Se cobra por', type: 'select', options: ['Hora', 'Día', 'Fin de semana', 'Evento'] },
    { key: 'minimo', label: 'Tiempo mínimo de alquiler', type: 'text', placeholder: 'Ej: 1 día' },
    { key: 'existencias', label: 'Unidades disponibles', type: 'number' },
    { key: 'deposito', label: 'Depósito en garantía', type: 'number', unit: 'COP', money: true },
    { key: 'entrega', label: 'Incluye entrega y recogida', type: 'check' },
    { key: 'montaje', label: 'Incluye montaje', type: 'check' },
  ],
  renta_corta: [
    { key: 'alojamiento', label: 'Tipo de alojamiento', type: 'select', options: ['Apartamento completo', 'Apartaestudio', 'Habitación privada', 'Habitación compartida', 'Casa completa', 'Finca / cabaña'] },
    { key: 'zona', label: 'Barrio / zona', type: 'text', placeholder: 'Ej: El Poblado, centro histórico' },
    { key: 'direccion', label: 'Dirección (se comparte al confirmar)', type: 'text' },
    { key: 'huespedes', label: 'Capacidad máxima de huéspedes', type: 'number', unit: 'huéspedes' },
    { key: 'habitaciones', label: 'Habitaciones', type: 'number' },
    { key: 'camas', label: 'Camas', type: 'number' },
    { key: 'banos', label: 'Baños', type: 'number' },
    { key: 'bano_privado', label: 'Baño privado', type: 'check' },
    { key: 'noches_min', label: 'Mínimo de noches', type: 'number', unit: 'noches' },
    { key: 'noches_max', label: 'Máximo de noches', type: 'number', unit: 'noches' },
    { key: 'checkin', label: 'Hora de entrada (check-in)', type: 'text', placeholder: '3:00 pm' },
    { key: 'checkout', label: 'Hora de salida (check-out)', type: 'text', placeholder: '11:00 am' },
    { key: 'limpieza', label: 'Tarifa de limpieza', type: 'number', unit: 'COP', money: true },
    { key: 'deposito', label: 'Depósito en garantía', type: 'number', unit: 'COP', money: true },
    { key: 'amenidades', label: 'Servicios incluidos', type: 'multi', options: AMENIDADES },
    { key: 'mascotas', label: 'Se aceptan mascotas', type: 'check' },
    { key: 'fumar', label: 'Se permite fumar', type: 'check' },
    { key: 'fiestas', label: 'Se permiten fiestas o eventos', type: 'check' },
    { key: 'ninos', label: 'Apto para niños', type: 'check' },
    { key: 'cancelacion', label: 'Política de cancelación', type: 'select', options: ['Flexible (gratis hasta 24 h antes)', 'Moderada (gratis hasta 5 días antes)', 'Estricta (sin reembolso)'] },
    { key: 'reglas', label: 'Reglas de la casa', type: 'text', placeholder: 'Ej: silencio después de las 10 pm' },
  ],
  otro: [
    { key: 'marca', label: 'Marca', type: 'text' },
    { key: 'presentacion', label: 'Presentación / detalle', type: 'text' },
  ],
}

export const fieldsFor = (category) => PRODUCT_FIELDS[category] || PRODUCT_FIELDS.otro

const cop = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n))

// Convierte details en una lista [{label, value}] lista para mostrar (omite lo vacío y los "no")
export function detailRows(category, details) {
  const d = details || {}
  const rows = []
  for (const f of fieldsFor(category)) {
    const v = d[f.key]
    if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue
    let value
    if (f.type === 'check') value = 'Sí'
    else if (f.type === 'multi') value = v.join(', ')
    else if (f.money) value = cop(v)
    else value = f.unit ? `${v} ${f.unit}` : String(v)
    rows.push({ key: f.key, label: f.label, value })
  }
  return rows
}

// Quita vacíos antes de guardar
export function cleanDetails(category, details) {
  const out = {}
  for (const f of fieldsFor(category)) {
    const v = details?.[f.key]
    if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue
    out[f.key] = f.type === 'number' ? Number(v) : v
  }
  return out
}

export const SECTION_HINTS_BY_CATEGORY = {
  restaurante: ['Pizzas', 'Hamburguesas', 'Bebidas', 'Postres', 'Combos'],
  minimarket: ['Verduras', 'Frutas', 'Tubérculos', 'Carnes', 'Lácteos', 'Despensa', 'Aseo', 'Bebidas'],
  tecnologia: ['Celulares', 'Accesorios', 'Audio', 'Computadores', 'Cargadores'],
  floristeria: ['Ramos', 'Arreglos', 'Plantas', 'Cajas de flores', 'Condolencias', 'Complementos'],
  ferreteria: ['Herramientas', 'Tornillería', 'Pinturas', 'Plomería', 'Electricidad', 'Construcción'],
  tienda: ['Hogar', 'Papelería', 'Belleza', 'Juguetes', 'Regalos'],
  ropa: ['Camisetas', 'Pantalones', 'Vestidos', 'Calzado', 'Ropa deportiva', 'Accesorios', 'Infantil'],
  taller: ['Mecánica', 'Latonería', 'Eléctrico', 'Llantas', 'Lavado', 'Repuestos'],
  alquiler: ['Sillas y mesas', 'Carpas', 'Sonido e iluminación', 'Herramientas', 'Decoración'],
  renta_corta: ['Apartamentos', 'Habitaciones', 'Casas', 'Fincas'],
  otro: [],
}
