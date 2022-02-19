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

function local_extrude_oneIteration(state : lx.Texture, inTex : lx.Texture, releaseFirstInputTex : boolean) {
	state = ImgProc.blur(state, 1.0, releaseFirstInputTex)!;
	state = shade2([state, inTex], `
		float state = fetch1(tex1);
		float binary = fetch1(tex2);
		state *= binary;
		state = .5 * (state + binary);
		_out.r = state;`
		, {
			releaseFirstInputTex: true
		}
		)!;
	return state;
}

function extrude_oneIterationForPresentation(state: lx.Texture, inTex : lx.Texture, releaseFirstInputTex: boolean) {
	state = local_extrude_oneIteration(state, inTex, releaseFirstInputTex);
	return mul(state, 1.0 / 1.2, true);
}

function extrudeForPresentation(inTex : lx.Texture) {
	var state : lx.Texture = util.cloneTex(inTex)!;
	state = shade2([state], `
		_out.rgb = fetch3();
	`, {
		scale: new THREE.Vector2(.3, .3),
		releaseFirstInputTex: true
	})!;
	util.appendImageToHtml(state);
	for(let i = 0; i < 1; i++)
	{
		state = extrude_oneIterationForPresentation(state, inTex, true);
	}
    util.appendImageToHtml(mul(state, 1, false));
	for(let i = 0; i < 100; i++)
	{
		state = extrude_oneIterationForPresentation(state, inTex, true);
	}
	util.appendImageToHtml(mul(state, 1, false));
}