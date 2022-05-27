import * as THREE from 'three';

let BlockTypes = {
	OLD_HEADER: 0x4D5A5958,
	MAIN:       0x005A5958,
	TABLE:      0x4C425442,
	SCENE:      0x004E4353,
	OBJECT:     0x004A424F,
	GEOMETRY:   0x004F4547,
	BUFFER:     0x00465542,
	META:       0x4154454D,
	PARTITIONS: 0x504E4353
};

for(let i of Object.values(BlockTypes))
	console.log(i);
//todo offset should be a bigNumber? probably not, dataView do not supports it probably.
class Stream {
	constructor(data, offset) {
		this.data = data;
		this.offset = offset;
	}
	uint64()  { let x = this.data.getBigUint64 (this.offset, true); this.offset += 8; return x; }
	uint32()  { let x = this.data.getUint32 (this.offset, true); this.offset += 4; return x; }
	uint16()  { let x = this.data.getUint16 (this.offset, true); this.offset += 2; return x; }
	float32() { let x = this.data.getFloat32(this.offset, true); this.offset += 4; return x; }
	float32Array(n) {
		let r = [];
		for(let i = 0; i < n; i++)
			r.push(this.float32());
		return r;
	}
	string(len) { this.offset += len; }
};

let VertexComponent = {
	0n: { name: "position", components: 3, size: 12, type: 'float' },
	1n: { name: "normal", components: 3, size: 12, type: 'float' },
	2n: { name: "color", components: 1, size: 4, type: 'uint32' },
	3n: { name: "u", components: 1, size: 4, type: 'float' },
	4n: { name: "uv", components: 2, size: 8, type: 'float' },
	35n: { name: "index8", components: 1, size: 1, type: 'uint8' },
	36n: { name: "index16", components: 1, size: 2, type: 'uint16' },
	37n: { name: "index32", components: 1, size: 4, type: 'uint32' },
};


class CommonBlockHeader {
	constructor(stream) {
		this.type = stream.uint32();
		this.id = stream.uint32();
		this.blockSize = stream.uint64();
		//skip the rest of the header.
		stream.offset += 52 - 16; //tot size of the block is 52

	}
}

class DataBlockHeader extends CommonBlockHeader {
	constructor(stream) {
		super(stream);
		this.method = stream.uint16();
		this.uncompressedSize = Number(stream.uint64());
		this.compressedSize   = Number(stream.uint64());
		this.encriptionMethod = stream.uint16();
	}
}

class BufferHeader extends DataBlockHeader {
	constructor(stream) {
		super(stream);
		this.bufferId      = stream.uint64();
		this.elementFormat = stream.uint64();
		this.relatedElementFormat = stream.uint64();
		this.numElements   = stream.uint32();

		this.stride = this.byteSize = this.elementSize(this.elementFormat);
		//save stream.offset to read the actual data? Unfortunately due to alignment problems
		//we sometime needs to make a copy!
		//TODO clean up this and use elementFormat for proper buffers.
		if(this.isIndex(this.elementFormat)) {

			if(this.elementFormat & (1n << 35n))
				this.buffer = new Uint8Array(stream.data.buffer, stream.offset, this.numElements);
			else if (this.elementFormat & (1n << 36n))
				this.buffer = new Uint16Array(stream.data.buffer, stream.offset, this.numElements);
			else {
				if((stream.offset & 0x3) != 0) { //not a multiple of 4  arraybuffers must be memory aligned
					let buffer = new ArrayBuffer(this.numElements * 4);
					new Uint8Array(buffer).set(new Uint8Array(stream.data.buffer, stream.offset, this.numElements*4));
					this.buffer = new Uint32Array(buffer, 0, this.numElements);
				} else {
					this.buffer = new Uint32Array(stream.data.buffer, stream.offset, this.numElements);
				}
			}


		} else {
			if((stream.offset & 0x3) != 0) {
				let buffer = new ArrayBuffer(this.numElements * 24);
				new Uint8Array(buffer).set(new Uint8Array(stream.data.buffer, stream.offset, this.numElements*24));
				this.buffer = new Float32Array(buffer); //new Uint8Array(stream.data.buffer, stream.offset, Number(this.uncompressedSize));
			} else {
				this.buffer = new Float32Array(stream.data.buffer, stream.offset, this.numElements*6);
			}
		}
		this.offset = stream.offset;
		stream.offset += Number(this.uncompressedSize);
	}

