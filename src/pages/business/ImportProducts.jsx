import { useState } from 'react'
import { ErrorText, Modal } from '../../components/ui'
import { imageUrl, priceLabel } from '../../lib/format'
import { supabase } from '../../lib/supabase'

// Columnas del Excel (fila 1 = encabezados). Se aceptan con o sin tildes / mayúsculas.
const COLUMNS = [
  ['nombre', 'Sí', 'Nombre del producto', 'Pizza hawaiana'],
  ['precio', 'Sí', 'Precio en pesos, sin puntos ni $. Si es por peso: precio por lb o kg', '32000'],
  ['descripcion', 'No', 'Descripción corta', 'Jamón y piña'],
  ['imagen_url', 'No', 'Enlace (URL) de la imagen', 'https://…/foto.jpg'],
  ['seccion', 'No', 'Sección o categoría dentro de tu tienda', 'Pizzas'],
  ['tipo_venta', 'No', '"unidad" o "peso" (por defecto: unidad)', 'unidad'],
  ['unidad_peso', 'Si es por peso', '"lb" o "kg" (por defecto: lb)', 'lb'],
  ['perecedero', 'No', '"si" o "no". Si es "si" y no indicas tipo_venta, se vende por peso', 'no'],
  ['pizza', 'No', '"si" para permitir mitad y mitad (solo restaurantes)', 'si'],
  ['disponible', 'No', '"si" o "no" (por defecto: si)', 'si'],
]

const EXAMPLES = {
  restaurante: [
    { nombre: 'Pizza hawaiana', precio: 32000, descripcion: 'Jamón y piña', imagen_url: '', seccion: 'Pizzas', tipo_venta: 'unidad', unidad_peso: '', perecedero: 'no', pizza: 'si', disponible: 'si' },
    { nombre: 'Pizza pepperoni', precio: 35000, descripcion: 'Doble pepperoni', imagen_url: '', seccion: 'Pizzas', tipo_venta: 'unidad', unidad_peso: '', perecedero: 'no', pizza: 'si', disponible: 'si' },
    { nombre: 'Gaseosa 400 ml', precio: 4000, descripcion: '', imagen_url: '', seccion: 'Bebidas', tipo_venta: 'unidad', unidad_peso: '', perecedero: 'no', pizza: 'no', disponible: 'si' },
  ],
  minimarket: [
    { nombre: 'Papa pastusa', precio: 1800, descripcion: '', imagen_url: '', seccion: 'Tubérculos', tipo_venta: 'peso', unidad_peso: 'lb', perecedero: 'si', pizza: 'no', disponible: 'si' },
    { nombre: 'Tomate chonto', precio: 5200, descripcion: '', imagen_url: '', seccion: 'Verduras', tipo_venta: 'peso', unidad_peso: 'kg', perecedero: 'si', pizza: 'no', disponible: 'si' },
    { nombre: 'Arroz 1 kg', precio: 4500, descripcion: 'Paquete', imagen_url: '', seccion: 'Despensa', tipo_venta: 'unidad', unidad_peso: '', perecedero: 'no', pizza: 'no', disponible: 'si' },
  ],
  tecnologia: [
    { nombre: 'Cargador USB-C 20W', precio: 45000, descripcion: 'Carga rápida', imagen_url: '', seccion: 'Cargadores', tipo_venta: 'unidad', unidad_peso: '', perecedero: 'no', pizza: 'no', disponible: 'si' },
    { nombre: 'Audífonos Bluetooth', precio: 89000, descripcion: '', imagen_url: '', seccion: 'Audio', tipo_venta: 'unidad', unidad_peso: '', perecedero: 'no', pizza: 'no', disponible: 'si' },
  ],
}

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

const yes = (v, def = false) => {
  const s = norm(v)
  if (!s) return def
  return ['si', 's', 'yes', 'y', 'true', '1', 'x'].includes(s)
}

const parsePrice = (v) => {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[$\s]/g, '')
  if (!s) return NaN
  // "32.000" / "1,250,000" -> separadores de miles; "4500,5" -> decimal
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''))
  return Number(s.replace(',', '.'))
}

function toProduct(raw, business) {
  const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [norm(k), v]))
  const errors = []
  const name = String(r.nombre ?? '').trim()
  const price = parsePrice(r.precio)
  if (!name) errors.push('falta nombre')
  if (!Number.isFinite(price) || price < 0) errors.push('precio inválido')

  const perishable = yes(r.perecedero)
  let saleType = norm(r.tipo_venta)
  if (!saleType) saleType = perishable ? 'peso' : 'unidad'
  if (saleType === 'por_peso') saleType = 'peso'
  if (saleType === 'por_unidad') saleType = 'unidad'
  if (!['unidad', 'peso'].includes(saleType)) errors.push('tipo_venta debe ser "unidad" o "peso"')

  let unit = norm(r.unidad_peso).replace('libra', 'lb').replace('kilo', 'kg').replace(/s$/, '')
  if (saleType === 'peso') {
    if (!unit) unit = 'lb'
    if (!['lb', 'kg'].includes(unit)) errors.push('unidad_peso debe ser "lb" o "kg"')
  }

  const img = String(r.imagen_url ?? r.imagen ?? '').trim()
  if (img && !/^https?:\/\//i.test(img)) errors.push('imagen_url debe empezar por http')

  return {
    errors,
    row: {
      business_id: business.id,
      name,
      price,
      description: String(r.descripcion ?? '').trim() || null,
      image_url: imageUrl(img) || null,
      section: String(r.seccion ?? '').trim() || null,
      perishable,
      sale_type: saleType,
      weight_unit: saleType === 'peso' ? unit : null,
      is_pizza: business.category === 'restaurante' && yes(r.pizza),
      available: yes(r.disponible, true),
    },
  }
}

