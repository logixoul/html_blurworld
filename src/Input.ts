import { globals } from "./Globals.js";
import * as THREE from "three";
import * as util from "./util";
import * as KeysHeld from "./KeysHeld";

type RenderTargetTexture = {
	get(): THREE.Texture;
	getRenderTarget(): THREE.WebGLRenderTarget;
};

export class Input {
	private scene: THREE.Scene;
	private circleGeometry: THREE.CircleGeometry;
	private paintMaterial: THREE.MeshBasicMaterial;
	private circleMesh: THREE.Mesh;
	private lastTouchPos: THREE.Vector2 | undefined;

	constructor() {
		this.scene = new THREE.Scene();
		this.circleGeometry = new THREE.CircleGeometry(2, 32);
		//this.circleGeometry = new THREE.LineGeometry(5, 32);
		this.paintMaterial = new THREE.MeshBasicMaterial({
			side: THREE.DoubleSide,
		});
		this.circleMesh = new THREE.Mesh(this.circleGeometry, this.paintMaterial);
		this.circleMesh.position.set(0.5, 0.5, 0);
		this.scene.add(this.circleMesh);

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

	private drawCircleToTex(tex: RenderTargetTexture, center: THREE.Vector2) {
		const image = tex.get().image as { width: number; height: number };
		const camera = new THREE.OrthographicCamera(0, image.width, image.height, 0, -1000, 1000);

		this.circleMesh.position.set(center.x, center.y, 0);

		util.renderer.setRenderTarget(tex.getRenderTarget());
		util.renderer.autoClear = false;
		util.renderer.render(this.scene, camera);
		util.renderer.autoClear = true;
		util.renderer.setRenderTarget(null);
	}

	private unproject(x: number, y: number, tex: THREE.Texture) {
		const image = tex.image as { height: number };
		return new THREE.Vector2(x * globals.scale, image.height - 1 - y * globals.scale);
	}

	private drawLine(tex: RenderTargetTexture, p1Projected: THREE.Vector2, p2Projected: THREE.Vector2) {
		const p1 = this.unproject(p1Projected.x, p1Projected.y, globals.stateTex0.get());
		const p2 = this.unproject(p2Projected.x, p2Projected.y, globals.stateTex0.get());
		for (let i = 0; i < 1; i += 0.1 / p1.distanceTo(p2)) {
			const p = p1.lerp(p2, i);
			this.drawCircleToTex(tex, p);
		}
	}

	private onMouseDown = (_e: MouseEvent) => {
		document.getElementById("intro")!.style.display = "none";
	};

	private onContextMenu = (e: MouseEvent) => {
		e.preventDefault();
		return false;
	};

	private onMouseMove = (e: MouseEvent) => {
		const leftBtnPressed = (e.buttons & 1) != 0;
		const rightBtnPressed = (e.buttons & 2) != 0;
		const middleBtnPressed = (e.buttons & 4) != 0;
		if (leftBtnPressed || rightBtnPressed || middleBtnPressed) {
			const shouldErase = rightBtnPressed;
			const oldPos = new THREE.Vector2(e.x, e.y);
			const newPos = new THREE.Vector2(e.x - e.movementX, e.y - e.movementY);
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
		KeysHeld.global_keysHeld[char] = true;
	};

	private onKeyUp = (e: KeyboardEvent) => {
		const char = e.code.toLowerCase();
		KeysHeld.global_keysHeld[char] = false;
	};
}
