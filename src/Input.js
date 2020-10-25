import { globals } from "./Globals.js"
import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import * as util from './util.js';

var scene = new THREE.Scene();

var circleGeometry = new THREE.CircleBufferGeometry(5, 32);
//var circleGeometry = new THREE.LineBufferGeometry(5, 32);
var paintMaterial = new THREE.MeshBasicMaterial({
	side: THREE.DoubleSide,
	});
var circleMesh = new THREE.Mesh( circleGeometry, paintMaterial );

circleMesh.position.set(.5, .5, 0);

scene.add( circleMesh );

function drawCircleToTex(tex, center) {
	var camera = new THREE.OrthographicCamera( 0, util.unpackTex(tex).image.width, util.unpackTex(tex).image.height, 0, -1000, 1000 );

	circleMesh.position.set(center.x, center.y, 0);

	util.renderer.setRenderTarget(tex);
	util.renderer.autoClear = false;
	util.renderer.render( scene, camera );
	util.renderer.autoClear = true;
	util.renderer.setRenderTarget(null);
}

var isDrawing = false;

document.addEventListener("mousedown", e => {
	isDrawing = true;
});

document.addEventListener("mouseup", e => {
	isDrawing = false;
});

document.body.addEventListener("contextmenu", e => {
	e.preventDefault();
	return false;
});

function unproject(x, y, tex) {
	return new THREE.Vector2(x/4, tex.image.height - 1 - y/4);
}

document.addEventListener("mousemove", e => {
	if(!isDrawing) {
		return;
	}

	paintMaterial.color = e.buttons & 1 ? new THREE.Color(1,1,1) : new THREE.Color(0, 0, 0);
	const p1 = unproject(e.x, e.y, globals.stateTex.texture);
	const p2 = unproject(e.x - e.movementX, e.y - e.movementY, globals.stateTex.texture);
	for(var i = 0; i < 1; i+=1.0/p1.distanceTo(p2)) {
		const p = p1.lerp(p2, i)
		drawCircleToTex(globals.stateTex, p);
	}
});