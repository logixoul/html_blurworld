import * as THREE from 'three';
import { globals } from './Globals.js';
import { shade2, lx } from './shade';
import * as ImgProc from './ImgProc.js';
import * as util from './util';

export function init() {
    document.addEventListener("keydown", e => {
        console.log("keydown!!!");
        const char : string = e.code.toLowerCase();
        if(char == 'space')
            extrudeForPresentation(globals.stateTex);
    });
}

function mul(inTex : lx.Texture, amount : number, releaseFirstInputTex: boolean) {
    return shade2([inTex],`
		_out.rgb = fetch3() * mul;
	`,
	{
		releaseFirstInputTex: releaseFirstInputTex,
        uniforms: { mul: new THREE.Uniform(amount) }
	}
	)!;
}

function extrude_oneIterationForPresentation(state: lx.Texture, inTex : lx.Texture, releaseFirstInputTex: boolean) {
	state = ImgProc.extrude_oneIteration(state, inTex, releaseFirstInputTex);
	return mul(state, .5, true);
}

function upscale() {

}

function extrudeForPresentation(inTex : lx.Texture) {
	var state : lx.Texture = util.cloneTex(inTex)!;
	state = shade2([state], `
		_out.rgb = fetch3();
	`, {
		scale: new THREE.Vector2(.3, .3),
		releaseFirstInputTex: true
	})!;
	util.saveImage(state);
	for(let i = 0; i < 30; i++)
	{
		state = extrude_oneIterationForPresentation(state, inTex, true);
	}
    util.saveImage(mul(state, 2, false));
	for(let i = 0; i < 30; i++)
	{
		state = extrude_oneIterationForPresentation(state, inTex, true);
	}
	util.saveImage(mul(state, 2, false));
}