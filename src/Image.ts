type WritableArrayLike = {
	length: number;
	[index: number]: number;
};

type ArrayType<T extends WritableArrayLike> = {
	new (length: number): T;
};

export class Image<T extends WritableArrayLike = WritableArrayLike> {
	data: T;
	width: number;
	height: number;

	constructor(width: number, height: number, arrayType: ArrayType<T>) {
		this.width = width;
		this.height = height;
		this.data = new arrayType(width * height);
	}

	forEach(callback: (x: number, y: number) => void): void {
		for (var x = 0; x < this.width; x++) {
			for (var y = 0; y < this.height; y++) {
				callback(x, y);
			}
		}
	}

	get(x: number, y: number): number {
		return this.data[x + y * this.width];
	}

	set(x: number, y: number, val: number): void {
		this.data[x + y * this.width] = val;
	}
}
