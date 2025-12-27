import * as THREE from 'three';
import { globals } from './Globals';
import * as GpuCompute from './GpuCompute';
import * as ImgProc from './ImgProc';
import * as util from './util';

export function init() {
    document.addEventListener("keydown", e => {
        console.log("keydown!!!");
        const char : string = e.code.toLowerCase();
        if(char == 'space')
            extrudeForPresentation(globals.stateTex0);
    });
}

function mul(inTex : GpuCompute.TextureWrapper, amount : number, releaseFirstInputTex: boolean) {
    return GpuCompute.run([inTex],`
		_out.rgb = texture().rgb * mul;
	`,
	{
		releaseFirstInputTex: releaseFirstInputTex,
        uniforms: { mul: new THREE.Uniform(amount) }
	}
	)!;
}

function local_extrude_oneIteration(state : GpuCompute.TextureWrapper, inTex : GpuCompute.TextureWrapper, releaseFirstInputTex : boolean) {
	state = ImgProc.blur(state, 1.0, 1.0, releaseFirstInputTex)!;
	state = GpuCompute.run([state, inTex], `
		float state = texture(tex1).r;
		float binary = texture(tex2).r;
		state *= binary;
		state = .5 * (state + binary);
		_out.r = state;`
		, {
			releaseFirstInputTex: true
		}
		)!;
	return state;
}

function extrude_oneIterationForPresentation(state: GpuCompute.TextureWrapper, inTex : GpuCompute.TextureWrapper, releaseFirstInputTex: boolean) {
	state = local_extrude_oneIteration(state, inTex, releaseFirstInputTex);
	return mul(state, 1.0 / 1.2, true);
}

function extrudeForPresentation(inTex : GpuCompute.TextureWrapper) {
	var state : GpuCompute.TextureWrapper = util.cloneTex(inTex)!;
	state = GpuCompute.run([state], `
		_out.rgb = texture().rgb;
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