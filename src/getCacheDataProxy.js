const fs = require("fs");
const path = require("path");
const {read} = require("fs-extra");
const _root = path.join(__dirname, "../");

/**
 *
 * @param {object} target
 * @param {string} directoryName
 * @param {function(property:string, value:any):void} [setterCallback]
 * @param {WriteFileOptions} [encoding=null] encoding を省略、もしくは null を代入すると、戻り値の Promise からは Buffer が得られる
 * @return {Object.<string|Buffer|Promise<string|Buffer>>}
 */
module.exports = (target, directoryName, encoding=null, setterCallback)=>
{
	const cacheDir = path.join(_root, directoryName);

	const handler = {};
	/** @type {Promise<*>} */
	let reading = null;

	handler.set = (target, property, value, receiver)=>
	{
		if(target[property] !== value)
		{
			target[property] = value;
			if(setterCallback) setterCallback(property, value);
			fs.writeFile(path.join(cacheDir, property), value, encoding, (error)=>
			{
				if(error) throw error;
			});
		}
	}

	handler.get = (target, property, receiver)=>
	{
		if(reading) return reading;

		reading = new Promise(resolve =>
		{
			if(typeof target[property] !== "undefined")
			{
				reading = null;
				resolve(target[property]);
			}
			else
			{
				fs.readFile(path.join(cacheDir, property), encoding, (error, data)=>
				{
					if(error) resolve(null);
					else
					{
						target[property] = data;
						if(setterCallback) setterCallback(property, data);
						resolve(data);
					}
					reading = null;
				})
			}
		});
		return reading;
	}
	return new Proxy(target, handler);
}