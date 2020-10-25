import { globals } from "./Globals.js"
import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import * as util from './util.js';

var scene = new THREE.Scene();

var circleGeometry = new THREE.CircleBufferGeometry(5, 32);
var paintMaterial = new THREE.MeshBasicMaterial({
	side: THREE.DoubleSide,
	//color: '0xffffff'
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

document.addEventListener("mousemove", e => {
	if(!isDrawing) {
		return;
	}

	drawCircleToTex(globals.stateTex, new THREE.Vector2(e.x/4, globals.stateTex.texture.image.height - 1 - e.y/4));


});