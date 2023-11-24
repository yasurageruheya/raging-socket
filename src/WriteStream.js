const {Writable} = require("stream");

class WriteStream extends Writable
{
	constructor()
	{
		super();
		this.buffers = [];
	}

	_write(chunk, encoding, callback) {
		this.buffers.push(chunk);
		callback();
	}

	delete()
	{
		this.buffers.length = 0;
	}
}

module.exports = WriteStream;