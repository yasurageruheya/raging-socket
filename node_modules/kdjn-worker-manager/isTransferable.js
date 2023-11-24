const {MessagePort} = require("worker_threads");
/**
 *
 * @param {any} data
 * @return {boolean}
 */
module.exports = (data)=>
{
	return (
		data instanceof ArrayBuffer ||
		data instanceof MessagePort ||
		(typeof data === "object" && data !== null && data.constructor.name === "ImageBitmap")
	)
}