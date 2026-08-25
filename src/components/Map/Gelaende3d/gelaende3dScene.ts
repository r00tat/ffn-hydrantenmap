import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { TerrainMesh } from '../../../common/terrain/terrainTypes';
import {
  markerLiftM,
  MAX_PITCH_DEG,
  MIN_PITCH_DEG,
  START_PITCH_DEG,
} from './gelaende3d';
import type { MarkerPlacement, PumpPlacement } from './sceneObjects';
import type { TileGrid } from './terrainTexture';

/**
 * Die three-Szene der 3D-Ansicht.
 *
 * Alles Rechnende liegt in `sceneObjects.ts` und `gelaende3d.ts`; hier steht
 * nur Verdrahtung. Drei Eigenheiten tragen die Ansicht:
 *
 * - **Gerendert wird bei Bedarf**, nicht in einer Dauerschleife. Eine offene,
 *   unbewegte Szene darf auf dem Tablet keinen Akku kosten.
 * - **Der Kontextverlust wird behandelt.** Auf Tablets verliert der Browser den
 *   WebGL-Kontext beim Wechsel in den Hintergrund; unbehandelt bleibt danach
 *   ein schwarzes Bild stehen.
 * - **`dispose()` gibt alles frei.** Ohne das sammelt sich über wenige
 *   Öffnungen so viel WebGL-Speicher an, dass der Kontext stirbt — und es
 *   trifft ausgerechnet den, der die Ansicht oft benutzt.
 */

