import * as THREE from 'three';

var mousePos : THREE.Vector2;

export function getMousePos() : THREE.Vector2 {
	return mousePos ?? new THREE.Vector2(0, 0);
}

document.addEventListener("mousemove", e => {
	mousePos = new THREE.Vector2(e.x, e.y);
});