export default function ImportProducts({ business, onClose, onDone }) {
  const [rows, setRows] = useState(null)
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(EXAMPLES[business.category] || EXAMPLES.restaurante, { header: COLUMNS.map((c) => c[0]) })
    ws['!cols'] = COLUMNS.map(([c]) => ({ wch: Math.max(14, c.length + 4) }))
    const help = XLSX.utils.aoa_to_sheet([['columna', 'obligatoria', 'qué poner', 'ejemplo'], ...COLUMNS])
    help['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 70 }, { wch: 22 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'productos')
    XLSX.utils.book_append_sheet(wb, help, 'instrucciones')
    XLSX.writeFile(wb, 'plantilla-productos-tudomi.xlsx')
  }

  const readFile = async (file) => {
    setErr('')
    setResult('')
    setRows(null)
    if (!file) return
    setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer())
      const sheet = wb.Sheets[wb.SheetNames.find((n) => norm(n) === 'productos') || wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' }).filter((r) => Object.values(r).some((v) => String(v).trim() !== ''))
      if (!data.length) return setErr('El archivo no tiene filas con productos.')
      const keys = Object.keys(data[0]).map(norm)
      if (!keys.includes('nombre') || !keys.includes('precio')) return setErr('La primera fila debe tener los encabezados, al menos "nombre" y "precio". Descarga la plantilla.')
      if (data.length > 1000) return setErr('Máximo 1000 productos por archivo.')
      setRows(data.map((r) => toProduct(r, business)))
    } catch (e) {
      setErr(`No se pudo leer el archivo: ${e.message}`)
    }
  }

  const valid = (rows || []).filter((r) => !r.errors.length)
  const invalid = (rows || []).filter((r) => r.errors.length)

  const upload = async () => {
    setBusy(true)
    setErr('')
    let done = 0
    for (let i = 0; i < valid.length; i += 200) {
      const { error } = await supabase.from('products').insert(valid.slice(i, i + 200).map((r) => r.row))
      if (error) {
        setBusy(false)
        return setErr(`Se subieron ${done} productos y luego falló: ${error.message}`)
      }
      done += Math.min(200, valid.length - i)
    }
    setBusy(false)
    setResult(`✔ ${done} productos subidos correctamente.`)
    setRows(null)
    onDone()
  }

  return (
    <Modal title="Subir productos desde Excel" onClose={onClose} wide>
      <div className="note-box">
        <b>📋 Pasos</b>
        <ol className="steps compact">
          <li>
            Descarga la <b>plantilla</b> (ya trae ejemplos y una hoja de instrucciones).
          </li>
          <li>Llénala en Excel o Google Sheets: una fila por producto. No cambies los encabezados de la fila 1.</li>
          <li>Guárdala como <b>.xlsx</b>, <b>.xls</b> o <b>.csv</b>.</li>
          <li>Selecciónala abajo, revisa la vista previa y toca <b>Subir</b>.</li>
        </ol>
        <p className="small muted">Las imágenes van como enlace (URL). Puedes usar enlaces de Google Drive: comparte cada imagen como <b>“Cualquier persona con el enlace”</b> y pega el enlace tal cual. Los productos se agregan a los que ya tienes; no se borra nada.</p>
      </div>

      <button className="btn ghost sm" onClick={downloadTemplate}>
        ⬇️ Descargar plantilla de Excel
      </button>

      <details className="cols-help">
        <summary>Ver columnas del archivo</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Columna</th>
                <th>Obligatoria</th>
                <th>Qué poner</th>
                <th>Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map(([c, req, what, ex]) => (
                <tr key={c}>
                  <td>
                    <code>{c}</code>
                  </td>
                  <td>{req}</td>
                  <td className="wrap">{what}</td>
                  <td>{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <label className="field">
        <span>Archivo de productos</span>
        <input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => readFile(e.target.files[0])} />
      </label>

      <ErrorText>{err}</ErrorText>
      {result && <p className="success">{result}</p>}

      {rows && (
        <>
          <p className="small">
            <b>{fileName}</b>: {valid.length} listos para subir
            {invalid.length > 0 && <span className="error"> · {invalid.length} con errores (no se subirán)</span>}
          </p>
          {invalid.length > 0 && (
            <div className="import-errors">
              {invalid.slice(0, 30).map((r, i) => (
                <div key={i} className="small error">
                  Fila {rows.indexOf(r) + 2} ({r.row.name || 'sin nombre'}): {r.errors.join(', ')}
                </div>
              ))}
            </div>
          )}
          <div className="table-wrap import-preview">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Precio</th>
                  <th>Sección</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {valid.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    <td>{r.row.name}</td>
                    <td>{priceLabel(r.row)}</td>
                    <td>{r.row.section || '—'}</td>
                    <td>
                      {r.row.sale_type === 'peso' ? '⚖️ peso' : '📦 unidad'}
                      {r.row.is_pizza && ' · 🍕'}
                      {!r.row.available && ' · agotado'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {valid.length > 50 && <p className="small muted">… y {valid.length - 50} más</p>}
          </div>
          <button className="btn block pulse" disabled={busy || !valid.length} onClick={upload}>
            {busy ? 'Subiendo…' : `Subir ${valid.length} productos`}
          </button>
        </>
      )}
    </Modal>
  )
}