	elementSize(format) {
		let size = 0;
		for(let [i, component] of Object.entries(VertexComponent) )
			if((1n<<BigInt(i)) & format)
				size += component.size;
	}
	isIndex(format) {
		return (format & (1n << 35n)) || (format & (1n << 36n)) || (format & (1n << 37n));
	}
}
let GeometryTypes = {
		GT_NONE				: 0,
		GT_TRIANGLE_LIST	: 1,
		GT_POLYGON_LIST		: 2,
		GT_LINE_LIST		: 3,
		GT_TRIANGLE_STRIPS	: 4,
		GT_BOX				: 5,
		GT_SPHERE			: 6,
		GT_CYLINDER			: 7
};

class BoundingBox {
	constructor(stream) {
		this.min = [];
		this.max = [];
		for(let i = 0; i < 3; i++)
			this.min[i] = stream.float32();
		for(let i = 0; i < 3; i++)
			this.max[i] = stream.float32();
	}
}

class GeometryHeader extends CommonBlockHeader {
	constructor(stream) {
		super(stream);
		this.geometryType     = stream.uint16();
		this.geometryId       = stream.uint64();
		this.vertexFormat     = stream.uint64();
		this.numVertexBuffers = stream.uint32();
		this.numIndexBuffers  = stream.uint32();
		this.box = new BoundingBox(stream);
		//for ecah vertex buffer read the vertex format 
		this.vertexBuffers = [];
		for(let i = 0; i < this.numVertexBuffers; i++) {
			let format = stream.uint64();
			let id = stream.uint64();
			this.vertexBuffers.push({ format, id });
		}

		this.indexBuffers = [];
		for(let i = 0; i < this.numIndexBuffers; i++) {
			let format = stream.uint64();
			let id = stream.uint64();
			this.indexBuffers.push({format, id });
		}
	}
}

class ObjectHeader extends CommonBlockHeader {
	constructor(stream) {
		super(stream);
		this.objectType = stream.uint16();
		this.objectId = stream.uint64();
		this.numGeometries = stream.uint32();
		this.box = new BoundingBox(stream);
		stream.offset += 8;

		let len = stream.uint32();
		this.name = stream.string(len+1);
		if(this.objectType != 1) //1 is OT_MESH
			throw "Unsupported object type";
		
		this.geometries = [];
		this.materials = [];
		this.matrices = [];

		for(let i = 0; i < this.numGeometries; i++)
			this.geometries.push(stream.uint64);
		for(let i = 0; i < this.numGeometries; i++)
			this.materials.push(stream.uint64);
		for(let i = 0; i < this.numGeometries; i++)
			this.matrices.push(stream.float32Array(16));
	}
}

class XYZLoader {
	constructor() {
		Object.assign(this, );

		this.blocks = {};
		this.buffers = {};
	}