export interface Gelaende3dScene {
  setMesh(mesh: TerrainMesh): void;
  setTexture(canvas: HTMLCanvasElement, mesh: TerrainMesh, grid: TileGrid): void;
  setMarkers(placements: MarkerPlacement[], widthM: number): void;
  setPumps(placements: PumpPlacement[]): void;
  setPaths(paths: Float32Array[], color: number, widthPx: number): void;
  setContours(
    paths: { heightM: number; points: Float32Array }[],
    colorOf: (heightM: number) => string
  ): void;
  setContoursVisible(visible: boolean): void;
  setExaggeration(factor: number): void;
  /** Azimut der Kamera in Grad, 0 = Blick nach Norden. Für den Nordpfeil. */
  onAzimuth(handler: (deg: number) => void): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createGelaende3dScene(
  canvas: HTMLCanvasElement
): Gelaende3dScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101418);

  const camera = new THREE.PerspectiveCamera(50, 1, 1, 200_000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.minPolarAngle = ((90 - MAX_PITCH_DEG) * Math.PI) / 180;
  controls.maxPolarAngle = ((90 - MIN_PITCH_DEG) * Math.PI) / 180;

  // Streiflicht aus Nordwest — die Richtung, in der Schummerung gelesen wird.
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-1, 1.2, -1);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));

  /** Mesh, Leitungen und Höhenlinien — alles, was die Überhöhung mitmacht. */
  const terrainGroup = new THREE.Group();
  /** Marken; sie werden bei Änderung der Überhöhung neu gesetzt. */
  const markerGroup = new THREE.Group();
  const contourGroup = new THREE.Group();
  const pathGroup = new THREE.Group();
  const pumpGroup = new THREE.Group();
  terrainGroup.add(contourGroup, pathGroup, pumpGroup);
  scene.add(terrainGroup);
  scene.add(markerGroup);

  const disposables: { dispose(): void }[] = [];
  let surface: THREE.Mesh | undefined;
  let exaggeration = 1;
  let liftM = 10;
  let azimuthHandler: ((deg: number) => void) | undefined;
  let frame = 0;
  let alive = true;
  let resolution = new THREE.Vector2(1, 1);

  const requestRender = (): void => {
    if (!alive || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderer.render(scene, camera);
      if (azimuthHandler) {
        azimuthHandler((controls.getAzimuthalAngle() * 180) / Math.PI);
      }
    });
  };

  controls.addEventListener('change', requestRender);

  const onContextLost = (event: Event): void => {
    // Ohne `preventDefault` stellt der Browser den Kontext nie wieder her.
    event.preventDefault();
  };
  const onContextRestored = (): void => {
    renderer.resetState();
    requestRender();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  /**
   * Die Marken auf die aktuelle Überhöhung setzen.
   *
   * Sie hängen nicht im überhöhten Teil der Szene: ein überhöhtes Symbol wäre
   * verzerrt, und der Stiel würde mitwachsen.
   */
  const placeMarkers = (): void => {
    for (const child of markerGroup.children) {
      const placement = child.userData.placement as MarkerPlacement | undefined;
      if (!placement) continue;
      const base = placement.groundM * exaggeration;
      const y = base + liftM;
      if (child instanceof THREE.Sprite) {
        child.position.set(placement.x, y, placement.z);
      } else if (child instanceof THREE.Line) {
        const positions = child.geometry.getAttribute('position');
        positions.setXYZ(0, placement.x, base, placement.z);
        positions.setXYZ(1, placement.x, y, placement.z);
        positions.needsUpdate = true;
      }
    }
  };

  /** Eine Gruppe leeren und ihre Geometrien freigeben. */
  const clearGroup = (group: THREE.Group): void => {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
      }
    });
    group.clear();
  };

  return {
    setMesh(mesh) {
      if (surface) {
        terrainGroup.remove(surface);
        surface.geometry.dispose();
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(mesh.positions, 3)
      );
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({ color: 0xb0b0b0 });
      disposables.push(material);
      surface = new THREE.Mesh(geometry, material);
      terrainGroup.add(surface);

      liftM = markerLiftM(mesh.widthM);

      // Blick von Süden auf die Mitte, in der Startneigung.
      const distance = Math.max(mesh.widthM, mesh.depthM) * 1.1;
      const pitch = (START_PITCH_DEG * Math.PI) / 180;
      camera.position.set(
        0,
        Math.sin(pitch) * distance,
        Math.cos(pitch) * distance
      );
      camera.near = Math.max(1, distance / 1000);
      camera.far = distance * 10;
      camera.updateProjectionMatrix();
      controls.target.set(0, (mesh.minM + mesh.maxM) / 2, 0);
      controls.update();
      requestRender();
    },

    setTexture(texture, mesh, grid) {
      if (!surface) return;
      const map = new THREE.CanvasTexture(texture);
      map.colorSpace = THREE.SRGBColorSpace;
      // Das Kachelbild deckt ein größeres Mercator-Rechteck ab als das Netz.
      // Die UV-Koordinaten kommen deshalb aus der Lage des Netzes **im Bild**,
      // nicht aus dem Gitterindex.
      const uv = new Float32Array(mesh.cols * mesh.rows * 2);
      const texWidth = grid.merc.xMax - grid.merc.xMin;
      const texHeight = grid.merc.yMax - grid.merc.yMin;
      for (let r = 0; r < mesh.rows; r += 1) {
        const my =
          mesh.merc.yMax -
          ((mesh.merc.yMax - mesh.merc.yMin) * r) / (mesh.rows - 1);
        for (let c = 0; c < mesh.cols; c += 1) {
          const mx =
            mesh.merc.xMin +
            ((mesh.merc.xMax - mesh.merc.xMin) * c) / (mesh.cols - 1);
          const i = r * mesh.cols + c;
          uv[i * 2] = (mx - grid.merc.xMin) / texWidth;
          uv[i * 2 + 1] = (my - grid.merc.yMin) / texHeight;
        }
      }
      surface.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const material = new THREE.MeshLambertMaterial({ map });
      disposables.push(material, map);
      surface.material = material;
      requestRender();
    },

    setMarkers(next, widthM) {
      clearGroup(markerGroup);
      liftM = markerLiftM(widthM);
      const stemMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
      disposables.push(stemMaterial);
      for (const placement of next) {
        const map = new THREE.TextureLoader().load(placement.iconUrl, () =>
          requestRender()
        );
        const spriteMaterial = new THREE.SpriteMaterial({
          map,
          // Konstante Bildschirmgröße: eine Marke soll aus jeder Entfernung
          // lesbar bleiben, sonst verschwindet sie im weit gezogenen Ausschnitt.
          sizeAttenuation: false,
          depthTest: false,
        });
        disposables.push(spriteMaterial, map);
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(0.045, 0.045, 1);
        sprite.userData.placement = placement;
        markerGroup.add(sprite);

        // Der Stiel: ohne ihn schwebt oder versinkt das Symbol je nach
        // Blickwinkel, und der Standort ist nicht mehr ablesbar.
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array(6), 3)
        );
        const stem = new THREE.Line(geometry, stemMaterial);
        stem.userData.placement = placement;
        markerGroup.add(stem);
      }
      placeMarkers();
      requestRender();
    },

    setPumps(pumps) {
      // Die Pumpen liegen im überhöhten Teil der Szene: sie gehören zum
      // Gelände, nicht zur Beschriftung, und sollen mit dem Hang wandern.
      clearGroup(pumpGroup);
      if (!pumps.length) return;
      const geometry = new THREE.SphereGeometry(1, 12, 8);
      const material = new THREE.MeshLambertMaterial({ color: 0xff5722 });
      disposables.push(material);
      const radius = Math.max(4, liftM / 3);
      for (const pump of pumps) {
        const sphere = new THREE.Mesh(geometry, material);
        sphere.scale.setScalar(radius);
        sphere.position.set(pump.x, pump.groundM, pump.z);
        pumpGroup.add(sphere);
      }
      requestRender();
    },

    setPaths(paths, color, widthPx) {
      clearGroup(pathGroup);
      if (!paths.length) return;
      const material = new LineMaterial({
        color,
        linewidth: widthPx,
        resolution,
      });
      disposables.push(material);
      for (const path of paths) {
        const geometry = new LineGeometry();
        geometry.setPositions(Array.from(path));
        const line = new Line2(geometry, material);
        line.computeLineDistances();
        pathGroup.add(line);
      }
      requestRender();
    },

    setContours(paths, colorOf) {
      clearGroup(contourGroup);
      for (const path of paths) {
        const material = new LineMaterial({
          color: new THREE.Color(colorOf(path.heightM)).getHex(),
          linewidth: 1,
          resolution,
        });
        disposables.push(material);
        const geometry = new LineGeometry();
        geometry.setPositions(Array.from(path.points));
        contourGroup.add(new Line2(geometry, material));
      }
      requestRender();
    },

    setContoursVisible(visible) {
      contourGroup.visible = visible;
      requestRender();
    },

    setExaggeration(factor) {
      exaggeration = factor;
      terrainGroup.scale.y = factor;
      placeMarkers();
      requestRender();
    },

    onAzimuth(handler) {
      azimuthHandler = handler;
    },

    resize(width, height) {
      // Ein Canvas ohne Fläche — der Dialog ist noch am Aufblenden — würde die
      // Projektionsmatrix mit NaN füllen; danach ist das Bild dauerhaft leer.
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      resolution = new THREE.Vector2(width, height);
      scene.traverse((object) => {
        if (object instanceof Line2) {
          (object.material as LineMaterial).resolution = resolution;
        }
      });
      requestRender();
    },

    dispose() {
      alive = false;
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
        }
      });
      for (const item of disposables) item.dispose();
      disposables.length = 0;
      renderer.dispose();
    },
  };
}
