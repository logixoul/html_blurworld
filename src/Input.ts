import { globals } from "./Globals.js";
import * as THREE from "three";
import * as util from "./util";
import * as KeysHeld from "./KeysHeld";

type RenderTargetTexture = {
	get(): THREE.Texture;
	getRenderTarget(): THREE.WebGLRenderTarget;
};

var scene = new THREE.Scene();

var circleGeometry = new THREE.CircleGeometry(2, 32);
//var circleGeometry = new THREE.LineGeometry(5, 32);
var paintMaterial = new THREE.MeshBasicMaterial({
	side: THREE.DoubleSide,
});
var circleMesh = new THREE.Mesh(circleGeometry, paintMaterial);

circleMesh.position.set(0.5, 0.5, 0);

scene.add(circleMesh);

function drawCircleToTex(tex: RenderTargetTexture, center: THREE.Vector2) {
	const image = tex.get().image as { width: number; height: number };
	var camera = new THREE.OrthographicCamera(0, image.width, image.height, 0, -1000, 1000);

	circleMesh.position.set(center.x, center.y, 0);

	util.renderer.setRenderTarget(tex.getRenderTarget());
	util.renderer.autoClear = false;
	util.renderer.render(scene, camera);
	util.renderer.autoClear = true;
	util.renderer.setRenderTarget(null);
}

document.addEventListener("mousedown", (_e: MouseEvent) => {
	document.getElementById("intro")!.style.display = "none";
});

document.addEventListener("mouseup", (_e: MouseEvent) => {
});

document.body.addEventListener("contextmenu", (e: MouseEvent) => {
	e.preventDefault();
	return false;
});

function unproject(x: number, y: number, tex: THREE.Texture) {
	const image = tex.image as { height: number };
	return new THREE.Vector2(x * globals.scale, image.height - 1 - y * globals.scale);
}

function drawLine(tex: RenderTargetTexture, p1Projected: THREE.Vector2, p2Projected: THREE.Vector2) {
	const p1 = unproject(p1Projected.x, p1Projected.y, globals.stateTex0.get());
	const p2 = unproject(p2Projected.x, p2Projected.y, globals.stateTex0.get());
	for (var i = 0; i < 1; i += 0.1 / p1.distanceTo(p2)) {
		const p = p1.lerp(p2, i);
		drawCircleToTex(tex, p);
	}
}

document.addEventListener("mousemove", (e: MouseEvent) => {
	const leftBtnPressed = (e.buttons & 1) != 0;
	const rightBtnPressed = (e.buttons & 2) != 0;
	const middleBtnPressed = (e.buttons & 4) != 0;
	if (leftBtnPressed || rightBtnPressed || middleBtnPressed) {
		const shouldErase = rightBtnPressed;
		const oldPos = new THREE.Vector2(e.x, e.y);
		const newPos = new THREE.Vector2(e.x - e.movementX, e.y - e.movementY);
		if (shouldErase) {
			paintMaterial.color = new THREE.Color(0, 0, 0);
			drawLine(globals.stateTex0, oldPos, newPos);
			drawLine(globals.stateTex1, oldPos, newPos);
		} else {
			const destinationTexture = middleBtnPressed ? globals.stateTex1 : globals.stateTex0;
			const erasionTexture = middleBtnPressed ? globals.stateTex0 : globals.stateTex1;
			// first erase from the other texture to avoid smudging
			paintMaterial.color = new THREE.Color(0, 0, 0);
			drawLine(erasionTexture, oldPos, newPos);
			// then draw to the destination texture
			paintMaterial.color = new THREE.Color(1, 1, 1);
			drawLine(destinationTexture, oldPos, newPos);
		}
	}
});

var lastTouchPos: THREE.Vector2 | undefined;

document.addEventListener("touchstart", (_e: TouchEvent) => {
	document.getElementById("intro")!.style.display = "none";
});

document.addEventListener("touchend", (_e: TouchEvent) => {
	lastTouchPos = undefined;
});

document.addEventListener("touchmove", (e: TouchEvent) => {
	var t = e.changedTouches[0];
	if (!t) {
		return;
	}
	var pos = new THREE.Vector2(t.clientX, t.clientY);
	if (lastTouchPos === undefined) {
		lastTouchPos = pos;
	}
	paintMaterial.color = new THREE.Color(1, 1, 1);
	drawLine(globals.stateTex0, pos, lastTouchPos);
	lastTouchPos = pos;
});

document.addEventListener("keydown", (e: KeyboardEvent) => {
	const char = e.code.toLowerCase();
	KeysHeld.global_keysHeld[char] = true;
});

document.addEventListener("keyup", (e: KeyboardEvent) => {
	const char = e.code.toLowerCase();
	KeysHeld.global_keysHeld[char] = false;
});
