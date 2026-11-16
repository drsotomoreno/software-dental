import { Link } from 'react-router-dom'
import { LegalDocumentLayout, LegalSection } from '@/components/legal/LegalDocumentLayout'

const CONTACT_EMAIL = 'doctormauriciosoto@gmail.com'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/**
 * Política pública. Debe cargar sin sesión: Google Auth Platform verifica
 * esta URL y el enlace desde la página principal.
 */
export function PrivacyPolicyPage() {
  return (
    <LegalDocumentLayout
      title="Política de Privacidad y Tratamiento de Datos Personales — mihistoriadental.com"
      updated="15 de noviembre de 2026"
    >
      <LegalSection title="1. Responsable del tratamiento">
        <p>
          El responsable del tratamiento de los datos personales recogidos a través de{' '}
          <strong>mihistoriadental.com</strong> es <strong>Doctor SEO Labs S.A.S.</strong>, con
          domicilio en Bucaramanga, Santander, Colombia.
        </p>
        <p>
          Correo de contacto y soporte:{' '}
          <a className="font-semibold text-dental-700 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Marco legal">
        <p>
          Esta política se interpreta conforme a la legislación colombiana, en especial:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Ley 1581 de 2012</strong> y sus decretos reglamentarios, sobre protección de
            datos personales y el derecho de hábeas data.
          </li>
          <li>
            <strong>Resolución 1995 de 1999</strong> del Ministerio de Salud, sobre la historia
            clínica: custodia, reserva, confidencialidad y conservación del registro odontológico.
          </li>
          <li>
            Ley 527 de 1999, en lo relativo a mensajes de datos y firma electrónica de los
            documentos que el profesional suscribe en la plataforma.
          </li>
        </ul>
        <p>
          La historia clínica odontológica es un dato sensible y reservado. El acceso queda limitado
          a la clínica o al profesional tratante que la custodia, y a las personas que la ley
          autorice.
        </p>
      </LegalSection>

      <LegalSection title="3. Datos que tratamos">
        <p>Según el uso del servicio, podemos tratar:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Datos de la cuenta de la clínica o del profesional: nombre, correo, documento de
            identidad, teléfono y datos de suscripción.
          </li>
          <li>
            Datos de pacientes y acudientes que el profesional registra en la historia clínica:
            identificación, contacto, antecedentes, odontograma, evoluciones, consentimientos,
            presupuestos y anexos diagnósticos.
          </li>
          <li>
            Metadatos técnicos necesarios para la seguridad y la sincronización: identificadores de
            sesión, registros de auditoría y marcas de tiempo de firma profesional (ReTHUS).
          </li>
        </ul>
        <p>
          El profesional o la clínica es quien decide qué datos clínicos ingresa y responde por su
          veracidad. mihistoriadental.com actúa como encargado tecnológico de custodia de ese
          registro, bajo las instrucciones del profesional y las obligaciones de reserva de la
          historia clínica.
        </p>
      </LegalSection>

      <LegalSection title="4. Finalidades">
        <ul className="list-disc space-y-2 pl-5">
          <li>Prestar el software de historia clínica odontológica y sus funciones de agenda, RIPS y facturación.</li>
          <li>Autenticar a la clínica, conservar la sesión y sincronizar el registro entre dispositivos autorizados.</li>
          <li>Custodiar adjuntos diagnósticos en la cuenta de Google Drive que la propia clínica vincula.</li>
          <li>Atender soporte, seguridad, auditoría y requerimientos de autoridades competentes.</li>
        </ul>
        <p>
          No vendemos datos personales ni los usamos para publicidad de terceros.
        </p>
      </LegalSection>

      <LegalSection title="5. Integración con Google Drive API">
        <p>
          Cuando una clínica o un profesional vincula su cuenta de Google,{' '}
          <strong>mihistoriadental.com</strong> solicita únicamente el permiso{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-800">
            {DRIVE_FILE_SCOPE}
          </code>
          .
        </p>
        <p>
          Ese permiso se usa solo para <strong>guardar y visualizar</strong> los exámenes
          diagnósticos y escaneos creados por la propia aplicación dentro de la cuenta de Google
          Drive vinculada por cada clínica o profesional. Esos archivos pueden ser, entre otros,{' '}
          <strong>STL, PLY, OBJ, DICOM, imágenes y PDF</strong>.
        </p>
        <p>
          La aplicación <strong>no lee, no modifica y no elimina</strong> otros archivos del Google
          Drive del usuario. Solo opera sobre los archivos que ella misma crea o abre con ese
          alcance limitado. No accede al resto de la unidad, al correo ni a otros productos de
          Google.
        </p>
        <p>
          mihistoriadental.com no vende ni comparte con terceros los datos obtenidos de las API de
          Google. El uso de la información recibida de las API de Google se ajusta a la{' '}
          <a
            className="font-semibold text-dental-700 underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , incluidos los requisitos de uso limitado (Limited Use): los datos se emplean únicamente
          para ofrecer la función visible de almacenamiento y consulta de los adjuntos clínicos que
          la aplicación crea; no se usan para publicidad; no se transfieren a terceros salvo para
          prestar esa función, por seguridad, por obligación legal o con consentimiento del usuario;
          y ninguna persona los lee, salvo que el usuario lo autorice, que sea necesario por
          seguridad o por la ley, o que se trate de datos agregados e internos para operar el
          servicio.
        </p>
        <p>
          El usuario puede revocar el acceso desde la configuración de su cuenta de Google. Al
          revocarlo, la aplicación deja de poder guardar o mostrar nuevos adjuntos en esa unidad.
        </p>
      </LegalSection>

      <LegalSection title="6. Encargados y transferencias">
        <p>
          Los datos se alojan en infraestructura contratada para operar el servicio (servidores y
          base de datos). Los adjuntos diagnósticos que el usuario decide guardar en Drive permanecen
          en la cuenta de Google que él vinculó. No se ceden ni se venden bases de datos de
          pacientes a terceros.
        </p>
        <p>
          Una transferencia o comunicación procede cuando el profesional o la clínica la ordena
          (por ejemplo, exportación RIPS o copia de portabilidad), cuando el titular la autoriza, o
          cuando una autoridad competente la exige conforme a la ley.
        </p>
      </LegalSection>

      <LegalSection title="7. Conservación">
        <p>
          Los datos de la cuenta se conservan mientras la suscripción esté activa y durante el
          tiempo necesario para soporte, facturación y defensa de reclamaciones. La historia clínica
          se conserva por el término de custodia que exigen la Resolución 1995 de 1999 y las demás
          normas sanitarias aplicables, aunque el profesional solicite el cierre de la cuenta. Los
          archivos en Google Drive siguen bajo el control de la cuenta de Google del usuario.
        </p>
      </LegalSection>

      <LegalSection title="8. Derechos de los titulares">
        <p>
          El titular puede conocer, actualizar, rectificar y revocar la autorización, y solicitar la
          supresión de sus datos, cuando la Ley 1581 de 2012 lo permita. La supresión de la historia
          clínica no procede cuando la norma de salud obliga a conservarla.
        </p>
        <p>
          Las solicitudes se atienden en{' '}
          <a className="font-semibold text-dental-700 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . El paciente también puede dirigir su petición a la clínica o al profesional que custodia
          su historia, que es quien mantiene la relación asistencial.
        </p>
        <p>
          Los pacientes menores de 18 años no firman actos que la ley reserva al representante
          legal. En esos casos la plataforma exige la identificación y la firma del acudiente.
        </p>
      </LegalSection>

      <LegalSection title="9. Seguridad">
        <p>
          Aplicamos controles de acceso por clínica, cifrado en tránsito (HTTPS), aislamiento de
          datos entre consultorios y registro de auditoría. Ningún control elimina por completo el
          riesgo; el profesional debe proteger sus credenciales y el acceso a la cuenta de Google
          que vincule.
        </p>
      </LegalSection>

      <LegalSection title="10. Cambios">
        <p>
          Las actualizaciones de esta política se publican en esta misma dirección. El uso del
          servicio después de la publicación implica el conocimiento de la versión vigente.
        </p>
        <p>
          El uso de la plataforma también se rige por las{' '}
          <Link to="/terminos" className="font-semibold text-dental-700 underline">
            Condiciones del Servicio
          </Link>
          .
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  )
}
