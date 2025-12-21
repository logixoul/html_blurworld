import * as THREE from 'three';

var mousePos : THREE.Vector2 = new THREE.Vector2(0, 0);

export function getMousePos() : THREE.Vector2 {
	return mousePos;
}

document.addEventListener("mousemove", e => {
	mousePos = new THREE.Vector2(e.clientX, e.clientY);
	console.log("mouse moved: ", mousePos);
});
