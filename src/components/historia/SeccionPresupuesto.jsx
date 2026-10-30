import React from 'react';
import { Printer, FileText } from 'lucide-react';

/**
 * Sección 8 — Presupuesto odontológico imprimible (A4).
 * Encabezado: titular de la cuenta (accountHolder).
 * Cuerpo: dirigido al paciente (patient).
 */
export const SeccionPresupuesto = ({
  accountHolder = {
    nombre: 'Dr. Elias Mauricio Soto Moreno',
    titulo: 'Especialista en Ortodoncia, Estética & Implantología',
    reps: '6800103898-01',
    identificacion: 'CC 79.904.620',
    direccion: 'Carrera 33 # 37-31, Consultorio 201',
    ciudad: 'Bucaramanga, Santander',
    telefono: '+57 318 7080343',
    email: 'doctormauriciosoto@gmail.com',
    clinica: 'Clínica Dental Dr. Mauricio Soto',
  },
  patient = {
    nombreCompleto: 'Carlos Alberto Mendoza',
    documento: '1.098.765.432',
    telefono: '+57 300 1234567',
    email: 'paciente@email.com',
    numeroHistoria: 'HC-79904620-042',
  },
  presupuesto = {
    numero: 'PRE-2026-0089',
    fecha: '30/10/2026',
    vigenciaDias: 30,
    items: [
      {
        id: 1,
        cup: '890201',
        detalle: 'Diseño de Sonrisa Digital (CAD/CAM Direct Print)',
        cant: 1,
        valorUnitario: 1200000,
        descuento: 0,
      },
      {
        id: 2,
        cup: '890202',
        detalle: 'Carillas Estéticas 3D de alta definición (Arco Superior)',
        cant: 6,
        valorUnitario: 850000,
        descuento: 300000,
      },
      {
        id: 3,
        cup: '890205',
        detalle: 'Higienización y Pulido Ultrasónico Pre-tratamiento',
        cant: 1,
        valorUnitario: 250000,
        descuento: 50000,
      },
    ],
    observaciones:
      'Presupuesto incluye controles de adaptación durante 90 días poscementación. Forma de pago: 50% al iniciar el procedimiento y 50% contra entrega final.',
  },
}) => {
  const handlePrint = () => {
    window.print();
  };

  const subtotal = presupuesto.items.reduce(
    (acc, item) => acc + item.cant * item.valorUnitario,
    0,
  );
  const totalDescuentos = presupuesto.items.reduce(
    (acc, item) => acc + (item.descuento || 0),
    0,
  );
  const totalNeto = subtotal - totalDescuentos;

  const formatCOP = (val) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="seccion-presupuesto w-full max-w-5xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen">
      <style>{`
        @media print {
          /* Ocultar elementos de navegación y UI interactiva */
          .no-print,
          nav,
          aside,
          header:not(.printable-card header),
          footer,
          button {
            display: none !important;
          }
          /* Resetear fondos y forzar impresión exacta de colores Tailwind */
          body, html {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Ajustar tarjeta contenedora para hojas A4 */
          .printable-card {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          /* Definición de la página de impresión */
          @page {
            size: A4 portrait;
            margin: 12mm 15mm 12mm 15mm;
          }
        }
      `}</style>

      {/* Barra de acciones (oculta al imprimir) */}
      <div className="no-print mb-6 flex flex-wrap justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" /> Presupuesto Odontológico
          </h2>
          <p className="text-xs text-slate-500">
            Módulo de Cotizaciones | Historia clínica Nº {patient.numeroHistoria}
          </p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimir</span>
        </button>
      </div>

      {/* Documento imprimible */}
      <div className="printable-card bg-white rounded-2xl border border-slate-200 shadow-xl p-8 md:p-12 text-slate-800 transition-all">
        {/* Encabezado — titular de la cuenta */}
        <header className="border-b-2 border-slate-900 pb-6 mb-8 flex justify-between items-start flex-wrap gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold tracking-widest text-indigo-600 uppercase">
              SaaS MiHistoriaDental
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900">
              {accountHolder.clinica}
            </h1>
            <p className="text-sm font-semibold text-slate-700">{accountHolder.nombre}</p>
            <p className="text-xs text-slate-500">{accountHolder.titulo}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
              <span>
                <strong>NIT/CC:</strong> {accountHolder.identificacion}
              </span>
              <span>
                <strong>Código REPS:</strong> {accountHolder.reps}
              </span>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-700">{accountHolder.direccion}</p>
            <p>{accountHolder.ciudad}</p>
            <p>Tel: {accountHolder.telefono}</p>
            <p>{accountHolder.email}</p>
          </div>
        </header>

        {/* Dirigido al paciente + metadatos del presupuesto */}
        <div className="print-flat grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-slate-50 rounded-xl p-5 border border-slate-200">
          <div>
            <span className="text-xs uppercase tracking-wider font-bold text-slate-400 block mb-2">
              Dirigido a (Paciente)
            </span>
            <p className="text-base font-bold text-slate-900">{patient.nombreCompleto}</p>
            <div className="text-xs text-slate-600 space-y-0.5 mt-1">
              <p>
                <strong>Identificación:</strong> {patient.documento}
              </p>
              <p>
                <strong>Nº Historia Clínica:</strong> {patient.numeroHistoria}
              </p>
              <p>
                <strong>Teléfono:</strong> {patient.telefono}
              </p>
              {patient.email ? (
                <p>
                  <strong>Email:</strong> {patient.email}
                </p>
              ) : null}
            </div>
          </div>
          <div className="md:border-l md:border-slate-200 md:pl-6 flex flex-col justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-slate-400 block mb-2">
                Detalles de la Cotización
              </span>
              <div className="text-xs text-slate-600 space-y-1">
                <p className="flex justify-between">
                  <span>Presupuesto N°:</span>{' '}
                  <strong className="text-indigo-600">{presupuesto.numero}</strong>
                </p>
                <p className="flex justify-between">
                  <span>Fecha de Emisión:</span> <strong>{presupuesto.fecha}</strong>
                </p>
                <p className="flex justify-between">
                  <span>Vigencia:</span>{' '}
                  <strong>{presupuesto.vigenciaDias} días calendario</strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla de procedimientos */}
        <div className="mb-8 overflow-hidden rounded-lg border border-slate-200 print-flat">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-semibold">
                <th className="py-3 px-4">CÓD / CUP</th>
                <th className="py-3 px-4">DESCRIPCIÓN DEL PROCEDIMIENTO</th>
                <th className="py-3 px-4 text-center">CANT.</th>
                <th className="py-3 px-4 text-right">VALOR UNIT.</th>
                <th className="py-3 px-4 text-right">DESC.</th>
                <th className="py-3 px-4 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {presupuesto.items.map((item, idx) => {
                const totalItem =
                  item.cant * item.valorUnitario - (item.descuento || 0);
                return (
                  <tr
                    key={item.id || idx}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                  >
                    <td className="py-3 px-4 font-mono text-slate-500">{item.cup}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {item.detalle}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold">{item.cant}</td>
                    <td className="py-3 px-4 text-right">
                      {formatCOP(item.valorUnitario)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600">
                      {item.descuento > 0 ? `- ${formatCOP(item.descuento)}` : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {formatCOP(totalItem)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totales y observaciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start mb-12">
          <div className="print-flat bg-slate-50 rounded-xl p-4 border border-slate-200">
            <span className="text-xs font-bold text-slate-700 uppercase block mb-1">
              Notas y Condiciones
            </span>
            <p className="text-xs text-slate-600 leading-relaxed">
              {presupuesto.observaciones}
            </p>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 px-3 text-slate-600">
              <span>Subtotal:</span>
              <span className="font-semibold">{formatCOP(subtotal)}</span>
            </div>
            {totalDescuentos > 0 && (
              <div className="flex justify-between py-1.5 px-3 text-emerald-600 font-medium">
                <span>Descuento aplicado:</span>
                <span>- {formatCOP(totalDescuentos)}</span>
              </div>
            )}
            <div className="print-flat flex justify-between py-3 px-4 bg-indigo-50 border border-indigo-200 text-indigo-950 rounded-xl font-bold text-base">
              <span>TOTAL INVERSIÓN:</span>
              <span className="text-indigo-700 text-lg">{formatCOP(totalNeto)}</span>
            </div>
          </div>
        </div>

        {/* Firmas */}
        <div className="pt-12 border-t border-slate-200 grid grid-cols-2 gap-12 text-center text-xs text-slate-500">
          <div>
            <div className="border-b border-slate-400 w-48 mx-auto mb-2 h-12" />
            <p className="font-semibold text-slate-800">{accountHolder.nombre}</p>
            <p>Firma Profesional / Odontólogo</p>
          </div>
          <div>
            <div className="border-b border-slate-400 w-48 mx-auto mb-2 h-12" />
            <p className="font-semibold text-slate-800">{patient.nombreCompleto}</p>
            <p>Aceptado Paciente / Acudiente</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeccionPresupuesto;
