import { Link } from 'react-router-dom'
import { LegalDocumentLayout, LegalSection } from '@/components/legal/LegalDocumentLayout'

const CONTACT_EMAIL = 'doctormauriciosoto@gmail.com'

/**
 * Condiciones públicas del SaaS. Deben cargar sin sesión.
 */
export function TermsOfServicePage() {
  return (
    <LegalDocumentLayout
      title="Condiciones del Servicio — mihistoriadental.com"
      updated="23 de noviembre de 2026"
    >
      <LegalSection title="1. Quién presta el servicio">
        <p>
          <strong>mihistoriadental.com</strong> es un software como servicio (SaaS) de historia
          clínica odontológica operado por <strong>Doctor SEO Labs S.A.S.</strong>, con domicilio
          en Bucaramanga, Santander, Colombia.
        </p>
        <p>
          Contacto:{' '}
          <a className="font-semibold text-dental-700 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          Al crear una cuenta, iniciar sesión o usar la plataforma, la clínica o el profesional
          acepta estas condiciones y la{' '}
          <Link to="/privacidad" className="font-semibold text-dental-700 underline">
            Política de Privacidad
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Alcance del servicio">
        <p>
          El servicio permite a odontólogos y clínicas registrar y consultar la historia clínica
          digital, el odontograma, evoluciones, consentimientos, planes de tratamiento, agenda,
          exportación RIPS y las demás funciones habilitadas según el plan contratado.
        </p>
        <p>
          mihistoriadental.com es una herramienta de registro y gestión. No sustituye el juicio
          clínico del profesional ni constituye un acto de atención en salud por parte de Doctor
          SEO Labs S.A.S. La relación asistencial existe exclusivamente entre el profesional o la
          clínica y el paciente.
        </p>
      </LegalSection>

      <LegalSection title="3. Obligaciones del profesional y de la clínica">
        <p>Quien usa la cuenta se obliga a:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Registrar información clínica veraz, completa y oportuna, y firmar las evoluciones con
            su propia autoría profesional.
          </li>
          <li>
            Custodiar la historia clínica conforme a la Resolución 1995 de 1999 y tratar los datos
            de los pacientes conforme a la Ley 1581 de 2012.
          </li>
          <li>
            Mantener copias de respaldo de sus registros clínicos y comprobar que puede recuperarlos.
            La plataforma ofrece herramientas de sincronización y respaldo; la responsabilidad de
            conservar un archivo íntegro de la historia no se traslada al operador del software.
          </li>
          <li>
            Proteger las credenciales de acceso, no compartirlas y dar de baja a los colaboradores
            que dejen de pertenecer a la clínica.
          </li>
          <li>
            Obtener las autorizaciones y consentimientos que la norma exija antes de registrar o
            tratar datos de pacientes, incluidos los de menores de edad a través de su acudiente.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Adjuntos en Google Drive">
        <p>
          Los exámenes diagnósticos y escaneos (STL, PLY, OBJ, DICOM, imágenes y PDF) que la
          aplicación genera o adjunta pueden almacenarse en la cuenta de Google Drive que la
          clínica o el profesional vincula de forma voluntaria.
        </p>
        <p>
          Esa vinculación usa únicamente el permiso{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-800">
            https://www.googleapis.com/auth/drive.file
          </code>
          . La aplicación guarda y muestra los archivos creados por ella en esa cuenta. No lee, no
          modifica y no elimina el resto de archivos del Drive del usuario. Esos archivos siguen
          siendo del titular de la cuenta de Google; si revoca el permiso o elimina la cuenta,
          puede perder el acceso a los adjuntos desde la plataforma.
        </p>
      </LegalSection>

      <LegalSection title="5. Propiedad intelectual y datos clínicos">
        <p>
          El software, la marca, la interfaz, el código, los textos de la plataforma y la
          documentación son propiedad de Doctor SEO Labs S.A.S. o de sus licenciantes. La
          suscripción concede una licencia limitada, no exclusiva e intransferible para usar el
          servicio durante la vigencia del plan. No está permitido copiar, revender ni descompilar
          la plataforma, salvo lo que la ley permita de forma irrenunciable.
        </p>
        <p>
          Los registros clínicos, las notas y los archivos de pacientes que el profesional carga o
          redacta siguen siendo de la clínica o del profesional tratante y de los titulares de los
          datos, según corresponda. Doctor SEO Labs S.A.S. no adquiere la propiedad de la historia
          clínica por alojarla.
        </p>
      </LegalSection>

      <LegalSection title="6. Cuenta, planes y uso aceptable">
        <p>
          El acceso depende de una cuenta vigente y del plan contratado. El usuario no usará el
          servicio para fines ilícitos, para acceder a historias de otra clínica, ni para cargar
          contenido que no esté autorizado a tratar.
        </p>
        <p>
          Podemos suspender el acceso ante un incumplimiento grave, un riesgo de seguridad o el
          impago, y lo comunicaremos al correo de la cuenta cuando sea posible.
        </p>
      </LegalSection>

      <LegalSection
        id="suscripcion-anual"
        title="7. Suscripción anual, compromiso de permanencia mínima (12 meses) y autorización de débito automático mensual"
      >
        <p>
          Los planes de pago self-serve de <strong>mihistoriadental.com</strong> (incluidos Plan
          Pioneros, Smart y BioniC) se contratan como{' '}
          <strong>suscripción anual con facturación y débito mensual</strong>. El prestador del
          servicio es <strong>DOCTORSEOLABS S.A.S.</strong>, NIT <strong>902127432</strong>,
          operador de la plataforma.
        </p>
        <p>
          <strong>Compromiso de permanencia mínima.</strong> Al adquirir un plan, el titular
          acepta un compromiso mínimo de <strong>doce (12) meses</strong> contados desde la
          activación del pago. Durante ese periodo la suscripción permanece vigente y se
          facturan doce (12) cuotas mensuales sucesivas, salvo acuerdo escrito distinto con
          DOCTORSEOLABS S.A.S.
        </p>
        <p>
          <strong>Autorización de débito automático mensual.</strong> El titular autoriza de forma
          expresa e irrevocable (durante el compromiso mínimo) el cobro recurrente mensual del
          valor del plan contratado a la tarjeta u otro medio de pago registrado ante la pasarela
          Bold Pagos en Línea u otra pasarela habilitada por DOCTORSEOLABS S.A.S. Cada cuota
          corresponde a un mes de servicio; la primera cuota se cobra al contratar y las
          siguientes en la fecha de facturación mensual asociada a la cuenta.
        </p>
        <p>
          <strong>Tratamiento tributario — Excluido de IVA.</strong> Las tarifas publicadas de los
          planes SaaS de mihistoriadental.com se ofrecen como{' '}
          <strong>Excluidas de IVA (0 %)</strong> conforme al{' '}
          <strong>Artículo 476 del Estatuto Tributario</strong> de la República de Colombia, en la
          medida en que aplique a los servicios prestados por DOCTORSEOLABS S.A.S. El monto
          mostrado en el checkout es el valor a debitar sin IVA adicional por este concepto.
        </p>
        <p>
          <strong>Incumplimiento de pago.</strong> La falta de pago de una o más cuotas, el
          rechazo del débito o la revocatoria injustificada del medio de pago durante el
          compromiso mínimo puede generar suspensión del acceso, cargos pendientes y las acciones
          de cobro permitidas por la ley colombiana, sin perjuicio del derecho del titular a
          ejercer los recursos que le asistan.
        </p>
        <p>
          Al marcar la casilla de aceptación en el botón de pagos y completar la transacción, el
          titular declara haber leído esta cláusula, aceptar el compromiso anual de doce (12)
          meses y autorizar el débito mensual automático del plan elegido.
        </p>
      </LegalSection>

      <LegalSection title="8. Disponibilidad">
        <p>
          El servicio se ofrece de forma continua, con ventanas de mantenimiento y la dependencia
          de redes, de la cuenta de Google Drive del usuario y de proveedores de infraestructura.
          No garantizamos una disponibilidad ininterrumpida. El profesional debe conservar respaldos
          de sus registros clínicos.
        </p>
      </LegalSection>

      <LegalSection title="9. Ley aplicable">
        <p>
          Estas condiciones se rigen por las leyes de la República de Colombia. Las controversias
          se someterán a los jueces competentes de Bucaramanga, Santander, sin perjuicio de las
          normas imperativas de protección de datos y de historia clínica.
        </p>
      </LegalSection>

      <LegalSection title="10. Contacto">
        <p>
          DOCTORSEOLABS S.A.S. (NIT 902127432) — mihistoriadental.com — Bucaramanga, Santander,
          Colombia.
        </p>
        <p>
          Correo:{' '}
          <a className="font-semibold text-dental-700 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  )
}
