import { globals } from "./Globals.js";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

type RenderTargetTexture = {
	get(): THREE.Texture;
	getRenderTarget(): THREE.WebGLRenderTarget;
};

type KeysRegistry = { [key: string]: boolean };

export class Input {
	private renderer : THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private lineGeometry: LineSegmentsGeometry;
	private paintMaterial: LineMaterial;
	private lineSegments: LineSegments2;
	private lastTouchPos: THREE.Vector2 | undefined;
	private lastMousePos: THREE.Vector2 = new THREE.Vector2;
	private keysHeld : KeysRegistry = {};

	get mousePos() : THREE.Vector2 | undefined {
		return this.lastMousePos;
	}

	isKeyHeld(key : string) {
		return this.keysHeld[key];
	}

	constructor(renderer : THREE.WebGLRenderer) {
		this.renderer = renderer;
		this.scene = new THREE.Scene();
		this.lineGeometry = new LineSegmentsGeometry();
		this.lineGeometry.setPositions([0, 0, 0, 0, 0, 0]);
		this.paintMaterial = new LineMaterial({
			color: 0xffffff,
			linewidth: 4,
			worldUnits: false,
			alphaToCoverage: true
		});
		this.lineSegments = new LineSegments2(this.lineGeometry, this.paintMaterial);
		this.scene.add(this.lineSegments);

		document.addEventListener("mousedown", this.onMouseDown);
		document.addEventListener("mousemove", this.onMouseMove);
		document.addEventListener("touchstart", this.onTouchStart);
		document.addEventListener("touchend", this.onTouchEnd);
		document.addEventListener("touchmove", this.onTouchMove);
		document.addEventListener("keydown", this.onKeyDown);
		document.addEventListener("keyup", this.onKeyUp);
		document.body.addEventListener("contextmenu", this.onContextMenu);
	}

	dispose() {
		document.removeEventListener("mousedown", this.onMouseDown);
		document.removeEventListener("mousemove", this.onMouseMove);
		document.removeEventListener("touchstart", this.onTouchStart);
		document.removeEventListener("touchend", this.onTouchEnd);
		document.removeEventListener("touchmove", this.onTouchMove);
		document.removeEventListener("keydown", this.onKeyDown);
		document.removeEventListener("keyup", this.onKeyUp);
		document.body.removeEventListener("contextmenu", this.onContextMenu);
	}

	private drawSegmentToTex(tex: RenderTargetTexture, p1: THREE.Vector2, p2: THREE.Vector2) {
		const image = tex.get().image as { width: number; height: number };
		const camera = new THREE.OrthographicCamera(0, image.width, image.height, 0, -1000, 1000);

		this.paintMaterial.resolution.set(image.width, image.height);
		this.lineGeometry.setPositions([p1.x, p1.y, 0, p2.x, p2.y, 0]);
		this.lineSegments.computeLineDistances();

		this.renderer.setRenderTarget(tex.getRenderTarget());
		this.renderer.autoClear = false;
		this.renderer.render(this.scene, camera);
		this.renderer.autoClear = true;
		this.renderer.setRenderTarget(null);
	}

	private unproject(x: number, y: number, tex: THREE.Texture) {
		const image = tex.image as { height: number };
		return new THREE.Vector2(x * globals.scale, image.height - 1 - y * globals.scale);
	}

	private drawLine(tex: RenderTargetTexture, p1Projected: THREE.Vector2, p2Projected: THREE.Vector2) {
		const p1 = this.unproject(p1Projected.x, p1Projected.y, globals.stateTex0.get());
		const p2 = this.unproject(p2Projected.x, p2Projected.y, globals.stateTex0.get());
		if (p1.distanceTo(p2) < 0.001) {
			const p2Nudged = p2.clone().addScalar(0.01);
			this.drawSegmentToTex(tex, p1, p2Nudged);
			return;
		}
		this.drawSegmentToTex(tex, p1, p2);
	}

	private onMouseDown = (_e: MouseEvent) => {
		document.getElementById("intro")!.style.display = "none";
	};

	private onContextMenu = (e: MouseEvent) => {
		e.preventDefault();
		return false;
	};

	private onMouseMove = (e: MouseEvent) => {
		const newPos = new THREE.Vector2(e.x, e.y);
		const oldPos : THREE.Vector2 = this.lastMousePos ?? newPos;
		const leftBtnPressed = (e.buttons & 1) != 0;
		const rightBtnPressed = (e.buttons & 2) != 0;
		const middleBtnPressed = (e.buttons & 4) != 0;
		if (leftBtnPressed || rightBtnPressed || middleBtnPressed) {
			const shouldErase = rightBtnPressed;
			if (shouldErase) {
				this.paintMaterial.color = new THREE.Color(0, 0, 0);
				this.drawLine(globals.stateTex0, oldPos, newPos);
				this.drawLine(globals.stateTex1, oldPos, newPos);
			} else {
				const destinationTexture = middleBtnPressed ? globals.stateTex1 : globals.stateTex0;
				const erasionTexture = middleBtnPressed ? globals.stateTex0 : globals.stateTex1;
				// first erase from the other texture to avoid smudging
				this.paintMaterial.color = new THREE.Color(0, 0, 0);
				this.drawLine(erasionTexture, oldPos, newPos);
				// then draw to the destination texture
				this.paintMaterial.color = new THREE.Color(1, 1, 1);
				this.drawLine(destinationTexture, oldPos, newPos);
			}
		}
		this.lastMousePos = newPos;
	};

	private onTouchStart = (_e: TouchEvent) => {
		document.getElementById("intro")!.style.display = "none";
	};

	private onTouchEnd = (_e: TouchEvent) => {
		this.lastTouchPos = undefined;
	};

	private onTouchMove = (e: TouchEvent) => {
		const t = e.changedTouches[0];
		if (!t) {
			return;
		}
		const pos = new THREE.Vector2(t.clientX, t.clientY);
		if (this.lastTouchPos === undefined) {
			this.lastTouchPos = pos;
		}
		this.paintMaterial.color = new THREE.Color(1, 1, 1);
		this.drawLine(globals.stateTex0, pos, this.lastTouchPos);
		this.lastTouchPos = pos;
	};

	private onKeyDown = (e: KeyboardEvent) => {
		const char = e.code.toLowerCase();
		this.keysHeld[char] = true;
	};

	private onKeyUp = (e: KeyboardEvent) => {
		const char = e.code.toLowerCase();
		this.keysHeld[char] = false;
	};
}