	async load(url) {
		let offset = BigInt(0);
		let oldHeader = new DataView(await this.read(url, 0, 32));
		console.assert(oldHeader.getUint32(0, true) == 0x4D5A5958);

		offset += BigInt(32);

		let mainHeader = new DataView(await this.read(url, offset, BigInt(76))); 
		let blockTablePosition = mainHeader.getBigUint64(52, true);

		offset += BigInt(76);

		let blockTable = new DataView(await this.read(url, blockTablePosition)); 
//		console.log(blockTable);
//		return;

		//read entire data

		let data = new DataView(await this.read(url, BigInt(0), blockTablePosition));
		let stream = new Stream(data, Number(offset));
		let count = 0;
		while(stream.offset < data.byteLength) {
			let offset = stream.offset;
//TODO! use a factory and get the correct type!
			let block = new CommonBlockHeader(stream);
			console.log({block});
			stream.offset = offset;

			for(let [key, value] of Object.entries(BlockTypes))
				if(value == block.type)
					console.log(key);
			
			switch(block.type) {
			case BlockTypes.BUFFER:
				block = new BufferHeader(stream);
				this.buffers[block.bufferId] = block;
				break;

			case BlockTypes.GEOMETRY:
				block = new GeometryHeader(stream);
				break;

			case BlockTypes.OBJECT:
				block = new ObjectHeader(stream);
				break;

			default:
				if(block.blockSize == 0) throw "DONE?!";
				stream.offset += Number(block.blockSize);
				break;
			}
			
			this.blocks[block.id] = block;

			if(count++ > 1000)
				break;
		}
	}

	async read(url, start, length) {
		let end = length? start + length : '';
		let options = { headers: { range: `bytes=${start}-${end}`, 'Accept-Encoding': 'indentity' } };

		var response = await fetch(url, options);
		if (!response.ok)
			throw "Failed!";
		return await response.arrayBuffer();
	}

	createMesh() {
		this.buildBuffers();

		const geometry = new THREE.BufferGeometry();
		let vertexAttribute = new THREE.InterleavedBuffer(this.vertexBuffer, 6);
		let colorAttribute = new THREE.BufferAttribute(new Uint8Array(this.colorBuffer.buffer), 4, true);

		geometry.setAttribute( 'position', new THREE.InterleavedBufferAttribute( vertexAttribute, 3, 0, false ) );
		geometry.setAttribute( 'normal', new THREE.InterleavedBufferAttribute( vertexAttribute, 3, 3, true ) );
		geometry.setAttribute( 'color', colorAttribute, 4);
		geometry.setIndex( new THREE.BufferAttribute(this.indexBuffer, 1 ));

		const material = new THREE.MeshPhongMaterial( {
			side: THREE.DoubleSide,
//to be added back with colors
			vertexColors: true
		} );

		let mesh = new THREE.Mesh( geometry, material );
		return mesh;
	}

	buildBuffers() {
		let vertexSize = 0;
		let indexSize = 0;

		for(let block of Object.values(this.blocks)) {
			if(block.type != BlockTypes.GEOMETRY) 
				continue;

			for(let {format, id} of block.vertexBuffers)
				vertexSize += this.buffers[id].numElements;

			for(let {format, id} of block.indexBuffers)
				indexSize += this.buffers[id].numElements;
		}

		this.vertexBuffer = new Float32Array(vertexSize*6);
		this.indexBuffer = new Uint32Array(indexSize);
		this.colorBuffer = new Uint32Array(vertexSize);

		let vertexCount = 0;
		let vertexOffset = 0;
		let indexCount = 0;
		let geometryId = 0;
		for(let block of Object.values(this.blocks)) {
			if(block.type != BlockTypes.GEOMETRY) 
				continue;

			for(let {format, id} of block.indexBuffers) {
				let buffer = this.buffers[id];
				
				for(let i of buffer.buffer)
					this.indexBuffer[indexCount++] = i + vertexCount;
			}


			for(let {format, id} of block.vertexBuffers) {
				let buffer = this.buffers[id];
				this.vertexBuffer.set(buffer.buffer, vertexOffset, buffer.numElements*6);
				for(let i = 0; i < buffer.numElements; i++)
					this.colorBuffer[i+vertexOffset/6] = geometryId;

				vertexOffset += buffer.numElements*6;
				vertexCount += buffer.numElements;
			}
			geometryId++;
		}
	}
};

export { XYZLoader }

