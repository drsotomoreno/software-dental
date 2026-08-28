# doctorSEOlabs Historia Dental Dictada por Voz

Software de historias clínicas odontológicas adaptado a la normatividad colombiana: **RIPS**, **Facturación**, **Ley 527** e **Interoperabilidad FHIR**.

## Stack

- **React 19** + **TypeScript**
- **Vite 6** — bundler y dev server
- **Tailwind CSS 3** — estilos utilitarios
- **Dexie.js** — IndexedDB local (offline-first)
- **React Router 7** — navegación SPA

## Inicio rápido

```bash
npm install
npm run dev
```

Abrir [http://localhost:5173](http://localhost:5173)

## Estructura del proyecto

```
src/
├── components/
│   ├── layout/          # TopNavbar, MainLayout
│   ├── odontogram/      # Odontograma 32 dientes × 5 caras
│   ├── clinical/        # Historia clínica (CIE-10, plan, presupuesto)
│   ├── signature/       # Firma digital Ley 527
│   └── agenda/          # Calendario clínico
├── pages/               # Vistas de la aplicación
├── db/                  # Dexie schema e IndexedDB
├── types/               # Modelos TypeScript (FHIR-ready)
├── constants/           # CIE-10, FDI, RIPS
└── utils/               # Hash SHA-256, formato COP
```

## Módulos implementados

| Módulo | Descripción |
|--------|-------------|
| **Navegación** | Barra superior con Nuevo Paciente, Lista, Agenda y menú de usuario |
| **Odontograma** | Grid CSS fijo de 32 dientes, 5 caras (V/M/O/D/L), estados Sano/Caries/Obturado |
| **Historia Clínica** | Diagnóstico CIE-10, hallazgos, plan CUPS, presupuesto COP |
| **Firma Digital** | Canvas táctil + mouse, hash SHA-256, bloqueo inmutable |
| **Agenda** | Vista semanal filtrable por profesional y unidad |

## Normatividad

- **RIPS**: campos de paciente (EPS, régimen, municipio DANE, NIT prestador)
- **Ley 527**: firma digital vinculada a hash del contenido
- **FHIR R4**: tipos preparados para mapeo Patient, Condition, Procedure
- **CUPS**: codificación de procedimientos en plan y precios

## Scripts

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build de producción
npm run preview  # Preview del build
```
