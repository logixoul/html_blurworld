import * as THREE from 'three';
import { globals } from './Globals';
import * as GpuCompute from './GpuCompute';
import * as ImgProc from './ImageProcessor';
import * as util from './util';

export class PresentationForIashu {
	private readonly compute : GpuCompute.GpuComputeContext;
	private readonly imageProcessor : ImgProc.ImageProcessor;
	constructor(compute : GpuCompute.GpuComputeContext) {
		this.compute = compute;
		this.imageProcessor = new ImgProc.ImageProcessor(compute);
		document.addEventListener("keydown", e => {
			console.log("keydown!!!");
			const char : string = e.code.toLowerCase();
			if(char == 'space')
				this.extrudeForPresentation(globals.stateTex0);
		});
	}



	local_extrude_oneIteration(state : GpuCompute.TextureWrapper, inTex : GpuCompute.TextureWrapper, releaseFirstInputTex : boolean) {
		state = this.imageProcessor.blur(state, 1.0, 1.0, releaseFirstInputTex)!;
		state = this.compute.run([state, inTex], `
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

	extrude_oneIterationForPresentation(state: GpuCompute.TextureWrapper, inTex : GpuCompute.TextureWrapper, releaseFirstInputTex: boolean) {
		state = this.local_extrude_oneIteration(state, inTex, releaseFirstInputTex);
		return this.imageProcessor.mul(state, 1.0 / 1.2, true);
	}

	appendImageToHtml(tex : GpuCompute.TextureWrapper) {
		var oldMagFilter = tex.get().magFilter;
		tex.magFilter = THREE.NearestFilter;
		this.compute.drawToScreen(tex);
		tex.magFilter = oldMagFilter;

		var dataURL = util.renderer.domElement.toDataURL();
		var img = new Image();
		img.src = dataURL;
		document.body.appendChild(img);
	}

	extrudeForPresentation(inTex : GpuCompute.TextureWrapper) {
		var state : GpuCompute.TextureWrapper = this.imageProcessor.cloneTex(inTex)!;
		state = this.compute.run([state], `
			_out.rgb = texture().rgb;
		`, {
			scale: new THREE.Vector2(.3, .3),
			releaseFirstInputTex: true
		})!;
		this.appendImageToHtml(state);
		for(let i = 0; i < 1; i++)
		{
			state = this.extrude_oneIterationForPresentation(state, inTex, true);
		}
		this.appendImageToHtml(this.imageProcessor.mul(state, 1, false));
		for(let i = 0; i < 100; i++)
		{
			state = this.extrude_oneIterationForPresentation(state, inTex, true);
		}
		this.appendImageToHtml(this.imageProcessor.mul(state, 1, false));
	}
}