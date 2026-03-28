import { GpuComputeContext, TextureWrapper } from "./GpuCompute";
import * as THREE from "three"
import { ImageProcessor } from "./ImageProcessor";

export class Debugging {
    imageProcessor : ImageProcessor;
    outputOverrideTexture : TextureWrapper | null = null;
    mousePosNormalized : THREE.Vector2 = new THREE.Vector2(0, 0);

    constructor(private renderer : THREE.WebGLRenderer, private compute : GpuComputeContext) {
        window.addEventListener("mousemove", e=>{
            this.mousePosNormalized.set(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
            //console.log(this.mousePosNormalized)
        });
        this.imageProcessor = new ImageProcessor(this.compute);
    }


    publish(tex : TextureWrapper, applyTo01 : boolean = false) {
        this.outputOverrideTexture = this.imageProcessor.cloneTex(tex);
        this.outputOverrideTexture = this.compute.run(this.outputOverrideTexture, `
            _out = texture();
            `,
            {
                releaseFirstInputTex: true,
                iformat: THREE.RGBAFormat, // for easy download
                itype: THREE.FloatType // for easy download
            }
        );
        if(applyTo01) {
            this.outputOverrideTexture = this.imageProcessor.to01_cut(this.renderer, this.outputOverrideTexture, 0, 100, true);
        }
    }

}

export let debugging : Debugging;
export function init(renderer : THREE.WebGLRenderer, compute : GpuComputeContext) {
    debugging = new Debugging(renderer, compute);
}