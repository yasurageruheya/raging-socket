const sharp = require("sharp");

/**
 *
 * @param {WorkerSub} subWorker
 */
module.exports = async (subWorker)=>
{
	const buffer = Buffer.from(subWorker.vars.buffer);
	const shrinkage = subWorker.vars.shrinkage;
	const sharpedBuffer = sharp(buffer);
	const metadata = await sharpedBuffer.metadata();
	const width = metadata.width * shrinkage;
	const height = metadata.height * shrinkage;

	/** @type {Buffer} */
	const resized = await sharpedBuffer.resize(width, height, {fit: "fill"}).toBuffer();

	subWorker.processFinish(resized.buffer);
}