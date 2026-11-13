import { useEffect, useRef, useState } from 'react'
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { getFileExtension } from '@/utils/diagnosticAidWebClassification'

interface DiagnosticAid3DViewerProps {
  fileName: string
  objectUrl: string
  className?: string
}

function disposeObject(root: Group | Mesh) {
  root.traverse((child) => {
    const mesh = child as Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose())
    } else if (material) {
      material.dispose()
    }
  })
}

export function DiagnosticAid3DViewer({
  fileName,
  objectUrl,
  className = '',
}: DiagnosticAid3DViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !objectUrl) return

    let cancelled = false
    let renderer: WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let animationId = 0
    let loadedRoot: Group | Mesh | null = null

    const scene = new Scene()
    scene.background = new Color(0xf1f5f9)

    const camera = new PerspectiveCamera(45, 1, 0.1, 5000)
    camera.position.set(0, 40, 120)

    const ambient = new AmbientLight(0xffffff, 0.75)
    const key = new DirectionalLight(0xffffff, 0.85)
    key.position.set(80, 120, 60)
    const fill = new DirectionalLight(0xffffff, 0.35)
    fill.position.set(-60, 40, -80)
    scene.add(ambient, key, fill)

    const material = new MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.05,
      roughness: 0.55,
    })

    const fitCameraToObject = (object: Group | Mesh) => {
      const box = new Box3().setFromObject(object)
      const size = box.getSize(new Vector3())
      const center = box.getCenter(new Vector3())
      object.position.sub(center)

      const maxDim = Math.max(size.x, size.y, size.z, 1)
      const distance = maxDim * 2.2
      camera.near = Math.max(distance / 100, 0.01)
      camera.far = distance * 20
      camera.position.set(distance * 0.55, distance * 0.4, distance)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      controls?.target.set(0, 0, 0)
      controls?.update()
    }

    const mountRenderer = () => {
      renderer = new WebGLRenderer({ antialias: true, alpha: false })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      container.appendChild(renderer.domElement)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.08

      const resize = () => {
        if (!renderer || !container) return
        const width = container.clientWidth || 640
        const height = container.clientHeight || 420
        renderer.setSize(width, height, false)
        camera.aspect = width / Math.max(height, 1)
        camera.updateProjectionMatrix()
      }
      resize()
      window.addEventListener('resize', resize)

      const animate = () => {
        if (cancelled) return
        animationId = window.requestAnimationFrame(animate)
        controls?.update()
        renderer?.render(scene, camera)
      }
      animate()

      return () => {
        window.removeEventListener('resize', resize)
      }
    }

    const cleanupResize = mountRenderer()

    const loadMesh = async () => {
      setLoading(true)
      setError(null)
      try {
        const extension = getFileExtension(fileName)
        let object: Group | Mesh

        if (extension === 'stl') {
          const geometry = await new STLLoader().loadAsync(objectUrl)
          geometry.computeVertexNormals()
          object = new Mesh(geometry, material)
        } else if (extension === 'ply') {
          const geometry = await new PLYLoader().loadAsync(objectUrl)
          geometry.computeVertexNormals()
          object = new Mesh(geometry, material)
        } else if (extension === 'obj') {
          object = await new OBJLoader().loadAsync(objectUrl)
          object.traverse((child) => {
            const mesh = child as Mesh
            if (mesh.isMesh) {
              mesh.material = material
            }
          })
        } else {
          throw new Error('Formato 3D no soportado. Use STL, PLY u OBJ.')
        }

        if (cancelled) {
          disposeObject(object)
          return
        }

        loadedRoot = object
        scene.add(object)
        fitCameraToObject(object)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setLoading(false)
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo renderizar el escaneo 3D.',
        )
      }
    }

    void loadMesh()

    return () => {
      cancelled = true
      cleanupResize()
      if (animationId) window.cancelAnimationFrame(animationId)
      controls?.dispose()
      if (loadedRoot) {
        scene.remove(loadedRoot)
        disposeObject(loadedRoot)
      }
      material.dispose()
      if (renderer) {
        renderer.dispose()
        if (renderer.domElement.parentElement === container) {
          container.removeChild(renderer.domElement)
        }
      }
    }
  }, [fileName, objectUrl])

  return (
    <div className={`relative h-full min-h-[420px] w-full overflow-hidden rounded-lg bg-slate-100 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 text-sm font-medium text-slate-600">
          Cargando modelo 3D…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 px-4 text-center text-sm text-red-700">
          {error}
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-[10px] text-slate-500">
        Arrastre para rotar · rueda para zoom
      </p>
    </div>
  )
}
