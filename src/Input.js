import { globals } from "./Globals.js"
import * as THREE from '../lib/node_modules/three/src/Three.js';
import * as util from './util.js';

var scene = new THREE.Scene();

var circleGeometry = new THREE.CircleBufferGeometry(3, 32);
//var circleGeometry = new THREE.LineBufferGeometry(5, 32);
var paintMaterial = new THREE.MeshBasicMaterial({
	side: THREE.DoubleSide,
	});
var circleMesh = new THREE.Mesh( circleGeometry, paintMaterial );

circleMesh.position.set(.5, .5, 0);

scene.add( circleMesh );

function drawCircleToTex(tex, center) {
	var camera = new THREE.OrthographicCamera( 0, tex.get().image.width, tex.get().image.height, 0, -1000, 1000 );

	circleMesh.position.set(center.x, center.y, 0);

	util.renderer.setRenderTarget(tex.renderTargetObj);
	util.renderer.autoClear = false;
	util.renderer.render( scene, camera );
	util.renderer.autoClear = true;
	util.renderer.setRenderTarget(null);
}

document.addEventListener("mousedown", e => {
	document.getElementById("intro").style.display = "none";
});

document.addEventListener("mouseup", e => {
});

document.body.addEventListener("contextmenu", e => {
	e.preventDefault();
	return false;
});

function unproject(x, y, tex) {
	return new THREE.Vector2(x*globals.scale, tex.image.height - 1 - y*globals.scale);
}

function drawLine(p1Projected, p2Projected) {
	const p1 = unproject(p1Projected.x, p1Projected.y, globals.stateTex.get());
	const p2 = unproject(p2Projected.x, p2Projected.y, globals.stateTex.get());
	for(var i = 0; i < 1; i+=0.1/p1.distanceTo(p2)) {
		const p = p1.lerp(p2, i)
		drawCircleToTex(globals.stateTex, p);
	}
}

document.addEventListener("mousemove", e => {
	if((e.buttons & 1) != 0 || (e.buttons & 2) != 0) {
		paintMaterial.color = e.buttons & 1 ? new THREE.Color(1,1,1) : new THREE.Color(0, 0, 0);
		drawLine(new THREE.Vector2(e.x, e.y), new THREE.Vector2(e.x - e.movementX, e.y - e.movementY));
	}
});

var lastTouchPos;

document.addEventListener("touchstart", e => {
	document.getElementById("intro").style.display = "none";
});

document.addEventListener("touchend", e => {
	lastTouchPos = undefined;
});

document.addEventListener("touchmove", e => {
	var t = e.changedTouches[0];
	var pos = new THREE.Vector2(t.clientX, t.clientY);
	if(lastTouchPos === undefined)
		lastTouchPos = pos;
	paintMaterial.color = new THREE.Color(1,1,1);
	drawLine(pos, lastTouchPos);
	lastTouchPos = pos;
});