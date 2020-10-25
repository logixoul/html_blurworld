import { globals } from "./Globals.js"
import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';

/*var scene = new THREE.Scene();

var screenGeometry = new THREE.CircleBufferGeometry();
var screenMaterial = new THREE.MeshBasicMaterial({
	side: THREE.DoubleSide,
	});
var planeMesh = new THREE.Mesh( screenGeometry, screenMaterial );

planeMesh.position.set(.5, .5, 0);

scene.add( planeMesh );

var camera = new THREE.OrthographicCamera( 0, 1, 0, 1, -1000, 1000 );

function drawCircleToTex(tex) {
	screenMaterial.map = tex;

	renderer.setRenderTarget(null);
	renderer.render( scene, camera );
}*/

var isDrawing = false;

document.addEventListener("mousedown", e => {
	isDrawing = true;
});

document.addEventListener("mouseup", e => {
	isDrawing = true;
});

document.addEventListener("mousemove", e => {
	if(!isDrawing) {
		return;
	}
	globals.stateTex = shade2([globals.stateTex], `
		float f = fetch1();
		if(distance(gl_FragCoord.xy, mousePos) < 10.0f) f = 1.0f;
		_out.r = f;
	`,
	{
		uniforms: {
			mousePos: new THREE.Vector2(e.x/4, globals.stateTex.texture.image.height - 1 - e.y/4)
		},
		disposeFirstInputTex: false
	});
});